import {shallowRef} from 'vue';
export const fallbackNotice=shallowRef(0),localFallback=shallowRef(false);
export const prepareCloudCallback=()=>null;
export const startCloudConnection=()=>{};
export const useCloudWorkbench=()=>({state:shallowRef({auth:{state:'disconnected'},message:''})});
