// 明确的站点回滚：只使用旧正式网页包，不改标签、Release、源码或业务数据库。
import fs from'node:fs';import path from'node:path';import{args,context,REPO,hash,zipName,manifest,assertSite}from'./core.mjs';import{github}from'./github.mjs';import{request}from'./http.mjs';import{tagCommit,preserveOthers,verifySite}from'./remote.mjs';import{inspect}from'./package.mjs';import{deployCloud}from'./deploy-cloud.mjs';import{deployOffline}from'./deploy-offline.mjs';
const a=args();if(!['cloud','offline'].includes(a.target))throw Error('回滚每次明确选择一个产品');const sha=await tagCommit(a.tag);if(!sha)throw Error('旧标签不存在');const raw=await github('/repos/'+REPO+'/contents/release/products.json?ref='+sha);const products=JSON.parse(Buffer.from(raw.content,'base64'));if(products[a.target]?.tag!==a.tag)throw Error('标签不属于所选产品');const plan={target:a.target,selected:[a.target],products,commit:sha,key:'rollback-'+a.target+'-'+sha};const ctx=context(plan);ctx.state.products[a.target]??={};
try{
 if(a.phase==='prepare'){
  if(a.target==='offline'&&!process.env.OFFLINE_PUBLISH_TOKEN)throw Error('缺少跨仓库授权');await preserveOthers(ctx);
  const release=await github('/repos/'+REPO+'/releases/tags/'+a.tag);if(release.draft)throw Error('只能回滚正式发行物');const name=zipName(plan,a.target,'web'),asset=release.assets.find(x=>x.name===name);if(!asset)throw Error('旧版本没有专用网页包');
  const bytes=await request(asset.browser_download_url,{binary:true,timeout:90000});const expected=asset.digest??'sha256:'+hash(await github('/repos/'+REPO+'/releases/assets/'+asset.id,{accept:'application/octet-stream'}));if('sha256:'+hash(bytes)!==expected)throw Error('旧网页包摘要不符');
  const zip=path.join(ctx.root,name);fs.writeFileSync(zip,bytes);const source=inspect(zip,plan,a.target,'web');fs.cpSync(source,path.join(ctx.productDir(a.target),'site'),{recursive:true});ctx.state.steps[a.target+'.build']={status:'success',result:{files:manifest(path.join(ctx.productDir(a.target),'site'))}};ctx.state.rollbackAsset={name,sha256:hash(bytes),url:asset.browser_download_url};ctx.save();
  fs.appendFileSync(process.env.GITHUB_OUTPUT,'key='+plan.key+'\n');
 }else if(a.phase==='cloud'){assertSite(ctx,'cloud');await deployCloud(ctx);}
 else if(a.phase==='finish'){assertSite(ctx,a.target);if(a.target==='offline')await deployOffline(ctx);const site=await verifySite(plan,a.target);await preserveOthers(ctx,true);ctx.state.rollback={success:true,site};ctx.save();}
 else throw Error('回滚阶段错误');
}catch(e){ctx.state.fatal=e.message;ctx.save();process.exitCode=1;}
const text='# 站点回滚\n\n产品：'+a.target+'；旧标签：'+a.tag+'；来源：'+sha+'\n\n'+(ctx.state.rollback?.success?'所选站点回滚成功；未选产品核对未变。':'未完成：'+(ctx.state.fatal??'等待后续阶段'))+'\n\n标签、Release、个人数据、云服务未改动。\n';fs.writeFileSync(path.join(ctx.root,'回滚报告.md'),text);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,text);
