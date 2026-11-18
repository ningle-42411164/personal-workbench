import {createSyncStore,copy,equal,syncSupported} from '../sync/syncStore.js';
import {emptyWorkbenchData,validateWorkbenchData} from '../data/workbenchData.js';
export const PUBLIC_DATABASE='personal-workbench.public.accounts.v1';
export const accountKey=id=>id ? 'account:'+encodeURIComponent(id) : 'anonymous';
export const publicStore=({indexedDB,name=PUBLIC_DATABASE,id=null}={})=>createSyncStore({indexedDB,name,stateKey:accountKey(id),storage:{getItem:()=>null},ownerPhone:true});
// 同一公开数据库里的两个独立账号记录在一次事务中关联；中断或失败不清空匿名数据。
export async function associateAnonymous({indexedDB=globalThis.indexedDB,name=PUBLIC_DATABASE,account,expectedRevision,includeAnonymous=true,now=()=>new Date().toISOString()}) {
  const anonymous=publicStore({indexedDB,name}),target=publicStore({indexedDB,name,id:account.id});
  try { await anonymous.read();await target.read(); } finally {await anonymous.close();await target.close();}
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');let source,destination,loaded=0,failure,result;
    const apply=()=>{if(++loaded!==2)return;try{
      if(includeAnonymous&&source.revision!==expectedRevision)throw Error('本机事项在登录期间已变化，请重新核对关联数量。');
      const items=includeAnonymous?source.data.items:[];
      for(const item of items){const old=destination.data.items.find(x=>x.id===item.id);if(old&&!equal(old,item))throw Error('本机与此账号缓存有不同内容的同 ID 记录，双方均保留，请先导出核对。');if(!old)destination.data.items.push(copy(item));}
      validateWorkbenchData(destination.data);
      if(items.length){destination.publicAssociationArchive??=[];destination.publicAssociationArchive.push({at:now(),data:copy(source.data),achievements:source.achievements?copy(source.achievements):null});if(!destination.achievements&&source.achievements)destination.achievements=copy(source.achievements);}
      for(const item of destination.data.items)if(syncSupported(item)&&!destination.bindings[item.id]&&!destination.heldLocal?.[item.id]){destination.bindings[item.id]={version:0,base:null};destination.dirty[item.id]=true;}
      destination.enabled=true;destination.publicAccount={id:account.id,email:account.email};destination.revision++;
      store.put(destination,accountKey(account.id));
      if(includeAnonymous&&items.length){source.data=emptyWorkbenchData();delete source.achievements;source.revision++;store.put(source,'anonymous');}
      result=destination;
    }catch(error){failure=error;tx.abort();}};
    store.get('anonymous').onsuccess=e=>{source=e.target.result;apply();};store.get(accountKey(account.id)).onsuccess=e=>{destination=e.target.result;apply();};
    tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(failure??Error('关联保存未完成；原本机事项与账号内容保持不变。'));
  });}finally{db.close();}
}
