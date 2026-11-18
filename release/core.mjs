import fs from 'node:fs';import path from 'node:path';import {createHash}from'node:crypto';import{execFileSync}from'node:child_process';import{pathToFileURL}from'node:url';
export const REPO='ningle-42411164/personal-workbench',OFFLINE_REPO='ningle-42411164/personal-workbench-offline';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const fileHash=file=>hash(fs.readFileSync(file));
export function selected(target){if(!['cloud','offline','both'].includes(target))throw Error('target 必须为 cloud、offline 或 both');return target==='both'?['cloud','offline']:[target];}
export function args(argv=process.argv.slice(2)){const result={};for(let i=0;i<argv.length;i++){if(!argv[i].startsWith('--'))throw Error('未知参数 '+argv[i]);result[argv[i].slice(2)]=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;}return result;}
export function run(command,argv,cwd=process.cwd()){return execFileSync(command,argv,{cwd,stdio:'inherit',shell:process.platform==='win32'&&command==='npm',timeout:900000,env:{...process.env,npm_config_fetch_retries:'1',npm_config_fetch_timeout:'60000'}});}
export function git(...argv){return execFileSync('git',argv,{encoding:'utf8',timeout:60000}).trim();}
export const isMain=url=>process.argv[1]&&url===pathToFileURL(path.resolve(process.argv[1])).href;
export function manifest(dir){const result={};function visit(current,prefix=''){for(const entry of fs.readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const name=prefix+entry.name;if(entry.isSymbolicLink())throw Error('产物不能包含符号链接');if(entry.isDirectory())visit(path.join(current,entry.name),name+'/');else result[name]=fileHash(path.join(current,entry.name));}}visit(dir);return result;}
export function matches(dir,expected){try{return JSON.stringify(manifest(dir))===JSON.stringify(expected)}catch{return false;}}
export const zipName=(plan,product,kind)=>'personal-workbench-'+(product==='offline'?'offline-':'')+'v'+plan.products[product].version+'-'+kind+'.zip';
export function notes(plan,product){const meta=plan.products[product],text=plan.changelog;const blocks=[...text.matchAll(/<!-- release:([^>]+) -->([\s\S]*?)<!-- \/release -->/g)];const found=blocks.find(x=>x[1].split(/\s+/).includes(product+':'+meta.version));if(!found||!/[\u4e00-\u9fff]/.test(found[2]))throw Error('缺少本版中文更新日志 '+product+':'+meta.version);return '产品：'+meta.label+' '+meta.version+'\n\n来源提交：'+plan.commit+'\n\n'+found[2].trim()+'\n\n入口：https://ningle-42411164.github.io'+meta.base+'\n\n下载：source.zip 是默认构建本产品的源码；web.zip 是静态网页成品。源码解压后 npm ci、npm run build。按包内 DEPLOY.txt 部署，非 Windows 安装包。更新前导出 JSON 备份，整份恢复沿用现有确认与同步绑定保护。';}
export function planFor(target,commit=git('rev-parse','HEAD')){selected(target);if(!/^[a-f0-9]{40}$/.test(commit))throw Error('必须指定完整提交 SHA');const products=JSON.parse(git('show',commit+':release/products.json'));for(const product of selected(target)){const m=products[product];if(!/^\d+\.\d+\.\d+$/.test(m.version)||m.tag!==(product==='cloud'?'v':'offline-v')+m.version)throw Error('版本与标签不一致');}const changelog=git('show',commit+':docs/version-history.md');return {target,commit,products,changelog,selected:selected(target),key:target+'-'+commit};}
export function saveJson(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.partial';fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,file);}
export function context(plan,root=path.resolve('.release',plan.key)){
 fs.mkdirSync(root,{recursive:true});const stateFile=path.join(root,'state.json'),fingerprint=hash(JSON.stringify({commit:plan.commit,target:plan.target,products:plan.selected.map(p=>plan.products[p]),node:process.version,platform:process.platform}));
 const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):{plan,fingerprint,steps:{},products:{},createdAt:new Date().toISOString()};
 if(state.fingerprint!==fingerprint||state.plan.key!==plan.key)throw Error('保存记录的提交、产品或构建环境不符，禁止混用');
 const save=()=>saveJson(stateFile,state);
 async function step(name,work,validate=()=>true){if(state.steps[name]?.status==='success'&&await validate(state.steps[name].result)){console.log('复用已验证步骤 '+name);return state.steps[name].result;}state.steps[name]={status:'running'};save();try{const result=await work();state.steps[name]={status:'success',result,finishedAt:new Date().toISOString()};save();return result;}catch(e){state.steps[name]={status:'failed',error:e.message};save();throw e;}}
 return {plan,root,state,save,step,productDir:p=>path.join(root,p)};
}

// 部署和发布前重新核对跨任务传递的文件，旧成功标记不能替代文件本身。
export function assertSite(ctx, product) {
 const expected=ctx.state.steps[product+'.build'];
 if(expected?.status!=='success'||!matches(path.join(ctx.productDir(product),'site'),expected.result.files))throw Error('站点产物与已验证记录不符 '+product);
}
export function assertPackages(ctx, product) {
 for(const kind of ['source','web']){
  const file=path.join(ctx.productDir(product),'packages',zipName(ctx.plan,product,kind));
  const packed=ctx.state.steps[product+'.package.'+kind],verified=ctx.state.steps[product+'.verify.'+kind];
  if(packed?.status!=='success'||verified?.status!=='success'||!fs.existsSync(file)||fileHash(file)!==packed.result.sha256||fileHash(file)!==verified.result.sha256)throw Error('附件与已验证记录不符 '+product+'/'+kind);
 }
}
export function captureSite(source, destination, excluded=[]) {
 const stage=destination+'.stage-'+crypto.randomUUID();fs.mkdirSync(stage,{recursive:true});
 for(const name of fs.readdirSync(source)){if(!excluded.includes(name))fs.cpSync(path.join(source,name),path.join(stage,name),{recursive:true});}
 // 中断最多留下独立旧目录，不把上次未完成内容混入新构建。
 if(fs.existsSync(destination))fs.renameSync(destination,destination+'.previous-'+crypto.randomUUID());
 fs.renameSync(stage,destination);
}
