import OAuthProvider,{OAuthError} from '@cloudflare/workers-oauth-provider';
import {D1Store} from '../store.js';
import {WorkbenchService,READ_SCOPE,WRITE_SCOPE} from '../service.js';
import {handleApi,json} from '../http.js';
import {ApiError,publicError} from '../errors.js';
import {validatePublicConfig,publicOrigins} from './config.js';
import {readPublicIdentity,ensurePublicAccount,grantRevoked} from './identity.js';
import {handlePublicAuthorization} from './authorization.js';

async function bounded(request) {
  if(!request.body)return request;
  const reader=request.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new ApiError(413,'TOO_LARGE','请求内容过大。');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new Request(request,{body:bytes});
}
function headers(response,origin,allowed) {
  const result=new Headers(response.headers);result.set('Cache-Control','no-store');result.set('X-Content-Type-Options','nosniff');
  if(!result.has('Referrer-Policy'))result.set('Referrer-Policy','no-referrer');
  if(origin&&allowed){result.set('Access-Control-Allow-Origin',origin);result.append('Vary','Origin');result.set('Access-Control-Allow-Methods','GET, POST, PUT, PATCH, DELETE, OPTIONS');result.set('Access-Control-Allow-Headers','Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id');result.set('Access-Control-Expose-Headers','WWW-Authenticate, MCP-Session-Id');}
  return new Response(response.body,{status:response.status,headers:result});
}
async function browserApi(request,env) {
  const identity=await ensurePublicAccount(env,await readPublicIdentity(request,env)),url=new URL(request.url);
  if(url.pathname==='/api/account'&&request.method==='GET')return json(identity);
  if(url.pathname==='/api/grants'&&request.method==='GET') {
    const cursor=url.searchParams.get('cursor')||undefined;
    const list=await env.OAUTH_PROVIDER.listUserGrants(identity.id,{limit:50,cursor});
    return json({items:list.items.map(g=>({id:g.id,clientId:g.clientId,clientName:g.metadata?.clientName||g.clientId,scope:g.scope,createdAt:new Date(g.createdAt*1000).toISOString()})),...(list.cursor?{cursor:list.cursor}:{})});
  }
  const match=/^\/api\/grants\/([A-Za-z0-9_-]{1,200})$/.exec(url.pathname);
  if(match&&request.method==='DELETE') {
    const id=match[1];let cursor,found=false;
    do {const page=await env.OAUTH_PROVIDER.listUserGrants(identity.id,{limit:100,cursor});found=page.items.some(g=>g.id===id);cursor=page.cursor;}while(!found&&cursor);
    if(!found&&!await grantRevoked(env,identity.id,id))throw new ApiError(404,'NOT_FOUND','授权不存在。');
    // D1 marker also denies access while KV revocation propagates or a partial cleanup is retried.
    await env.PUBLIC_DB.prepare('INSERT OR IGNORE INTO public_revoked_grants(user_id,grant_id,revoked_at) VALUES(?,?,?)').bind(identity.id,id,new Date().toISOString()).run();
    await env.OAUTH_PROVIDER.revokeGrant(id,identity.id);
    return json({id,revoked:true});
  }
  return handleApi(request,new WorkbenchService(new D1Store(env.PUBLIC_DB,identity.id),{id:identity.id,scopes:[READ_SCOPE,WRITE_SCOPE]}),env.PUBLIC_BASE_URL);
}
export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url),origin=request.headers.get('origin');
    if(url.pathname==='/health'&&request.method==='GET'){const ready=validatePublicConfig(env);return json({service:'personal-workbench-public',version:'3.0.0',ready},ready?200:503);}
    if(!validatePublicConfig(env))return json({code:'PUBLIC_NOT_CONFIGURED',message:'公开版云服务暂不可用，本机功能仍可使用。'},503);
    const allowed=publicOrigins(env).includes(origin);
    if(url.origin!==env.PUBLIC_BASE_URL||(origin&&!allowed))return json({code:'ORIGIN_REJECTED',message:'请求来源未配置。'},403);
    if(request.method==='OPTIONS')return headers(new Response(null,{status:204}),origin,allowed);
    try {
      const provider=new OAuthProvider({
        apiRoute:'/mcp',
        apiHandler:{async fetch(req,serviceEnv,serviceCtx){
          const id=serviceCtx.props?.userId,grant=serviceCtx.auth?.token?.split(':')[1];
          if(!/^user_[A-Za-z0-9]+$/.test(id??'')||serviceCtx.auth.userId!==id)throw new ApiError(401,'INVALID_SESSION','授权身份无效。');
          if(!grant||await grantRevoked(serviceEnv,id,grant))return json({code:'REVOKED_GRANT',message:'此客户端授权已撤销。'},401,{'WWW-Authenticate':`Bearer error="invalid_token", resource_metadata="${env.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`});
          return handleApi(req,new WorkbenchService(new D1Store(serviceEnv.PUBLIC_DB,id),{id,scopes:serviceCtx.auth.scope}),serviceEnv.PUBLIC_BASE_URL);
        }},
        defaultHandler:{async fetch(req,serviceEnv){
          if(new URL(req.url).pathname.startsWith('/api/'))return browserApi(req,serviceEnv);
          return await handlePublicAuthorization(req,serviceEnv)??json({code:'NOT_FOUND',message:'接口不存在。'},404);
        }},
        authorizeEndpoint:'/authorize',tokenEndpoint:'/oauth/token',clientRegistrationEndpoint:'/oauth/register',
        scopesSupported:[READ_SCOPE,WRITE_SCOPE,'offline_access'],requiredScopes:[READ_SCOPE],
        accessTokenTTL:3600,refreshTokenTTL:2592000,
        resourceMetadata:{resource:env.PUBLIC_BASE_URL,authorization_servers:[env.PUBLIC_BASE_URL]},
        clientIdMetadataDocumentEnabled:true,
        async tokenExchangeCallback(options){if(await grantRevoked(options.env,options.userId,options.grantId))throw new OAuthError('invalid_grant',{description:'Authorization has been revoked.'});},
      });
      // The provider requires its conventional KV name; bind it explicitly from the public namespace only.
      const response=await provider.fetch(await bounded(request),{...env,OAUTH_KV:env.PUBLIC_OAUTH_KV},ctx);
      return headers(response,origin,allowed);
    }catch(error){const failure=publicError(error);return headers(json({code:failure.code,message:failure.message},failure.status),origin,allowed);}
  },
};
