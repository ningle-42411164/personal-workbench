import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync,sign} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,createFetchMock} from 'miniflare';

// All identities and keys below are generated fixtures. This module is never a Worker entry point.
export async function createPublicHarness() {
 const base='https://public-workbench.test',frontend='https://public-ui.test',issuer='https://isolated-public.clerk.accounts.dev';
 const keys=generateKeyPairSync('rsa',{modulusLength:2048}),publicKey=keys.publicKey.export({type:'spki',format:'pem'});
 const profiles={
  A:{id:'user_PublicA',email:'a@example.invalid',verified:true},
  B:{id:'user_PublicB',email:'b@example.invalid',verified:true},
  unverified:{id:'user_Unverified',email:'unverified@example.invalid',verified:false},
 };
 const fetchMock=createFetchMock();fetchMock.disableNetConnect();
 fetchMock.get('https://api.clerk.com').intercept({path:/^\/v1\/users\/user_/,method:'GET'}).reply(options=>{
  const profile=Object.values(profiles).find(p=>options.path==='/v1/users/'+p.id);
  return {statusCode:profile?200:404,data:profile?{id:profile.id,primary_email_address_id:'email_'+profile.id,email_addresses:[{id:'email_'+profile.id,email_address:profile.email,verification:{status:profile.verified?'verified':'unverified'}}]}:{},responseOptions:{headers:{'Content-Type':'application/json'}}};
 }).persist();
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/public/index.js',import.meta.url))],bundle:true,write:false,format:'esm',platform:'neutral',conditions:['workerd','worker','browser'],mainFields:['browser','module','main'],external:['cloudflare:*','node:*'],target:'es2022'});
 const bindings={PUBLIC_DEPLOYMENT:'workbench-public-v3',PUBLIC_ENV:'development',PUBLIC_BASE_URL:base,PUBLIC_FRONTEND_ORIGIN:frontend,PUBLIC_CLIENT_ORIGINS:'[]',CLERK_ISSUER:issuer,CLERK_SECRET_KEY:'sk_test_isolated_public_fixture',CLERK_JWT_KEY:publicKey,CLERK_PUBLISHABLE_KEY:'pk_test_'+Buffer.from(new URL(issuer).hostname+'$').toString('base64')};
 const mf=new Miniflare({modules:true,script:outputFiles[0].text,compatibilityDate:'2026-04-30',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],d1Databases:['PUBLIC_DB'],kvNamespaces:['PUBLIC_OAUTH_KV'],bindings,fetchMock});
 const db=await mf.getD1Database('PUBLIC_DB');
 for(const name of readdirSync(new URL('../migrations-public/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()){
  const sql=readFileSync(new URL('../migrations-public/'+name,import.meta.url),'utf8');await db.batch(sql.split(';').filter(s=>s.trim()).map(s=>db.prepare(s)));
 }
 const call=(route,init={})=>mf.dispatchFetch(new URL(route,base),{redirect:'manual',...init});
 function token(user='A',overrides={}){
  const now=Math.floor(Date.now()/1000),profile=profiles[user];const head=Buffer.from(JSON.stringify({typ:'JWT',alg:'RS256',kid:'public-test',cat:'cl_B7d4PD111AAA'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({iss:issuer,sub:profile.id,sid:'sess_'+profile.id,azp:frontend,iat:now,nbf:now-1,exp:now+3600,...overrides})).toString('base64url');
  return head+'.'+payload+'.'+sign('RSA-SHA256',Buffer.from(head+'.'+payload),keys.privateKey).toString('base64url');
 }
 const browserHeaders=(user='A',overrides={})=>({Authorization:'Bearer '+token(user,overrides),'Content-Type':'application/json',Origin:frontend});
 async function authorize(user='A',{write=true,requestWrite=write,clientName='Isolated AI Client',redirectUri='https://ai-client.example.invalid/callback',cancel=false,clientId}={}){
  let registered;
  if(clientId)registered={client_id:clientId};
  else {
  const registeredResponse=await call('/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:clientName,redirect_uris:[redirectUri],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})});
  assert.equal(registeredResponse.status,201,await registeredResponse.clone().text());registered=await registeredResponse.json();
  }
  const verifier='v'.repeat(64),challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url');
  const query=new URLSearchParams({client_id:registered.client_id,redirect_uri:redirectUri,response_type:'code',scope:'workbench:read'+(requestWrite?' workbench:write':'')+' offline_access',resource:base,state:'fixture-client-state',code_challenge:challenge,code_challenge_method:'S256'});
  const consent=await call('/authorize?'+query);assert.equal(consent.status,200,await consent.clone().text());const html=await consent.text();const handle=JSON.parse(/const handle=("[^"]+")/.exec(html)[1]);const cookie=consent.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  const decision=await call('/authorize/decision',{method:'POST',headers:{...browserHeaders(user),Origin:base,Cookie:cookie},body:JSON.stringify({handle,decision:cancel?'deny':'allow',write})});
  assert.equal(decision.status,200,await decision.clone().text());const destination=new URL((await decision.json()).redirectTo);assert.equal(destination.origin,new URL(redirectUri).origin);assert.equal(destination.searchParams.get('state'),'fixture-client-state');
  if(cancel)return {cancelled:true,destination,registered};
  const exchanged=await call('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:destination.searchParams.get('code'),client_id:registered.client_id,redirect_uri:redirectUri,code_verifier:verifier,resource:base}).toString()});
  assert.equal(exchanged.status,200,await exchanged.clone().text());const tokens=await exchanged.json();
  return {...tokens,registered,consent:{query,handle,cookie,html},headers:{Authorization:'Bearer '+tokens.access_token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'}};
 }
 async function mcp(auth,name,args={}){const response=await call('/mcp',{method:'POST',headers:auth.headers,body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name,arguments:args}})});return {response,body:await response.json()};}
 return {mf,call,db,base,frontend,issuer,bindings,profiles,token,browserHeaders,authorize,mcp,fetchMock,dispose:()=>mf.dispose()};
}
