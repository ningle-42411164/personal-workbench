import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';import{github}from'./github.mjs';import{waitFor}from'./http.mjs';import{OFFLINE_REPO}from'./core.mjs';import{waitSite,verifySite}from'./remote.mjs';
export async function deployOffline(ctx){const token=process.env.OFFLINE_PUBLISH_TOKEN;if(!token)throw Error('缺少跨仓库授权');const route='/repos/'+OFFLINE_REPO;
 await ctx.step('offline.deploy',async()=>{
  // 上次 Push 后结果不明：先看当前分支里的来源，不再次写入同一产物。
  const ref=await github(route+'/git/ref/heads/gh-pages',{token});const head=await github(route+'/git/commits/'+ref.object.sha,{token});const tree=await github(route+'/git/trees/'+head.tree.sha+'?recursive=1',{token});
  const info=tree.tree.find(x=>x.path==='release-info.json');let same=false;if(info){const blob=await github(route+'/git/blobs/'+info.sha,{token});const data=JSON.parse(Buffer.from(blob.content,'base64'));same=data.product==='offline'&&data.version===ctx.plan.products.offline.version&&data.commit===ctx.plan.commit;}
  let sha=ref.object.sha;
  if(!same){const entries=[];const dir=path.join(ctx.productDir('offline'),'site');
   async function visit(folder,prefix=''){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const name=prefix+entry.name,file=path.join(folder,entry.name);if(entry.isDirectory())await visit(file,name+'/');else{const bytes=fs.readFileSync(file),oid=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');if(tree.tree.some(x=>x.path===name&&x.sha===oid))continue;const blob=await github(route+'/git/blobs',{token,method:'POST',body:{content:bytes.toString('base64'),encoding:'base64'}});entries.push({path:name,mode:'100644',type:'blob',sha:blob.sha});}}}
   await visit(dir);if(!tree.tree.some(x=>x.path==='.nojekyll'))entries.push({path:'.nojekyll',mode:'100644',type:'blob',content:''});
   const nextTree=await github(route+'/git/trees',{token,method:'POST',body:{base_tree:head.tree.sha,tree:entries}});const commit=await github(route+'/git/commits',{token,method:'POST',body:{message:'Publish offline '+ctx.plan.products.offline.version+' from '+ctx.plan.commit,tree:nextTree.sha,parents:[ref.object.sha]}});sha=commit.sha;await github(route+'/git/refs/heads/gh-pages',{token,method:'PATCH',body:{sha,force:false}});
  }
  ctx.state.products.offline.deploymentCommit=sha;ctx.save();
  const build=await waitFor(async()=>{const x=await github(route+'/pages/builds/latest',{token});if(x.commit!==sha)return false;if(x.status==='errored')throw Error('脱机 Pages 构建失败');return x.status==='built'?x:false;},{label:'脱机 Pages'});
  return {commit:sha,status:build.status,site:await waitSite(ctx.plan,'offline')};
 },async record=>{const ref=await github(route+'/git/ref/heads/gh-pages',{token});if(ref.object.sha!==record.commit)throw Error('脱机站点已被其他发布改变，停止续跑');const build=await github(route+'/pages/builds/latest',{token});if(build.commit!==record.commit||build.status!=='built')return false;await verifySite(ctx.plan,'offline');return true;});
}
