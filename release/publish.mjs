import fs from 'node:fs';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {github} from './github.mjs';
const repo='ningle-42411164/personal-workbench',products=JSON.parse(fs.readFileSync('release/products.json')),commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const [product,meta] of Object.entries(products)){
 const ref=await github('/repos/'+repo+'/git/ref/tags/'+meta.tag);let target=ref.object;if(target.type==='tag')target=(await github('/repos/'+repo+'/git/tags/'+target.sha)).object;if(target.sha!==commit)throw Error('标签提交不一致，禁止移动');
 let release;try{release=await github('/repos/'+repo+'/releases/tags/'+meta.tag)}catch(e){if(e.status!==404)throw e;release=(await github('/repos/'+repo+'/releases')).find(x=>x.tag_name===meta.tag);}
 const title=product==='cloud'?'含云版 v'+meta.version+'｜三段编号与双版本发布':'脱机版 v'+meta.version+'｜保留现有本机功能的独立脱机版';
 const body=fs.readFileSync('release/'+product+'.md','utf8').replaceAll('{{COMMIT}}',commit);
 if(!release)release=await github('/repos/'+repo+'/releases',{method:'POST',body:{tag_name:meta.tag,target_commitish:commit,name:title,body,draft:true,make_latest:product==='cloud'?'true':'false'}});
 const assets=await github('/repos/'+repo+'/releases/'+release.id+'/assets');
 for(const kind of ['source','web']){
 const name='personal-workbench-'+(product==='offline'?'offline-':'')+'v'+meta.version+'-'+kind+'.zip',bytes=fs.readFileSync('release-assets/'+name),existing=assets.find(x=>x.name===name);
 if(existing){const actual=await github('/repos/'+repo+'/releases/assets/'+existing.id,{accept:'application/octet-stream'});if(sha(actual)!==sha(bytes))throw Error('已有附件内容不同，禁止覆盖 '+name);}
 else{if(!release.draft)throw Error('已发布 Release 缺附件，不能静默修改');await github('https://uploads.github.com/repos/'+repo+'/releases/'+release.id+'/assets?name='+encodeURIComponent(name),{method:'POST',raw:bytes});}
 }
 if(release.draft)await github('/repos/'+repo+'/releases/'+release.id,{method:'PATCH',body:{draft:false,make_latest:product==='cloud'?'true':'false'}});
 console.log(release.html_url);
}
