import {ApiError} from '../errors.js';
import {READ_SCOPE,WRITE_SCOPE} from '../service.js';
import {readJson} from '../http.js';
import {readPublicIdentity,ensurePublicAccount} from './identity.js';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

export async function handlePublicAuthorization(request,env) {
  const url=new URL(request.url),oauth=env.OAUTH_PROVIDER;
  if(url.pathname==='/authorize'&&request.method==='GET') {
    const authRequest=await oauth.parseAuthRequest(request);
    if(authRequest.codeChallengeMethod!=='S256'||!authRequest.codeChallenge)throw new ApiError(400,'PKCE_REQUIRED','连接必须使用 PKCE S256。');
    if(!authRequest.scope.includes(READ_SCOPE)||authRequest.scope.some(scope=>![READ_SCOPE,WRITE_SCOPE,'offline_access'].includes(scope)))throw new ApiError(400,'INVALID_SCOPE','授权范围不受支持。');
    const description=await oauth.describeConsent(authRequest),consent=await oauth.beginConsent(authRequest),nonce=crypto.randomUUID();
    const write=description.scope.includes(WRITE_SCOPE),issuer=new URL(env.CLERK_ISSUER).origin;
    const headers=new Headers(consent.headers);headers.set('Content-Type','text/html; charset=utf-8');headers.set('Referrer-Policy','same-origin');
    headers.set('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}' ${issuer} https://challenges.cloudflare.com https://*.protect.clerk.com; connect-src 'self' ${issuer} https://api.clerk.com https://*.protect.clerk.com:*; style-src 'unsafe-inline'; img-src 'self' data: ${issuer} https://img.clerk.com; frame-src https://challenges.cloudflare.com https://*.protect.clerk.com; worker-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
    const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接个人工作台</title>
<style>body{font-family:STKaiti,KaiTi,serif;background:#f5f4ef;color:#244d43;margin:0;padding:16px}main{max-width:480px;margin:auto;background:#fff;padding:18px;border-radius:12px}button{min-height:44px;padding:8px 14px;border-radius:8px;font:inherit;margin:6px;border:1px solid #809b8a}label{display:block;padding:10px 0}#message{overflow-wrap:anywhere}</style>
<main><h1>连接个人工作台</h1><p>客户端：${escapeHtml(description.clientName)}</p><p>返回位置：${escapeHtml(description.redirectHost)}</p>${description.redirectIsLoopback?'<p>此连接返回本机程序，请确认该程序由你打开。</p>':''}
<p>权限：读取你的事项${write?'；可选择允许创建、修改、完成和删除事项':''}。写入仍需在 AI 对话中确认。</p><p>此连接不会自动上传这台设备的本机事项。你可以在工作台“连接 AI”中撤销授权。</p>
<div id="sign-in"></div><p id="account">请用同一工作台邮箱登录。</p><label>${write?'<input id="write" type="checkbox">允许写入（不选则只读）':'<input id="write" type="checkbox" hidden>本次仅申请读取权限。'}</label>
<button id="allow" disabled>允许连接</button><button id="deny">取消</button><p id="message" role="status"></p></main>
<script nonce="${nonce}" data-clerk-publishable-key="${escapeHtml(env.CLERK_PUBLISHABLE_KEY)}" src="${issuer}/npm/@clerk/clerk-js@6.44.0/dist/clerk.browser.js" crossorigin="anonymous"></script>
<script nonce="${nonce}">
const handle=${JSON.stringify(consent.handle)},message=document.getElementById('message'),allow=document.getElementById('allow');
async function decide(decision){allow.disabled=true;try{const token=decision==='allow'?await window.Clerk.session?.getToken():null;const r=await fetch('/authorize/decision',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({handle,decision,write:document.getElementById('write').checked})});const result=await r.json();if(!r.ok)throw Error(result.message||'连接失败，请重新发起。');location.assign(result.redirectTo);}catch(e){message.textContent=e.message;allow.disabled=!window.Clerk?.session;}}
allow.onclick=()=>decide('allow');document.getElementById('deny').onclick=()=>decide('deny');
(async()=>{try{if(!window.Clerk)throw Error('邮箱登录暂时不可用，请稍后重新发起连接。');await window.Clerk.load();const render=({user,session})=>{document.getElementById('account').textContent=user?'当前账号：'+(user.primaryEmailAddress?.emailAddress||'已登录'):'请用同一工作台邮箱登录。';allow.disabled=!session;if(session){window.Clerk.unmountSignIn(document.getElementById('sign-in'));}};window.Clerk.addListener(render);render(window.Clerk);if(!window.Clerk.session)window.Clerk.mountSignIn(document.getElementById('sign-in'),{routing:'hash',withSignUp:true,forceRedirectUrl:location.href,signUpForceRedirectUrl:location.href});}catch(e){message.textContent='邮箱登录暂时不可用，请稍后重新发起连接。';}})();
</script></html>`;
    return new Response(html,{headers});
  }
  if(url.pathname==='/authorize/decision'&&request.method==='POST') {
    if(request.headers.get('origin')!==env.PUBLIC_BASE_URL)throw new ApiError(403,'ORIGIN_REJECTED','授权确认必须从本服务页面发起。');
    const input=await readJson(request);
    if(typeof input?.handle!=='string'||input.handle.length>2048||!['allow','deny'].includes(input.decision)||typeof input.write!=='boolean')throw new ApiError(400,'INVALID_CONSENT','授权确认无效。');
    if(input.decision==='deny') {const denied=await oauth.denyConsent(request,input.handle);return Response.json({redirectTo:denied.redirectTo},{headers:denied.headers});}
    const identity=await ensurePublicAccount(env,await readPublicIdentity(request,env));
    const approved=await oauth.approveConsent(request,input.handle);
    const description=await oauth.describeConsent(approved.request);
    const scope=approved.request.scope.filter(value=>value!==WRITE_SCOPE||input.write);
    const completed=await oauth.completeAuthorization({request:approved.request,userId:identity.id,scope,props:{userId:identity.id},metadata:{source:'clerk',clientName:description.clientName}});
    return Response.json({redirectTo:completed.redirectTo},{headers:approved.headers});
  }
  return null;
}
