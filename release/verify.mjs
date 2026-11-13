import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync}from'node:child_process';
const products=JSON.parse(fs.readFileSync('release/products.json')),commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const root=fs.mkdtempSync(path.join(os.tmpdir(),'workbench-verify-')),npm=process.platform==='win32'?'npm.cmd':'npm';
for(const [product,meta]of Object.entries(products))for(const kind of ['source','web']){
 const name='personal-workbench-'+(product==='offline'?'offline-':'')+'v'+meta.version+'-'+kind+'.zip',zip=path.resolve('release-assets',name),dest=path.join(root,name);fs.mkdirSync(dest);
 if(process.platform==='win32')execFileSync('powershell',['-NoProfile','-Command',"Expand-Archive -LiteralPath '"+zip+"' -DestinationPath '"+dest+"'"],{stdio:'inherit'});else execFileSync('unzip',['-q',zip,'-d',dest]);
 const info=JSON.parse(fs.readFileSync(path.join(dest,kind==='source'?'SOURCE.json':'release-info.json')));if(info.commit!==commit||info.product!==product||info.version!==meta.version)throw Error('附件元数据不一致 '+name);
 if(kind==='source'){
 execFileSync(npm,['ci','--ignore-scripts','--prefer-offline'],{cwd:dest,stdio:'inherit',shell:process.platform==='win32'});
 execFileSync(npm,['run','build'],{cwd:dest,stdio:'inherit',shell:process.platform==='win32'});
 const built=JSON.parse(fs.readFileSync(path.join(dest,product==='offline'?'dist/offline':'dist','release-info.json')));if(built.product!==product||built.commit!==commit)throw Error('源码默认构建目标错误');
 }else {for(const file of ['index.html','sw.js','manifest.webmanifest','DEPLOY.txt'])if(!fs.existsSync(path.join(dest,file)))throw Error('网页包缺文件');const manifest=JSON.parse(fs.readFileSync(path.join(dest,'manifest.webmanifest')));if(manifest.scope!==meta.base)throw Error('PWA范围不一致');}
 console.log('VERIFIED '+name);
}
console.log('Extracted packages: '+root);
