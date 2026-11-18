import {shallowRef,onBeforeUnmount} from 'vue';
import {publicWorkspace} from './session.js';
export const fallbackNotice=shallowRef(0),localFallback=shallowRef(false);
export const prepareCloudCallback=()=>null;
export const startCloudConnection=()=>{};
export function useCloudWorkbench(){const state=shallowRef(publicWorkspace.getState());const off=publicWorkspace.subscribe(next=>state.value=next.state);onBeforeUnmount(off);return {state};}
