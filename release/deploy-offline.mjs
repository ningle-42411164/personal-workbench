import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync}from'node:child_process';import {github}from'./github.mjs';
const repo='ningle-42411164/personal-workbench-offline',root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'workbench-offline-site-'));
const git=(...args)=>execFileSync('git',args,{cwd:dir,stdio:'inherit'});
let existing=false;try{await github('/repos/'+repo+'/git/ref/heads/gh-pages');existing=true}catch(e){if(e.status!==404)throw e;}
if(existing)git('clone','--branch','gh-pages','--single-branch','https://github.com/'+repo+'.git','.');else{git('init','-b','gh-pages');git('remote','add','origin','https://github.com/'+repo+'.git');}
fs.cpSync(path.join(root,'dist/offline'),dir,{recursive:true});fs.writeFileSync(path.join(dir,'.nojekyll'),'');git('add','.');
const dirty=execFileSync('git',['status','--porcelain'],{cwd:dir,encoding:'utf8'});if(dirty){git('commit','-m','Publish offline '+JSON.parse(fs.readFileSync('release/products.json')).offline.version);git('push','origin','gh-pages');}
try{await github('/repos/'+repo+'/pages')}catch(e){if(e.status!==404)throw e;await github('/repos/'+repo+'/pages',{method:'POST',body:{source:{branch:'gh-pages',path:'/'}}});}
console.log('Offline Pages submitted');
