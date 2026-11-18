import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { github } from './github.mjs';
import { extract } from './package.mjs';
import { args, planFor, REPO, isMain } from './core.mjs';

export function resumableRuns(runs, plan, currentId, attempt, includeCurrent=false) {
 return runs.filter(run => run.display_title==='Release '+plan.key &&
  (run.id===currentId ? includeCurrent||attempt>1 : run.status==='completed'));
}
export function resumableArtifacts(artifacts, currentRun, attempt, includeCurrent=false) {
 return artifacts.filter(a => !a.expired && /^release-state-(prepare|cloud|final)-\d+-\d+$/.test(a.name) &&
  (!currentRun || includeCurrent || Number(a.name.split('-').at(-1))<attempt)).sort((a,b)=>{const parts=x=>{const t=x.name.split('-');return [Number(t.at(-1)),{prepare:1,cloud:2,final:3}[t[2]]];};const aa=parts(a),bb=parts(b);return bb[0]-aa[0]||bb[1]-aa[1];});
}
export async function restore(plan, includeCurrent=false) {
 const currentId=Number(process.env.GITHUB_RUN_ID),attempt=Number(process.env.GITHUB_RUN_ATTEMPT??1);
 const runs=await github('/repos/'+REPO+'/actions/workflows/release.yml/runs?event=workflow_dispatch&per_page=50');
 for(const run of resumableRuns(runs.workflow_runs,plan,currentId,attempt,includeCurrent)) {
  const list=await github('/repos/'+REPO+'/actions/runs/'+run.id+'/artifacts?per_page=100');
  const artifact=resumableArtifacts(list.artifacts,run.id===currentId,attempt,includeCurrent)[0];
  if(!artifact)continue;
  const bytes=await github('/repos/'+REPO+'/actions/artifacts/'+artifact.id+'/zip',{binary:true,timeout:90000});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workbench-resume-')),zip=path.join(dir,'artifact.zip');
  fs.writeFileSync(zip,bytes);extract(zip,path.join(dir,'state'));
  const source=path.join(dir,'state',plan.key),file=path.join(source,'state.json');
  if(!fs.existsSync(file))throw Error('恢复产物结构错误');
  const state=JSON.parse(fs.readFileSync(file));
  if(state.plan.key!==plan.key||state.plan.commit!==plan.commit||state.plan.target!==plan.target)throw Error('恢复记录不属于本次产品与提交');
  fs.mkdirSync('.release',{recursive:true});fs.cpSync(source,path.join('.release',plan.key),{recursive:true});
  console.log('恢复已保存步骤：'+run.html_url+' / '+artifact.name);return;
 }
}
if(isMain(import.meta.url)){const a=args();await restore(planFor(a.target,a.sha),!!a.current);}
