import {shallowRef,onBeforeUnmount} from 'vue';
import {publicWorkspace} from './session.js';
export function useSyncWorkbench(){
 const snapshot=shallowRef(publicWorkspace.getSnapshot()),status=shallowRef(publicWorkspace.getStatus());
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('personal-workbench.public.changed.v1'):null;
 let reading=false;
 const off=publicWorkspace.subscribe(next=>{snapshot.value=next.snapshot;status.value=next.status;});
 const changed=()=>channel?.postMessage('changed');
 if(channel)channel.onmessage=async event=>{if(event.data==='changed'&&!reading){reading=true;try{await publicWorkspace.reload();}finally{reading=false;}}};
 const visible=()=>{if(document.visibilityState==='visible')publicWorkspace.wake();},online=()=>publicWorkspace.wake();
 document.addEventListener('visibilitychange',visible);window.addEventListener('online',online);
 onBeforeUnmount(()=>{off();channel?.close();document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',online);void publicWorkspace.close();});
 return {snapshot,status,ownerPhone:false,public:publicWorkspace,initialize:()=>publicWorkspace.initialize(),async save(...args){const saved=await publicWorkspace.save(...args);changed();return saved;},async checkReminders(...args){const saved=await publicWorkspace.checkReminders(...args);changed();return saved;},enabled:value=>publicWorkspace.enabled(value).catch(()=>{}),resolve:input=>publicWorkspace.resolve(input).catch(()=>{})};
}
