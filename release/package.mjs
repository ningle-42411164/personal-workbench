import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
const root=process.cwd(),products=JSON.parse(fs.readFileSync('release/products.json')),commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const output=path.resolve(process.argv[2]||'release-assets');fs.mkdirSync(output,{recursive:true});
const run=(c,args,cwd)=>execFileSync(c,args,{cwd,stdio:'inherit'});
function zip(dir,dest){if(fs.existsSync(dest))throw Error('附件已存在，禁止覆盖：'+dest);if(process.platform==='win32')run('powershell',['-NoProfile','-Command',"Compress-Archive -Path '"+dir.replaceAll("'","''")+"/*' -DestinationPath '"+dest.replaceAll("'","''")+"'"],dir);else run('zip',['-q','-r',dest,'.'],dir);}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'workbench-release-'));
for(const product of ['cloud','offline']){
 const meta={product,...products[product],commit};const prefix='personal-workbench-'+(product==='offline'?'offline-':'')+'v'+meta.version;
 const source=path.join(temp,product+'-source');fs.mkdirSync(source);
 const archive=path.join(temp,product+'.zip');
 const paths=['src','public','tests','scripts','release','index.html','vite.config.js','package.json','package-lock.json','README.md','LICENSE','docs/version-history.md','services/workbench-api/src','services/workbench-api/test','services/workbench-api/scripts','services/workbench-api/package.json','services/workbench-api/package-lock.json','services/workbench-api/migrations','services/workbench-api/wrangler.example.jsonc'];
 run('git',['archive','--format=zip','--output='+archive,commit,...paths],root);
 if(process.platform==='win32')run('powershell',['-NoProfile','-Command',"Expand-Archive -LiteralPath '"+archive+"' -DestinationPath '"+source+"'"],root);else run('unzip',['-q',archive,'-d',source],root);
 fs.writeFileSync(path.join(source,'release/default-product.json'),JSON.stringify(product));
 fs.writeFileSync(path.join(source,'SOURCE.json'),JSON.stringify({...meta,configuration:'release/default-product.json selects this product; business source is unchanged',build:'npm ci; npm run build'},null,2));
 zip(source,path.join(output,prefix+'-source.zip'));
 const web=path.join(temp,product+'-web');fs.mkdirSync(web);
 const input=path.join(root,product==='offline'?'dist/offline':'dist');
 const info=JSON.parse(fs.readFileSync(path.join(input,'release-info.json')));if(info.commit!==commit||info.version!==meta.version||info.product!==product)throw Error('构建来源不匹配');
 for(const file of fs.readdirSync(input)){if(product==='cloud'&&file==='offline')continue;fs.cpSync(path.join(input,file),path.join(web,file),{recursive:true});}
 fs.writeFileSync(path.join(web,'DEPLOY.txt'),meta.label+' '+meta.version+'\n来源提交 '+commit+'\n部署路径 '+meta.base+'\n静态成品，非 Windows 安装包；请使用 HTTPS 或 localhost 静态服务，不保证双击 HTML。首次联网并等待缓存完成后才能离线。更新需接受应用更新提示。\n请先导出 JSON 备份；导入会整份覆盖本产品数据。两产品数据不自动互通。\n'+(product==='cloud'?'云端仅配置的所有者可用；需要兼容 Worker、OAuth 回调和所有者授权，非多人服务。':'无需云凭据，不启动业务云请求。'));
 zip(web,path.join(output,prefix+'-web.zip'));
}
console.log('Packages: '+output);
