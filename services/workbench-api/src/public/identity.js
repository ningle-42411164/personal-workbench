import {verifyToken} from '@clerk/backend';
import {ApiError} from '../errors.js';

// Accept only Clerk session JWTs from this public instance; never accept a user ID from the caller.
export async function readPublicIdentity(request,env) {
  const bearer=/^Bearer (\S{1,8192})$/.exec(request.headers.get('authorization')??'');
  if(!bearer)throw new ApiError(401,'LOGIN_REQUIRED','请先完成邮箱登录。');
  let claims;
  try {
    claims=await verifyToken(bearer[1],{jwtKey:env.CLERK_JWT_KEY,secretKey:env.CLERK_SECRET_KEY,issuer:env.CLERK_ISSUER,
      authorizedParties:[env.PUBLIC_BASE_URL,env.PUBLIC_FRONTEND_ORIGIN],clockSkewInMs:0});
  }catch{throw new ApiError(401,'INVALID_SESSION','登录已失效，请重新验证邮箱。');}
  if(!/^user_[A-Za-z0-9]+$/.test(claims?.sub??'')||typeof claims.sid!=='string'||!claims.sid.startsWith('sess_')||
    claims.iss!==env.CLERK_ISSUER||![env.PUBLIC_BASE_URL,env.PUBLIC_FRONTEND_ORIGIN].includes(claims.azp)||
    !Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000)throw new ApiError(401,'INVALID_SESSION','登录身份无效。');
  // The verified primary address is display data, never the tenant key. Changing email keeps the same space.
  let response;
  try {response=await fetch('https://api.clerk.com/v1/users/'+encodeURIComponent(claims.sub),{
    headers:{Authorization:'Bearer '+env.CLERK_SECRET_KEY,Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'manual'});
  }catch{throw new ApiError(503,'IDENTITY_UNAVAILABLE','邮箱身份服务暂时不可用，本机事项保留。');}
  if(!response.ok)throw new ApiError(response.status===404?401:503,'IDENTITY_UNAVAILABLE','无法确认当前邮箱身份。');
  const user=await response.json();
  const email=user.email_addresses?.find(value=>value.id===user.primary_email_address_id&&value.verification?.status==='verified');
  if(user.id!==claims.sub||user.banned||user.locked||!email?.email_address)throw new ApiError(403,'VERIFIED_EMAIL_REQUIRED','需要已验证的邮箱才能开启云功能。');
  return {id:claims.sub,email:email.email_address};
}
export async function ensurePublicAccount(env,identity) {
  await env.PUBLIC_DB.prepare('INSERT INTO public_accounts(user_id,email,created_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email')
    .bind(identity.id,identity.email,new Date().toISOString()).run();
  return identity;
}
export async function grantRevoked(env,userId,grantId) {
  return Boolean(await env.PUBLIC_DB.prepare('SELECT grant_id FROM public_revoked_grants WHERE user_id=? AND grant_id=?').bind(userId,grantId).first());
}
