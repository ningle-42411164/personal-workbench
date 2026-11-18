import {github,optional} from './github.mjs';
import {request,waitFor} from './http.mjs';
import {REPO} from './core.mjs';
import {waitSite,verifySite} from './remote.mjs';

async function knownDeployment(ctx) {
 const saved=ctx.state.products.cloud?.deployment;
 // Pages 接口接受提交 SHA：请求已被接收但响应丢失时先读取真实结果。
 const id=saved?.id??ctx.plan.commit;
 const remote=await optional('/repos/'+REPO+'/pages/deployments/'+id);
 if(!remote)return null;
 const record=saved??{id:ctx.plan.commit};
 ctx.state.products.cloud??={};ctx.state.products.cloud.deployment=record;ctx.save();
 return {record,remote};
}
export async function cloudCurrent(ctx) {
 const known=await knownDeployment(ctx);
 if(known?.remote.status!=='succeed')return false;
 try{await verifySite(ctx.plan,'cloud');}catch(e){if(e.status===401||e.status===403)throw e;return false;}
 ctx.state.steps['cloud.deploy']={status:'success',result:{deployment:known.record,site:await verifySite(ctx.plan,'cloud')},finishedAt:new Date().toISOString()};ctx.save();
 return true;
}
export async function deployCloud(ctx) {
 await ctx.step('cloud.deploy',async()=>{
  let known=await knownDeployment(ctx),record=known?.record;
  const pending=['queued','in_progress','deployment_in_progress'];
  // 成功记录仍须匹配当前站点；站点被回滚后，明确发布可以重新部署。
  const usable=known&&(pending.includes(known.remote.status)||(known.remote.status==='succeed'&&await cloudCurrent(ctx)));
  if(!usable) {
   if(!process.env.PAGES_ARTIFACT_ID)throw Error('缺少已验证的 Pages 产物 ID');
   const oidc=await request(process.env.ACTIONS_ID_TOKEN_REQUEST_URL,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});
   const result=await github('/repos/'+REPO+'/pages/deployments',{method:'POST',body:{artifact_id:Number(process.env.PAGES_ARTIFACT_ID),pages_build_version:ctx.plan.commit,oidc_token:oidc.value}});
   record={id:result.id,url:result.page_url};ctx.state.products.cloud.deployment=record;ctx.save();
  }
  await waitFor(async()=>{
   const status=await github('/repos/'+REPO+'/pages/deployments/'+record.id);
   if(['deployment_failed','errored','failed','cancelled'].includes(status.status))throw Error('含云 Pages 部署失败 '+status.status);
   return status.status==='succeed';
  },{label:'含云 Pages'});
  return {deployment:record,site:await waitSite(ctx.plan,'cloud')};
 },()=>cloudCurrent(ctx));
}
