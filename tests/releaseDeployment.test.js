import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import os from'node:os';
import{context,selected,REPO,OFFLINE_REPO}from'../release/core.mjs';import{deployOffline}from'../release/deploy-offline.mjs';import{deployCloud}from'../release/deploy-cloud.mjs';
const products=JSON.parse(fs.readFileSync('release/products.json'));
for(const target of ['cloud','offline','both'])test(target+' 实际部署函数只写所选仓库，成功续跑不再部署',async t=>{
 const plan={target,selected:selected(target),products,commit:'a'.repeat(40),key:target+'-'+('a'.repeat(40))},ctx=context(plan,fs.mkdtempSync(path.join(os.tmpdir(),'deploy-fixture-'))),writes=[],oldFetch=globalThis.fetch;
 const env={GITHUB_TOKEN:'fixture',OFFLINE_PUBLISH_TOKEN:'fixture-offline',ACTIONS_ID_TOKEN_REQUEST_URL:'https://oidc.test',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'fixture-oidc',PAGES_ARTIFACT_ID:'1'},oldEnv={};for(const[k,v]of Object.entries(env)){oldEnv[k]=process.env[k];process.env[k]=v;}
 t.after(()=>{globalThis.fetch=oldFetch;for(const[k,v]of Object.entries(oldEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 let offlineHead='old';const deployed=new Set();
 for(const p of plan.selected){ctx.state.products[p]={};const site=path.join(ctx.productDir(p),'site');fs.mkdirSync(site,{recursive:true});fs.writeFileSync(path.join(site,'release-info.json'),JSON.stringify({product:p,version:products[p].version,commit:plan.commit}));}
 globalThis.fetch=async(url,o={})=>{const u=new URL(url),route=u.pathname,method=o.method??'GET';if(method!=='GET')writes.push(route);const json=x=>new Response(JSON.stringify(x));
  if(u.hostname==='oidc.test')return json({value:'fixture-oidc-value'});
  if(u.hostname==='ningle-42411164.github.io'){const p=route.startsWith('/personal-workbench-offline/')?'offline':'cloud';assert.ok(deployed.has(p));if(route.endsWith('release-info.json'))return json({product:p,version:products[p].version,commit:plan.commit});return new Response(route.endsWith('.js')?'script':'<script src="./app.js"></script>');}
  if(route==='/repos/'+REPO+'/pages/deployments'&&method==='POST'){deployed.add('cloud');return json({id:'cloud-id'});}
  if(route==='/repos/'+REPO+'/pages/deployments/'+plan.commit)return deployed.has('cloud')?json({status:'succeed'}):new Response('{}',{status:404});
  if(route==='/repos/'+REPO+'/pages/deployments/cloud-id')return json({status:'succeed'});
  if(!route.startsWith('/repos/'+OFFLINE_REPO))throw Error('未授权隔离路由 '+route);
  assert.equal(o.headers.Authorization,'Bearer fixture-offline');
  if(route.endsWith('/git/ref/heads/gh-pages'))return json({object:{sha:offlineHead}});
  if(route.includes('/git/commits/')&&method==='GET')return json({tree:{sha:'tree'}});
  if(route.includes('/git/trees/')&&method==='GET')return json({tree:[]});
  if(route.endsWith('/git/blobs')||route.endsWith('/git/trees'))return json({sha:'new-tree'});
  if(route.endsWith('/git/commits')&&method==='POST')return json({sha:'new-commit'});
  if(route.endsWith('/git/refs/heads/gh-pages')&&method==='PATCH'){offlineHead='new-commit';deployed.add('offline');return json({});}
  if(route.endsWith('/pages/builds/latest'))return json({commit:offlineHead,status:'built'});
  throw Error('未知隔离路由 '+route);
 };
 for(const p of plan.selected)await(p==='cloud'?deployCloud(ctx):deployOffline(ctx));const count=writes.length;
 for(const p of plan.selected)await(p==='cloud'?deployCloud(ctx):deployOffline(ctx));assert.equal(writes.length,count);
 if(plan.selected.includes('cloud')){delete ctx.state.steps['cloud.deploy'];delete ctx.state.products.cloud.deployment;await deployCloud(ctx);assert.equal(writes.length,count);assert.equal(ctx.state.steps['cloud.deploy'].status,'success');}
 if(target==='cloud')assert.equal(writes.some(x=>x.startsWith('/repos/'+OFFLINE_REPO)),false);
 if(target==='offline')assert.equal(writes.some(x=>x.startsWith('/repos/'+REPO+'/')),false);
});
