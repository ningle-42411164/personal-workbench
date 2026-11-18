// 隔离测试报告不能写入正式工作流的输出或 Summary。
delete process.env.GITHUB_OUTPUT;delete process.env.GITHUB_STEP_SUMMARY;
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import YAML from 'yaml';
import {execFileSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
import {selected,context,hash,zipName,notes,REPO,OFFLINE_REPO,git,planFor,fileHash}from'../release/core.mjs';
import {request,waitFor}from'../release/http.mjs';
import {ensureTag,preflight}from'../release/remote.mjs';
import {publishProduct,verifyDownloads}from'../release/publish.mjs';
import {packageProduct,inspect}from'../release/package.mjs';
import {resultStatus,report}from'../release/report.mjs';
const products=JSON.parse(fs.readFileSync('release/products.json'));
const plan=target=>({target,selected:selected(target),products,changelog:fs.readFileSync('docs/version-history.md','utf8'),commit:'a'.repeat(40),key:target+'-'+('a'.repeat(40))});
function fixture(t,target){const ctx=context(plan(target),fs.mkdtempSync(path.join(os.tmpdir(),'release-test-')));for(const p of ctx.plan.selected){ctx.state.products[p]={};fs.mkdirSync(path.join(ctx.productDir(p),'packages'),{recursive:true});for(const k of ['source','web']){const file=path.join(ctx.productDir(p),'packages',zipName(ctx.plan,p,k));fs.writeFileSync(file,p+'-'+k);for(const stage of ['package','verify'])ctx.state.steps[p+'.'+stage+'.'+k]={status:'success',result:{sha256:fileHash(file)}};}}const oldFetch=globalThis.fetch,oldToken=process.env.GITHUB_TOKEN;process.env.GITHUB_TOKEN='isolated-test';t.after(()=>{globalThis.fetch=oldFetch;if(oldToken===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=oldToken;});
 const state={tags:{},releases:{},bytes:{},writes:[],downloads:[],failUpload:null,failDownload:null,nextId:1};
 globalThis.fetch=async(url,options={})=>{const u=new URL(url),method=options.method??'GET',route=u.pathname;const body=options.body?JSON.parse(Buffer.isBuffer(options.body)?'null':options.body):null;
  if(method!=='GET')state.writes.push({route,method});
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
  if(u.hostname==='public.test'){assert.equal(options.headers?.Authorization,undefined);state.downloads.push(route);if(route===state.failDownload)throw Error('模拟下载中断');return new Response(state.bytes[route.slice(1)]);}
  if(route.includes('/git/ref/tags/')){const tag=route.split('/git/ref/tags/')[1];return state.tags[tag]?json({object:{type:'commit',sha:state.tags[tag]}}):json({},404);}
  if(route.endsWith('/git/refs')&&method==='POST'){state.tags[body.ref.slice(10)]=body.sha;return json({});}
  if(route.includes('/releases/tags/'))return state.releases[route.split('/releases/tags/')[1]]?json(state.releases[route.split('/releases/tags/')[1]]):json({},404);
  if(route.endsWith('/releases')&&method==='POST'){const release={...body,id:state.nextId++,html_url:'https://release.test/'+body.tag_name,assets:[]};state.releases[body.tag_name]=release;return json(release);}
  if(u.hostname==='uploads.github.com'){const name=u.searchParams.get('name');if(name===state.failUpload)throw Error('模拟上传结果未完成');const id=Number(route.split('/').at(-2)),release=Object.values(state.releases).find(r=>r.id===id);state.bytes[name]=options.body;const asset={id:state.nextId++,name,size:options.body.length,digest:'sha256:'+hash(options.body),browser_download_url:'https://public.test/'+name};release.assets.push(asset);return json(asset);}
  if(route.match(/\/releases\/\d+$/)&&method==='PATCH'){const release=Object.values(state.releases).find(r=>r.id===Number(route.split('/').at(-1)));Object.assign(release,body);return json(release);}
  if(route.includes('/commits/'))return json({sha:ctx.plan.commit});
  if(route==='/repos/'+OFFLINE_REPO)return json({permissions:{push:true}});
  throw Error('不允许的隔离请求 '+method+' '+route);
 };
 return {ctx,state};
}
for(const target of ['cloud','offline','both'])test(target+' 只写入所选产品，未选版旧标签可保持旧提交',async t=>{const{ctx,state}=fixture(t,target);for(const p of ['cloud','offline'].filter(p=>!ctx.plan.selected.includes(p)))state.tags[products[p].tag]='b'.repeat(40);for(const p of ctx.plan.selected){await ensureTag(ctx.plan,p);await ctx.step(p+'.publish',()=>publishProduct(ctx,p));await verifyDownloads(ctx,p);}assert.equal(Object.keys(state.releases).length,ctx.plan.selected.length);for(const p of ['cloud','offline'].filter(p=>!ctx.plan.selected.includes(p)))assert.equal(state.tags[products[p].tag],'b'.repeat(40));assert.equal(state.downloads.length,ctx.plan.selected.length*2);});
test('标签冲突停止，不移动或创建Release',async t=>{const{ctx,state}=fixture(t,'cloud');state.tags[products.cloud.tag]='b'.repeat(40);await assert.rejects(ensureTag(ctx.plan,'cloud'),/标签冲突/);assert.deepEqual(state.writes,[]);});
test('上传中断续跑复用已成功附件；正式同名不同内容拒绝覆盖',async t=>{const{ctx,state}=fixture(t,'cloud');await ensureTag(ctx.plan,'cloud');state.failUpload=zipName(ctx.plan,'cloud','web');await assert.rejects(publishProduct(ctx,'cloud'));assert.equal(Object.values(state.releases)[0].assets.length,1);state.failUpload=null;await publishProduct(ctx,'cloud');assert.equal(Object.values(state.releases)[0].assets.length,2);const count=state.writes.length;fs.writeFileSync(path.join(ctx.productDir('cloud'),'packages',zipName(ctx.plan,'cloud','source')),'different');await assert.rejects(publishProduct(ctx,'cloud'),/不符/);assert.equal(state.writes.length,count);});
test('公开下载中断只补失败文件，不重新上传/打包；报告明确已发布但未核验',async t=>{const{ctx,state}=fixture(t,'cloud');await ensureTag(ctx.plan,'cloud');await ctx.step('cloud.publish',()=>publishProduct(ctx,'cloud'));ctx.state.steps['cloud.deploy']={status:'success'};state.failDownload='/'+zipName(ctx.plan,'cloud','web');await assert.rejects(verifyDownloads(ctx,'cloud'));assert.equal(resultStatus(ctx.state,'cloud'),'已发布，下载核验未完成');const sourceCount=state.downloads.filter(x=>x.endsWith('source.zip')).length,writes=state.writes.length;state.failDownload=null;await verifyDownloads(ctx,'cloud');assert.equal(state.downloads.filter(x=>x.endsWith('source.zip')).length,sourceCount);assert.equal(state.writes.length,writes);assert.equal(resultStatus(ctx.state,'cloud'),'全部成功');});
test('错误下载哈希拒绝成功；文件不成为正式产物',async t=>{const{ctx,state}=fixture(t,'cloud');await ensureTag(ctx.plan,'cloud');await publishProduct(ctx,'cloud');state.bytes[zipName(ctx.plan,'cloud','source')]=Buffer.from('corrupt');await assert.rejects(verifyDownloads(ctx,'cloud'),/校验不符/);assert.equal(fs.existsSync(path.join(ctx.productDir('cloud'),'public',zipName(ctx.plan,'cloud','source'))),false);});
test('记录按固定输入复用，变化或结果文件不匹配不能跳过',async()=>{const p=plan('cloud'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'release-step-'));let count=0,ctx=context(p,dir);await ctx.step('tests',()=>++count);ctx=context(p,dir);await ctx.step('tests',()=>++count);assert.equal(count,1);await ctx.step('tests',()=>++count,()=>false);assert.equal(count,2);assert.throws(()=>context({...p,commit:'b'.repeat(40)},dir),/不符/);});
test('读取最多两次、写请求一次、权限不足立即失败、轮询有上限',async()=>{let calls=0;await assert.rejects(request('https://fake.test',{fetcher:async()=>{calls++;throw Error('timeout')},sleep:async()=>{}}));assert.equal(calls,2);calls=0;await assert.rejects(request('https://fake.test',{method:'POST',fetcher:async()=>{calls++;throw Error('unknown result')}}));assert.equal(calls,1);calls=0;await assert.rejects(request('https://fake.test',{fetcher:async()=>{calls++;return new Response('{}',{status:403})}}),/403/);assert.equal(calls,1);await assert.rejects(waitFor(async()=>false,{attempts:2,sleep:async()=>{}}),/限定等待/);});
test('跨仓库缺授权明确失败；cloud不要求脱机授权',async t=>{const{ctx}=fixture(t,'offline'),old=process.env.OFFLINE_PUBLISH_TOKEN;delete process.env.OFFLINE_PUBLISH_TOKEN;t.after(()=>{if(old!==undefined)process.env.OFFLINE_PUBLISH_TOKEN=old;});await assert.rejects(preflight(ctx.plan),/跨仓库授权/);await preflight(plan('cloud'));});
test('两版部分成功不能汇总为全部成功',()=>{const ctx=context(plan('both'),fs.mkdtempSync(path.join(os.tmpdir(),'release-report-')));ctx.state.products={cloud:{},offline:{error:'权限不足'}};for(const name of ['deploy','publish','download.source','download.web'])ctx.state.steps['cloud.'+name]={status:'success'};assert.equal(report(ctx),false);const text=fs.readFileSync(path.join(ctx.root,'报告.md'),'utf8');assert.match(text,/部分成功/);assert.match(text,/权限不足/);});
test('工作流预演/普通Push无发布；独立cloud任务避免offline触发含云部署',()=>{const ci=YAML.parse(fs.readFileSync('.github/workflows/deploy-pages.yml','utf8')),workflow=YAML.parse(fs.readFileSync('.github/workflows/release.yml','utf8'));assert.ok(ci.on.push);assert.equal(JSON.stringify(ci).includes('deploy-pages@'),false);assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);assert.equal(workflow.jobs.cloud.if,"needs.prepare.outputs.cloud_deploy == 'true'");assert.equal(workflow.jobs.prepare.environment,undefined);assert.equal(workflow.jobs.finish.environment,undefined);const run=fs.readFileSync('release/run.mjs','utf8');assert.ok(run.includes("if(!a['dry-run'])"));assert.ok(run.includes("inputs:{target:plan.target,commit:plan.commit}"));});
test('三个真实CLI预演无凭据也成功，不创建标签或发布记录',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'release-dry-'));fs.mkdirSync(path.join(dir,'release'));fs.mkdirSync(path.join(dir,'docs'));fs.writeFileSync(path.join(dir,'release/products.json'),JSON.stringify(products));fs.copyFileSync('docs/version-history.md',path.join(dir,'docs/version-history.md'));
 const execute=(...argv)=>execFileSync('git',argv,{cwd:dir,stdio:'pipe'});execute('init');execute('add','.');execute('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture');
 for(const target of ['cloud','offline','both']){const out=execFileSync(process.execPath,[fileURLToPath(new URL('../release/run.mjs',import.meta.url)),'--target',target,'--dry-run'],{cwd:dir,encoding:'utf8',env:{...process.env,GITHUB_ACTIONS:'true',GITHUB_TOKEN:''}});const preview=JSON.parse(out);assert.equal(preview.products.length,selected(target).length);}
 assert.equal(execute('tag').toString().trim(),'');assert.equal(fs.existsSync(path.join(dir,'.release')),false);
});
test('实际AbortSignal超时受限，不会无限等待',async()=>{let calls=0;await assert.rejects(request('https://timeout.test',{timeout:5,attempts:2,sleep:async()=>{},fetcher:async(u,o)=>{calls++;return new Promise((resolve,reject)=>{const keep=setTimeout(()=>reject(Error('未触发超时')),1000);o.signal.addEventListener('abort',()=>{clearTimeout(keep);reject(o.signal.reason)});});}}));assert.equal(calls,2);});
test('部分打包按文件恢复，临时坏包不冒充成品，错产品与损坏成品拒绝',async()=>{const real=planFor('offline'),ctx=context(real,fs.mkdtempSync(path.join(os.tmpdir(),'release-pack-'))),site=path.join(ctx.productDir('offline'),'site');fs.mkdirSync(site,{recursive:true});fs.writeFileSync(path.join(site,'release-info.json'),JSON.stringify({product:'offline',version:real.products.offline.version,commit:real.commit}));const out=path.join(ctx.productDir('offline'),'packages');fs.mkdirSync(out);fs.writeFileSync(path.join(out,zipName(real,'offline','source')+'.partial.zip'),'interrupted');await packageProduct(ctx,'offline');const source=path.join(out,zipName(real,'offline','source')),web=path.join(out,zipName(real,'offline','web')),digest=fileHash(source);fs.unlinkSync(web);await packageProduct(ctx,'offline');assert.equal(fileHash(source),digest);assert.ok(fs.existsSync(web));assert.throws(()=>inspect(web,real,'cloud','web'),/错误/);fs.writeFileSync(source,'corrupt');await assert.rejects(packageProduct(ctx,'offline'),/校验值冲突/);});

import {resumableRuns,resumableArtifacts} from '../release/restore.mjs';
import {assertPackages,assertSite,captureSite,manifest} from '../release/core.mjs';
import {publishedMatches} from '../release/publish.mjs';

test('同一任务重跑只恢复先前产物，后续阶段可恢复本次最新记录',()=>{
 const p=plan('both'),runs=[{id:9,display_title:'Release '+p.key,status:'in_progress'},{id:8,display_title:'Release '+p.key,status:'completed'}];
 assert.deepEqual(resumableRuns(runs,p,9,1).map(x=>x.id),[8]);
 assert.deepEqual(resumableRuns(runs,p,9,2).map(x=>x.id),[9,8]);
 const artifacts=[{id:1,name:'release-state-final-9-1'},{id:2,name:'release-state-prepare-9-2'},{id:3,name:'release-state-final-9-2',expired:true}];
 assert.deepEqual(resumableArtifacts(artifacts,true,2).map(x=>x.id),[1]);
 assert.deepEqual(resumableArtifacts(artifacts,true,2,true).map(x=>x.id),[2,1]);
 const workflow=YAML.parse(fs.readFileSync('.github/workflows/release.yml','utf8'));
 for(const job of ['cloud','finish'])for(const step of workflow.jobs[job].steps.filter(s=>s.uses?.startsWith('actions/download-artifact')))assert.match(step.with.name,/needs\.(prepare|cloud)\.outputs\.artifact/);
});

test('构建替换不夹带旧文件；跨任务产物篡改会被发布门槛拦截',t=>{
 const {ctx}=fixture(t,'cloud'),source=fs.mkdtempSync(path.join(os.tmpdir(),'site-source-')),site=path.join(ctx.productDir('cloud'),'site');
 fs.mkdirSync(site);fs.writeFileSync(path.join(site,'stale.js'),'old');fs.writeFileSync(path.join(source,'index.html'),'new');captureSite(source,site);
 assert.equal(fs.existsSync(path.join(site,'stale.js')),false);ctx.state.steps['cloud.build']={status:'success',result:{files:manifest(site)}};
 assertSite(ctx,'cloud');assertPackages(ctx,'cloud');fs.writeFileSync(path.join(site,'index.html'),'corrupt');assert.throws(()=>assertSite(ctx,'cloud'),/不符/);
 fs.writeFileSync(path.join(ctx.productDir('cloud'),'packages',zipName(ctx.plan,'cloud','web')),'corrupt');assert.throws(()=>assertPackages(ctx,'cloud'),/不符/);
});

test('已发布续跑仍检查远程标签；草稿多余附件拒绝转正式',async t=>{
 const {ctx,state}=fixture(t,'cloud');await ensureTag(ctx.plan,'cloud');await publishProduct(ctx,'cloud');state.tags[products.cloud.tag]='b'.repeat(40);
 const writes=state.writes.length;await assert.rejects(publishedMatches(ctx,'cloud'),/标签提交冲突/);assert.equal(state.writes.length,writes);
 state.tags[products.cloud.tag]=ctx.plan.commit;const release=state.releases[products.cloud.tag];release.draft=true;release.assets.push({name:'unrelated.zip'});
 await assert.rejects(publishProduct(ctx,'cloud'),/附件清单/);assert.equal(release.draft,true);assert.equal(state.writes.length,writes);
});

test('prepare 两版构建均失败时真实执行器以失败退出，不报成功',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'release-failure-'));
 for(const folder of ['release','docs','node_modules'])fs.mkdirSync(path.join(dir,folder));
 fs.writeFileSync(path.join(dir,'release/products.json'),JSON.stringify(products));fs.copyFileSync('docs/version-history.md',path.join(dir,'docs/version-history.md'));
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{'build:cloud':'node -e "process.exit(7)"','build:offline':'node -e "process.exit(7)"'}}));
 const g=(...args)=>execFileSync('git',args,{cwd:dir,stdio:'pipe',encoding:'utf8'}).trim();g('init');g('add','.');g('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture');const sha=g('rev-parse','HEAD');
 const p={...plan('both'),commit:sha,key:'both-'+sha},ctx=context(p,path.join(dir,'.release',p.key));ctx.state.steps.tests={status:'success',result:{passed:true,input:sha}};ctx.save();
 const mock=path.join(dir,'network.mjs');fs.writeFileSync(mock,`globalThis.fetch=async url=>{const p=new URL(url).pathname;if(p.includes('/commits/'))return new Response('{}');if(p.includes('/git/ref/tags/'))return new Response('{}',{status:404});if(p==='/repos/${OFFLINE_REPO}')return new Response('{}');throw Error('unexpected '+p);};`);
 assert.throws(()=>execFileSync(process.execPath,['--import',pathToFileURL(mock).href,fileURLToPath(new URL('../release/execute.mjs',import.meta.url)),'--phase','prepare','--target','both','--sha',sha],{cwd:dir,stdio:'pipe',env:{...process.env,RELEASE_CONTROLLER_SHA:'',GITHUB_TOKEN:'test',OFFLINE_PUBLISH_TOKEN:'test'}}),e=>e.status===1);
 const result=JSON.parse(fs.readFileSync(path.join(ctx.root,'state.json')));assert.equal(result.complete,false);assert.match(result.fatal,/均未完成准备/);assert.ok(result.products.cloud.error);assert.ok(result.products.offline.error);
});


test('发布与回滚工作流产物引用来自已完成上游，没有引用自身 job',()=>{
 for(const file of ['release','rollback-pages']){
  const workflow=YAML.parse(fs.readFileSync('.github/workflows/'+file+'.yml','utf8'));
  for(const [name,job]of Object.entries(workflow.jobs))assert.equal(JSON.stringify(job).includes('needs.'+name+'.'),false,file+'/'+name);
 }
});


test('cloud 重跑先恢复最新总记录，避免覆盖另一版已完成下载',()=>{
 const w=YAML.parse(fs.readFileSync('.github/workflows/release.yml','utf8')),steps=w.jobs.cloud.steps;
 const restore=steps.findIndex(s=>s.run?.includes('restore.mjs')&&s.run.includes('--current'));
 const upload=steps.findIndex(s=>s.uses?.startsWith('actions/upload-pages-artifact'));
 assert.ok(restore>=0&&restore<upload);
});


test('Actions 二进制产物下载仍使用 JSON Accept，不与 Release 资产 API 混用',async t=>{
 const {github}=await import('../release/github.mjs');const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);
 globalThis.fetch=async(url,options)=>{assert.equal(options.headers.Accept,'application/vnd.github+json');return new Response(Buffer.from('zip-bytes'));};
 const bytes=await github('/repos/example/repo/actions/artifacts/1/zip',{binary:true,token:'fixture'});assert.equal(bytes.toString(),'zip-bytes');
 const workflow=YAML.parse(fs.readFileSync('.github/workflows/release.yml','utf8'));
 assert.equal(workflow.env.RELEASE_CONTROLLER_SHA,'${{ github.sha }}');
 for(const job of Object.values(workflow.jobs))assert.ok(job.steps.some(s=>s.with?.path==='.release-controller'&&s.with.ref==='${{ github.sha }}'));
});
