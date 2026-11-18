import fs from'node:fs';import path from'node:path';import{args,git,planFor,context,run,manifest,matches,assertSite,assertPackages,captureSite}from'./core.mjs';import{preflight,preserveOthers,ensureTag,tagCommit}from'./remote.mjs';import{packageProduct}from'./package.mjs';import{verifyProduct}from'./verify.mjs';import{deployOffline}from'./deploy-offline.mjs';import{deployCloud,cloudCurrent}from'./deploy-cloud.mjs';import{publishProduct,publishedMatches,verifyDownloads}from'./publish.mjs';import{report}from'./report.mjs';
const a=args(),plan=planFor(a.target,a.sha),ctx=context(plan);if(git('rev-parse','HEAD')!==plan.commit)throw Error('必须检出固定来源提交');if(process.env.RELEASE_CONTROLLER_SHA&&ctx.state.controller?.commit!==process.env.RELEASE_CONTROLLER_SHA)throw Error('当前控制器尚未通过针对性验证');
function output(name,value){if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,name+'='+value+'\n');}
async function prepareProduct(p){ctx.state.products[p]??={};const dir=ctx.productDir(p),site=path.join(dir,'site');
 await ctx.step(p+'.build',async()=>{run('npm',['run','build:'+p]);const source=p==='cloud'?'dist':'dist/offline';captureSite(source,site,p==='cloud'?['offline']:[]);const info=JSON.parse(fs.readFileSync(path.join(site,'release-info.json')));if(info.product!==p||info.commit!==plan.commit||info.version!==plan.products[p].version)throw Error('构建元数据错误');return {files:manifest(site)};},record=>matches(site,record.files));
 await packageProduct(ctx,p);await verifyProduct(ctx,p);await ctx.step(p+'.tag',()=>ensureTag(plan,p),async()=>await tagCommit(plan.products[p].tag)===plan.commit);
}
try{
 delete ctx.state.fatal;ctx.save();
 if(a.phase==='prepare'){
  await preflight(plan);await preserveOthers(ctx);
  await ctx.step('tests',async()=>{run('npm',['ci','--ignore-scripts','--prefer-offline']);run('npm',['ci','--ignore-scripts','--prefer-offline'],'services/workbench-api');run('npm',['test']);run('npm',['test'],'services/workbench-api');run('npm',['run','check'],'services/workbench-api');return {passed:true,input:plan.commit};});
  // 新 runner 若跳过已验证测试但需要缺失的构建，则只补依赖安装。
  const needsBuild=plan.selected.some(p=>!ctx.state.steps[p+'.build']||!matches(path.join(ctx.productDir(p),'site'),ctx.state.steps[p+'.build']?.result?.files));if(needsBuild&&!fs.existsSync('node_modules'))run('npm',['ci','--ignore-scripts','--prefer-offline']);
  for(const p of plan.selected){try{await prepareProduct(p)}catch(e){ctx.state.products[p].error=e.message;ctx.save();}}
  const cloudReady=plan.selected.includes('cloud')&&['source','web'].every(k=>ctx.state.steps['cloud.verify.'+k]?.status==='success')&&ctx.state.steps['cloud.tag']?.status==='success';
  output('cloud_deploy',cloudReady&&!(await cloudCurrent(ctx)));output('key',plan.key);output('ready',plan.selected.some(p=>ctx.state.steps[p+'.tag']?.status==='success'));
 }else if(a.phase==='cloud'){assertSite(ctx,'cloud');await deployCloud(ctx);}
 else if(a.phase==='finish'){
  for(const p of plan.selected){try{
   if(ctx.state.steps[p+'.tag']?.status!=='success')throw Error('准备步骤未完成');assertSite(ctx,p);assertPackages(ctx,p);if(await tagCommit(plan.products[p].tag)!==plan.commit)throw Error('标签提交冲突 '+p);
   if(p==='offline')await deployOffline(ctx);else if(!await cloudCurrent(ctx))throw Error('含云站点部署尚未完成');
   await ctx.step(p+'.publish',()=>publishProduct(ctx,p),()=>publishedMatches(ctx,p));await verifyDownloads(ctx,p);delete ctx.state.products[p].error;
  }catch(e){ctx.state.products[p]??={};ctx.state.products[p].error=e.message;console.error(p+': '+e.message);ctx.save();}}
  await preserveOthers(ctx,true);
 }else throw Error('未知执行阶段');
}catch(e){ctx.state.fatal=e.message;console.error(e.message);ctx.save();}
if(a.phase==='prepare'&&!plan.selected.some(p=>ctx.state.steps[p+'.tag']?.status==='success')){ctx.state.fatal??='所选产品均未完成准备，发布未执行';ctx.save();}
const complete=report(ctx);if(a.phase==='finish'&&!complete||ctx.state.fatal)process.exitCode=1;
