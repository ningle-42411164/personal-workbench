// 单一明确发布动作：必须先提交全部本批代码；不自动升号、不移动既有标签。
import fs from 'node:fs';import{execFileSync}from'node:child_process';
const run=(cmd,args,cwd=process.cwd())=>execFileSync(cmd,args,{cwd,stdio:'inherit',shell:process.platform==='win32'&&cmd==='npm'});
if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw Error('请在干净的发布工作树执行');
run('npm',['test']);run('npm',['test'],'services/workbench-api');run('npm',['run','check'],'services/workbench-api');run('npm',['run','build:all']);
run(process.execPath,['scripts/check-products.mjs']);
if(!fs.existsSync('release-assets'))run(process.execPath,['release/package.mjs']);
run(process.execPath,['release/verify.mjs']);
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
for(const meta of Object.values(JSON.parse(fs.readFileSync('release/products.json')))){
 let target;try{target=execFileSync('git',['rev-parse',meta.tag+'^{commit}'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{}
 if(target&&target!==sha)throw Error('标签已指向其他提交，不能覆盖');if(!target)run('git',['tag',meta.tag,sha]);
}
run('git',['push','origin','HEAD:main',...Object.values(JSON.parse(fs.readFileSync('release/products.json'))).map(x=>x.tag)]);
run(process.execPath,['release/deploy-offline.mjs']);
run(process.execPath,['release/verify-online.mjs']);
run(process.execPath,['release/publish.mjs']);
