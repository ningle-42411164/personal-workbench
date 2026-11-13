import {saveAchievementMetadata} from '../data/achievements.js';
import {validateWorkbenchData,emptyWorkbenchData} from '../data/workbenchData.js';
import {applyDueReminders} from '../data/reminders.js';
import {equal} from './equal.js';
export function createOfflineStore({indexedDB=globalThis.indexedDB,name='personal-workbench.offline.data.v1'}={}) {
 let opening;const listeners=new Set();
 const open=()=>opening??=new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result)};r.onerror=()=>reject(Error('无法打开脱机保存空间'));});
 async function transaction(change){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');let state,failure,changed,result;store.get('data').onsuccess=e=>{try{state=e.target.result??{data:emptyWorkbenchData(),revision:0};const before=JSON.stringify([state.data,state.achievements]);result=change(state);validateWorkbenchData(state.data);changed=before!==JSON.stringify([state.data,state.achievements]);if(changed)state.revision++;store.put(state,'data')}catch(e){failure=e;tx.abort()}};tx.oncomplete=()=>{if(changed)listeners.forEach(fn=>fn(state));resolve(result===undefined?state:{...state,localEffects:result})};tx.onerror=tx.onabort=()=>reject(failure??Error('脱机保存失败，原数据及草稿保留'));});}
 return {read:()=>transaction(()=>{}),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
 save(data,revision,options={}){const {reminderNow,skipReminderIds=[],importing}=options;return transaction(state=>{if(state.revision!==revision)throw Error('其他窗口已修改数据，草稿保留，请重新核对');const previous=state.data;state.data=structuredClone(validateWorkbenchData(data));if(reminderNow&&!importing)state.data.items=applyDueReminders(state.data.items,new Date(reminderNow),skipReminderIds);return saveAchievementMetadata(state,previous,options)})},
 checkReminders(now,skip=[]){return transaction(state=>{state.data.items=applyDueReminders(state.data.items,new Date(now),skip)})},
 async close(){(await opening)?.close();listeners.clear()}};
}
