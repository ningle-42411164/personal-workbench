import fs from'node:fs';import path from'node:path';import{github}from'./github.mjs';import{request}from'./http.mjs';import{REPO,fileHash,hash,zipName,notes,assertPackages}from'./core.mjs';import{getRelease,validateRelease,tagCommit}from'./remote.mjs';
export async function publishProduct(ctx,p){assertPackages(ctx,p);const {plan}=ctx,meta=plan.products[p];if(await tagCommit(meta.tag)!==plan.commit)throw Error('标签提交不符 '+p);
 let release=await getRelease(plan,p);
 if(!release)release=await github('/repos/'+REPO+'/releases',{method:'POST',body:{tag_name:meta.tag,name:meta.releaseTitle,body:notes(plan,p),draft:true,make_latest:p==='cloud'?'true':'false'}});
 // 标签已存在且已核对；不传仅用于新建标签的 target_commitish，避免无关的 workflow 写权限检查。
 if(await tagCommit(meta.tag)!==plan.commit)throw Error('标签提交冲突 '+p);validateRelease(release,plan,p);
 for(const kind of ['source','web']){const name=zipName(plan,p,kind),file=path.join(ctx.productDir(p),'packages',name),sha256=fileHash(file);let asset=release.assets.find(x=>x.name===name);
  if(!asset){if(!release.draft)throw Error('正式Release缺附件，禁止修改');asset=await github('https://uploads.github.com/repos/'+REPO+'/releases/'+release.id+'/assets?name='+encodeURIComponent(name),{method:'POST',raw:fs.readFileSync(file),timeout:90000});}
  const digest=asset.digest??'sha256:'+hash(await github('/repos/'+REPO+'/releases/assets/'+asset.id,{accept:'application/octet-stream',timeout:90000}));
  if(digest!=='sha256:'+sha256||asset.size!==fs.statSync(file).size)throw Error('远程同名附件内容冲突，禁止覆盖 '+name);
  ctx.state.products[p].assets??={};ctx.state.products[p].assets[kind]={id:asset.id,name,url:asset.browser_download_url,sha256,size:asset.size};ctx.save();
 }
 release=await getRelease(plan,p);validateRelease(release,plan,p);if(release.assets.length!==2)throw Error('附件尚未齐全');
 if(release.draft)release=await github('/repos/'+REPO+'/releases/'+release.id,{method:'PATCH',body:{draft:false,make_latest:p==='cloud'?'true':'false'}});
 return {id:release.id,url:release.html_url,tag:meta.tag,published:true};
}
export async function publishedMatches(ctx,p){assertPackages(ctx,p);if(await tagCommit(ctx.plan.products[p].tag)!==ctx.plan.commit)throw Error('标签提交冲突 '+p);const release=await getRelease(ctx.plan,p);validateRelease(release,ctx.plan,p);if(release.draft)return false;for(const kind of ['source','web']){const expected=ctx.state.products[p].assets?.[kind],actual=release.assets.find(a=>a.name===zipName(ctx.plan,p,kind));if(!expected||!actual||actual.id!==expected.id||actual.size!==expected.size)return false;const digest=actual.digest??'sha256:'+hash(await github('/repos/'+REPO+'/releases/assets/'+actual.id,{accept:'application/octet-stream'}));if(digest!=='sha256:'+expected.sha256)throw Error('已发布附件被修改');}return true;}
export async function verifyDownloads(ctx,p){for(const kind of ['source','web']){const asset=ctx.state.products[p].assets[kind],file=path.join(ctx.productDir(p),'public',asset.name);await ctx.step(p+'.download.'+kind,async()=>{
  fs.mkdirSync(path.dirname(file),{recursive:true});
  // 明确不传 Authorization，也不依赖浏览器 Cookie；只有此路径算公开下载证据。
  const bytes=await request(asset.url,{binary:true,timeout:90000,attempts:2});if(hash(bytes)!==asset.sha256)throw Error('公开下载校验不符 '+asset.name);
  fs.writeFileSync(file+'.partial',bytes);fs.renameSync(file+'.partial',file);return {...asset,public:true,verifiedAt:new Date().toISOString()};
 },result=>result.sha256===asset.sha256&&result.url===asset.url&&fs.existsSync(file)&&fileHash(file)===asset.sha256);}}
