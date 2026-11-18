// 本机只做只读计划/触发/等待。重活在 Actions；断开本机不会中断发布。
import{args,planFor,notes,REPO,zipName}from'./core.mjs';import{github}from'./github.mjs';import{waitFor}from'./http.mjs';
const a=args(),plan=planFor(a.target,a.sha);for(const p of plan.selected)notes(plan,p);
const preview={target:plan.target,commit:plan.commit,products:plan.selected.map(p=>({product:p,version:plan.products[p].version,site:'https://ningle-42411164.github.io'+plan.products[p].base,tag:plan.products[p].tag,release:plan.products[p].releaseTitle,assets:['source','web'].map(k=>zipName(plan,p,k))})),unselected:['cloud','offline'].filter(p=>!plan.selected.includes(p))};console.log(JSON.stringify(preview,null,2));
if(!a['dry-run']){
 await github('/repos/'+REPO+'/commits/'+plan.commit);
 const route='/repos/'+REPO+'/actions/workflows/release.yml/runs?event=workflow_dispatch&per_page=50';const before=await github(route);const title='Release '+plan.key;let run=before.workflow_runs.find(x=>x.display_title===title&&x.status!=='completed');
 if(!run){await github('/repos/'+REPO+'/actions/workflows/release.yml/dispatches',{method:'POST',body:{ref:'main',inputs:{target:plan.target,commit:plan.commit}}});run=await waitFor(async()=>{const runs=await github(route);return runs.workflow_runs.find(x=>x.display_title===title&&!before.workflow_runs.some(old=>old.id===x.id));},{attempts:6,interval:5000,label:'发布任务创建'});}
 console.log('发布任务：'+run.html_url+'；本机退出不影响执行。');
 if(!a['no-wait']){try{const result=await waitFor(async()=>{const current=await github('/repos/'+REPO+'/actions/runs/'+run.id);return current.status==='completed'?current:false;},{attempts:20,interval:60000,label:'发布任务（本机等待上限20分钟）'});console.log('结果：'+result.conclusion+'；中文逐项报告见任务 Summary 与 release-state-final 产物。');if(result.conclusion!=='success')process.exitCode=1;}catch(e){console.error(e.message+' 任务链接：'+run.html_url);process.exitCode=1;}}
}
