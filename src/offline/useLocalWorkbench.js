import {shallowRef,onBeforeUnmount} from 'vue';
import {createOfflineStore} from './store.js';
export function useSyncWorkbench(){
 const store=createOfflineStore(),snapshot=shallowRef(null),status=shallowRef({phase:'local'});
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('personal-workbench.offline.changed.v1'):null;
 const off=store.subscribe(state=>{snapshot.value=state;channel?.postMessage('changed')});
 if(channel)channel.onmessage=async()=>{try{snapshot.value=await store.read()}catch(e){status.value={phase:'failed',message:e.message}}};
 onBeforeUnmount(()=>{off();channel?.close();void store.close()});
 return {snapshot,status,ownerPhone:false,async initialize(){return snapshot.value=await store.read()},async save(...args){return snapshot.value=await store.save(...args)},async checkReminders(...args){return snapshot.value=await store.checkReminders(...args)}};
}
