import test from 'node:test';import assert from 'node:assert/strict';
import {createPublicHarness} from './public-harness.js';
import {validatePublicConfig} from '../src/public/config.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('公开 Worker：官方 SDK 经 OAuth 与 Streamable HTTP 初始化、发现、读取和写入',async t=>{
 const h=await createPublicHarness(),client=new Client({name:'Public generic SDK fixture',version:'1.0.0'});
 t.after(async()=>{await client.close();await h.dispose();});
 const ai=await h.authorize('A',{clientName:'Generic SDK test client'}),methods=[];
 const transport=new StreamableHTTPClientTransport(new URL(h.base+'/mcp'),{
  requestInit:{headers:{Authorization:'Bearer '+ai.access_token}},
  fetch:async(url,init)=>{
   if(typeof init?.body==='string'){const message=JSON.parse(init.body);methods.push(message.method);}
   return h.call(String(url),init);
  },
 });
 await client.connect(transport);
 const {tools}=await client.listTools();
 assert.deepEqual(tools.map(tool=>tool.name),['list_items','get_project','create_item','update_project','get_item','update_item','set_item_completion','delete_item','convert_note','ping']);
 assert.equal(tools.find(tool=>tool.name==='list_items').annotations.readOnlyHint,true);
 assert.equal(tools.find(tool=>tool.name==='create_item').annotations.readOnlyHint,false);
 const created=await client.callTool({name:'create_item',arguments:{requestId:'sdk-public-create',type:'todo',title:'SDK隔离待办'}});
 assert.notEqual(created.isError,true);const record=created.structuredContent;
 const updated=await client.callTool({name:'update_item',arguments:{id:record.item.id,expectedVersion:record.version,requestId:'sdk-public-edit',fields:{title:'SDK确认后修改'}}});
 assert.equal(updated.structuredContent.version,2);
 const read=await client.callTool({name:'get_item',arguments:{id:record.item.id}});
 assert.equal(read.structuredContent.item.title,'SDK确认后修改');
 const listed=await client.callTool({name:'list_items',arguments:{}});assert.equal(listed.structuredContent.items[0].item.id,record.item.id);
 assert.deepEqual(methods.slice(0,3),['initialize','notifications/initialized','tools/list']);
 assert.equal(methods.filter(method=>method==='tools/call').length,4);
 const browser=await(await h.call('/api/items',{headers:h.browserHeaders('A')})).json();
 assert.equal(browser.items[0].item.id,record.item.id);assert.equal(browser.items[0].version,2);
});

test('公开 Worker：真实JWT验签、A/B空间、MCP读写幂等、撤销与邮箱身份边界',async t=>{
 const h=await createPublicHarness();t.after(()=>h.dispose());
 assert.equal((await h.call('/health')).status,200);
 assert.equal((await h.call('/api/account')).status,401);
 for(const overrides of [{iss:'https://other.clerk.accounts.dev'},{azp:'https://evil.test'},{exp:Math.floor(Date.now()/1000)-1},{sub:'user_PublicB:other'}])assert.equal((await h.call('/api/account',{headers:h.browserHeaders('A',overrides)})).status,401);
 const unverified=await h.call('/api/account',{headers:h.browserHeaders('unverified')});assert.equal(unverified.status,403,await unverified.text());
 const a=await(await h.call('/api/account',{headers:h.browserHeaders('A')})).json();assert.deepEqual(a,{id:'user_PublicA',email:'a@example.invalid'});
 const aAgain=await(await h.call('/api/account',{headers:h.browserHeaders('A')})).json();assert.deepEqual(aAgain,a);
 const b=await(await h.call('/api/account',{headers:h.browserHeaders('B')})).json();assert.equal(b.id,'user_PublicB');
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM public_accounts').first()).n,2);
 const unauth=await h.call('/mcp',{method:'POST',body:'{}'});assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate'),/oauth-protected-resource/);
 const meta=await(await h.call('/.well-known/oauth-protected-resource')).json();assert.equal(meta.resource,h.base);
 const cancelled=await h.authorize('A',{cancel:true});assert.equal(cancelled.destination.searchParams.get('error'),'access_denied');assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM workbench_items').first()).n,0);
 const ai=await h.authorize('A',{clientName:'A Test AI'});
 const created=await h.mcp(ai,'create_item',{requestId:'public-a-create',type:'todo',title:'A隔离待办'});assert.equal(created.response.status,200);assert.equal(created.body.result.isError,undefined);const record=created.body.result.structuredContent;
 const again=await h.mcp(ai,'create_item',{requestId:'public-a-create',type:'todo',title:'A隔离待办'});assert.deepEqual(again.body.result.structuredContent,record);
 const listA=await h.mcp(ai,'list_items');assert.equal(listA.body.result.structuredContent.items.length,1);
 const browserA=await(await h.call('/api/items',{headers:h.browserHeaders('A')})).json();assert.equal(browserA.items[0].item.id,record.item.id);
 const changes=await(await h.call('/api/changes?since=0',{headers:h.browserHeaders('A')})).json();assert.equal(changes.changes[0].id,record.item.id);
 const listB=await(await h.call('/api/items',{headers:h.browserHeaders('B')})).json();assert.equal(listB.items.length,0);
 assert.equal((await h.call('/api/items/'+record.item.id,{headers:h.browserHeaders('B')})).status,404);
 assert.equal((await h.call('/api/items/'+record.item.id,{method:'PATCH',headers:h.browserHeaders('B'),body:JSON.stringify({requestId:'b-forbidden-edit',expectedVersion:1,fields:{title:'B不可改'}})})).status,404);
 const bAi=await h.authorize('B');
 assert.equal((await h.mcp(bAi,'list_items')).body.result.structuredContent.items.length,0);
 for(const [name,args] of [['get_item',{id:record.item.id}],['update_item',{id:record.item.id,expectedVersion:1,requestId:'b-ai-forbidden',fields:{title:'B AI不可改'}}]]){
  const denied=await h.mcp(bAi,name,args);assert.equal(denied.body.result.isError,true);assert.match(denied.body.result.content[0].text,/NOT_FOUND/);
 }
 const readOnly=await h.authorize('A',{clientName:'Read only client',write:false,requestWrite:true});assert.equal(readOnly.scope.includes('workbench:write'),false);
 const read=await h.mcp(readOnly,'get_item',{id:record.item.id});assert.equal(read.body.result.structuredContent.item.id,record.item.id);
 const denied=await h.mcp(readOnly,'create_item',{requestId:'read-forbidden',type:'todo',title:'禁止写入'});assert.equal(denied.body.result.isError,true);assert.match(denied.body.result.content[0].text,/INSUFFICIENT_SCOPE/);
 const grants=await(await h.call('/api/grants',{headers:h.browserHeaders('A')})).json();const grant=grants.items.find(g=>g.clientName==='A Test AI');assert.ok(grant);assert.equal((await h.call('/api/grants/'+grant.id,{method:'DELETE',headers:h.browserHeaders('B')})).status,404);
 assert.equal((await h.call('/api/grants/'+grant.id,{method:'DELETE',headers:h.browserHeaders('A')})).status,200);
 const revoked=await h.call('/mcp',{method:'POST',headers:ai.headers,body:JSON.stringify({jsonrpc:'2.0',id:9,method:'tools/list'})});assert.equal(revoked.status,401);
 const refresh=await h.call('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:ai.refresh_token,client_id:ai.registered.client_id,resource:h.base})});assert.equal(refresh.status,400);
 // Cherry-style loopback is a registered redirect, never a global hard-coded client identity.
 const loopback=await h.authorize('B',{clientName:'Loopback fixture',redirectUri:'http://127.0.0.1:12346/callback',write:false});assert.ok(loopback.access_token);
});

test('公开授权边界：签名、来源、scope、同意重放、撤销传播及通用CIMD',async t=>{
 const h=await createPublicHarness();t.after(()=>h.dispose());
 const token=h.token(),parts=token.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
 assert.equal((await h.call('/api/account',{headers:{Authorization:'Bearer '+parts.join('.')}})).status,401);
 assert.equal((await h.call('/api/account',{headers:{'X-Test-User':'user_PublicA','X-User-Id':'user_PublicA'}})).status,401);
 assert.equal((await h.call('/api/account',{headers:{...h.browserHeaders(),Origin:'https://evil.test'}})).status,403);
 for(const missing of ['sid','sub','azp','exp'])assert.equal((await h.call('/api/account',{headers:h.browserHeaders('A',{[missing]:null})})).status,401);
 const ai=await h.authorize('A',{write:true,requestWrite:false,clientName:'<script>client-name</script>'});
 assert.equal(ai.scope.includes('workbench:write'),false);assert.ok(ai.consent.html.includes('&lt;script&gt;client-name&lt;/script&gt;'));
 assert.equal((await h.call('/api/account',{headers:{Authorization:'Bearer '+ai.access_token}})).status,401);
 assert.equal((await h.call('/mcp',{method:'POST',headers:h.browserHeaders(),body:'{}'})).status,401);
 const noPkce=new URLSearchParams(ai.consent.query);noPkce.delete('code_challenge');noPkce.delete('code_challenge_method');
 assert.equal((await h.call('/authorize?'+noPkce)).status,400);
 const replay=await h.call('/authorize/decision',{method:'POST',headers:{...h.browserHeaders(),Origin:h.base,Cookie:ai.consent.cookie},body:JSON.stringify({handle:ai.consent.handle,decision:'allow',write:false})});assert.equal(replay.status,400);
 // The D1 revocation barrier must work even while valid KV access/refresh records remain.
 const grant=ai.access_token.split(':')[1];
 await h.db.prepare('INSERT INTO public_revoked_grants(user_id,grant_id,revoked_at) VALUES(?,?,?)').bind('user_PublicA',grant,new Date().toISOString()).run();
 const revoked=await h.call('/mcp',{method:'POST',headers:ai.headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});assert.equal(revoked.status,401);assert.equal((await revoked.json()).code,'REVOKED_GRANT');
 const refresh=await h.call('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:ai.refresh_token,client_id:ai.registered.client_id,resource:h.base})});assert.equal(refresh.status,400);
 assert.equal((await refresh.json()).error,'invalid_grant');
 // Client metadata is hosted by the client. No provider-specific registration or callback is assumed.
 const clientId='https://metadata-client.example.invalid/oauth/client.json';
 h.fetchMock.get('https://metadata-client.example.invalid').intercept({path:'/oauth/client.json',method:'GET'}).reply(200,{client_id:clientId,client_name:'Generic metadata client',redirect_uris:['https://ai-client.example.invalid/callback'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'},{headers:{'Content-Type':'application/json'}}).persist();
 const metadata=await h.authorize('B',{clientId,write:false});assert.ok(metadata.access_token);
 assert.equal((await h.mcp(metadata,'list_items')).body.result.structuredContent.items.length,0);
});

test('公开配置不能回退私人绑定或错误Clerk实例',()=>{
 const common={PUBLIC_DEPLOYMENT:'workbench-public-v3',PUBLIC_BASE_URL:'https://public.test',PUBLIC_FRONTEND_ORIGIN:'https://frontend.test',CLERK_ISSUER:'https://instance.clerk.accounts.dev',CLERK_SECRET_KEY:'fixture',CLERK_PUBLISHABLE_KEY:'pk_test_'+Buffer.from('instance.clerk.accounts.dev$').toString('base64')};
 assert.equal(validatePublicConfig({...common,DB:{},OAUTH_KV:{}}),false);
 assert.equal(validatePublicConfig({...common,PUBLIC_DB:{},PUBLIC_OAUTH_KV:{}}),true);
 assert.equal(validatePublicConfig({...common,PUBLIC_DB:{},PUBLIC_OAUTH_KV:{},CLERK_ISSUER:'https://wrong.clerk.accounts.dev'}),false);
});
