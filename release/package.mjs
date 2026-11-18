import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import{args,planFor,context,run,git,isMain,fileHash,zipName}from'./core.mjs';
const quote=value=>"'"+value.replaceAll("'","''")+"'";
export function extract(zip,dest){fs.mkdirSync(dest,{recursive:true});if(process.platform==='win32')run('powershell',['-NoProfile','-Command','Expand-Archive -LiteralPath '+quote(zip)+' -DestinationPath '+quote(dest)]);else run('unzip',['-q',zip,'-d',dest]);}
export function inspect(zip,plan,product,kind){const dest=fs.mkdtempSync(path.join(os.tmpdir(),'workbench-package-'));extract(zip,dest);const info=JSON.parse(fs.readFileSync(path.join(dest,kind==='source'?'SOURCE.json':'release-info.json')));if(info.commit!==plan.commit||info.product!==product||info.version!==plan.products[product].version)throw Error('包内产品/版本/提交错误 '+zip);return dest;}
function compress(dir,dest){if(process.platform==='win32')run('powershell',['-NoProfile','-Command','Compress-Archive -Path '+quote(dir+'/*')+' -DestinationPath '+quote(dest)]);else run('zip',['-X','-q','-r',dest,'.'],dir);}
export async function packageProduct(ctx,product){const {plan,state,step}=ctx,dir=ctx.productDir(product),out=path.join(dir,'packages');fs.mkdirSync(out,{recursive:true});state.products[product]??={};
 for(const kind of ['source','web']){
  const name=zipName(plan,product,kind),dest=path.join(out,name);
  await step(product+'.package.'+kind,async()=>{
   // rename 后但记录前中断：实际解压确认后接纳成品；损坏的正式文件不静默覆盖。
   if(!fs.existsSync(dest)){
    const stage=fs.mkdtempSync(path.join(os.tmpdir(),'workbench-pack-'));
    if(kind==='source'){
     const archive=path.join(os.tmpdir(),'workbench-source-'+crypto.randomUUID()+'.zip');
     run('git',['archive','--format=zip','--output='+archive,plan.commit,'src','public','tests','scripts','release','.github','index.html','vite.config.js','package.json','package-lock.json','README.md','LICENSE','docs/version-history.md',...(git('ls-tree','--name-only',plan.commit,'docs/release-setup.md')?['docs/release-setup.md']:[]),'services/workbench-api/src','services/workbench-api/test','services/workbench-api/scripts','services/workbench-api/package.json','services/workbench-api/package-lock.json','services/workbench-api/migrations','services/workbench-api/wrangler.example.jsonc']);extract(archive,stage);
     fs.writeFileSync(path.join(stage,'release/default-product.json'),JSON.stringify(product));fs.writeFileSync(path.join(stage,'SOURCE.json'),JSON.stringify({product,...plan.products[product],commit:plan.commit,configuration:'default-product.json selects this product; business source unchanged',build:'npm ci; npm run build'},null,2));
    }else{fs.cpSync(path.join(dir,'site'),stage,{recursive:true});fs.writeFileSync(path.join(stage,'DEPLOY.txt'),plan.products[product].label+' '+plan.products[product].version+'\n来源提交 '+plan.commit+'\n部署路径 '+plan.products[product].base+'\n静态网页，非Windows安装包。使用HTTPS或localhost；首次联网缓存完成后可离线，接受更新提示升级。源码包默认构建对应产品。更新前导出JSON备份；导入整份覆盖并保留现有同步绑定保护。含云版仍仅供现有所有者使用，需要兼容Worker和OAuth；脱机版无业务云请求。');}
    const temp=dest+'.partial.zip';if(fs.existsSync(temp))fs.unlinkSync(temp);compress(stage,temp);inspect(temp,plan,product,kind);fs.renameSync(temp,dest);
   }else inspect(dest,plan,product,kind);
   return {name,sha256:fileHash(dest),size:fs.statSync(dest).size};
  },record=>{if(!fs.existsSync(dest))return false;if(fileHash(dest)!==record.sha256)throw Error('成品ZIP校验值冲突 '+name);return true;});
 }
}
if(isMain(import.meta.url)){const a=args(),ctx=context(planFor(a.target));for(const p of ctx.plan.selected)await packageProduct(ctx,p);}
