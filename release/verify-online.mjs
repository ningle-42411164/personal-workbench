import fs from 'node:fs';import{execFileSync}from'node:child_process';import{github}from'./github.mjs';
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),products=JSON.parse(fs.readFileSync('release/products.json'));
for(let attempt=0;attempt<90;attempt++){
 const runs=await github('/repos/ningle-42411164/personal-workbench/actions/runs?head_sha='+commit);const run=runs.workflow_runs.find(x=>x.name==='Deploy personal workbench to GitHub Pages');
 if(run?.conclusion&&run.conclusion!=='success')throw Error('Pages failed '+run.html_url);
 let ready=run?.conclusion==='success';
 for(const meta of Object.values(products)){try{const response=await fetch('https://ningle-42411164.github.io'+meta.base+'release-info.json?sha='+commit,{signal:AbortSignal.timeout(15000)});const info=await response.json();ready=ready&&info.commit===commit&&info.version===meta.version}catch{ready=false;}}
 if(ready){console.log('两站点版本与提交一致，Pages成功 '+run.html_url);process.exit(0);}
 console.log('等待站点部署 '+attempt);await new Promise(r=>setTimeout(r,10000));
}
throw Error('站点验证未完成，保留草稿和附件，不发布 Release');
