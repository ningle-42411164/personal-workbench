// Public service configuration is separate from the private Worker. No DB/OAUTH_KV fallback.
export function publicOrigins(env) {
  let clients=[];
  try { clients=JSON.parse(env.PUBLIC_CLIENT_ORIGINS || '[]'); } catch { return []; }
  return [...new Set([env.PUBLIC_BASE_URL,env.PUBLIC_FRONTEND_ORIGIN,...(Array.isArray(clients)?clients:[])].filter(Boolean))];
}
function origin(value,development=false) {
  try { const url=new URL(value);return url.origin===value&&(url.protocol==='https:'||(development&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))); } catch { return false; }
}
export function validatePublicConfig(env) {
  const development=env.PUBLIC_ENV==='development';
  if(env.PUBLIC_DEPLOYMENT!=='workbench-public-v3'||!env.PUBLIC_DB||!env.PUBLIC_OAUTH_KV||!env.CLERK_SECRET_KEY)return false;
  if(!origin(env.PUBLIC_BASE_URL,development)||!origin(env.PUBLIC_FRONTEND_ORIGIN,development)||!origin(env.CLERK_ISSUER))return false;
  if(!/^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(env.CLERK_PUBLISHABLE_KEY??''))return false;
  try {
    const host=atob(env.CLERK_PUBLISHABLE_KEY.split('_').slice(2).join('_').replaceAll('-','+').replaceAll('_','/')).replace(/\$$/,'');
    if(new URL(env.CLERK_ISSUER).hostname!==host)return false;
  }catch{return false;}
  const allowed=publicOrigins(env);return allowed.length>=1&&allowed.every(value=>origin(value,development));
}
