<script setup>
import { onMounted,onBeforeUnmount,ref } from 'vue';
import Sortable from 'sortablejs';
import { isPinned, subgroup } from '../data/itemOrder.js';
const props=defineProps({items:Array});
const emit=defineEmits(['move','pin','exit']);
const list=ref(null);
let sorter, snapshot, cancelled=false, dragging=false;
function capture(e) { sorter.option('delay',e.target.closest('.sort-handle') ? 0 : 350); cancelled=false; }
function outside(e) {
  if (e.target.closest('.sync-control, .success-entry')) return; // 查看页头状态时保留当前排序上下文。
  if (dragging || list.value.contains(e.target) || e.target.closest('.sort-toggle') === list.value.closest('section').querySelector('.sort-toggle')) return;
  e.preventDefault(); e.stopImmediatePropagation(); emit('exit');
}
function cancel(){cancelled=true;}
function guardPan(e){if(list.value?.querySelector(".grabbed") && e.cancelable)e.preventDefault();}
onMounted(()=>{
  sorter=Sortable.create(list.value,{supportPointer:false,forceFallback:true,animation:140,delay:350,touchStartThreshold:5,fallbackTolerance:3,
    scroll:true,scrollSensitivity:60,scrollSpeed:12,filter:'button',preventOnFilter:false,chosenClass:'grabbed',
    onChoose(){snapshot=props.items.map(x=>({...x}));},
    onStart(){dragging=true;},onMove(e){return e.dragged.dataset.group===e.related.dataset.group;},
    onEnd(e){dragging=false;
      // 恢复 Vue 管理的 DOM；只有本机事务成功才显示最终顺序。
      e.item.remove(); list.value.insertBefore(e.item,list.value.children[e.oldIndex]??null);
      if(!cancelled && e.oldIndex!==e.newIndex) emit('move',snapshot,e.oldIndex,e.newIndex);
    }});
  list.value.addEventListener('mousedown',capture,true);
  list.value.addEventListener('touchmove',guardPan,{capture:true,passive:false});
  list.value.addEventListener('touchstart',capture,true);

  window.addEventListener('blur',cancel); document.addEventListener('touchcancel',cancel,true);
  document.addEventListener('click',outside,true);
});
onBeforeUnmount(()=>{sorter?.destroy();window.removeEventListener('blur',cancel);document.removeEventListener('touchcancel',cancel,true);document.removeEventListener('click',outside,true);});
</script>
<template><div ref="list" class="sort-list"><div v-for="item in items" :key="item.id" class="sort-row" :data-group="subgroup(item)" :class="{paused:item.status==='paused'}"><span class="sort-handle" aria-label="拖动排序">⠿</span><span>{{item.title}}<span v-if="item.urgent" class="urgent-mark inline-urgent">急需处理</span></span>
    <button type="button" class="pin-control" :aria-label="(isPinned(item) ? '取消置顶 ' : '置顶 ') + item.title" :aria-pressed="isPinned(item)" @click.stop="emit('pin',item)">
      <span aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2h12M8 14V5m-4 4 4-4 4 4"/></svg></span>
    </button></div></div></template>
<style scoped>
.sort-row{display:flex;align-items:center;gap:8px;min-height:48px;border-top:1px solid #dce5dd;user-select:none;background:#fff}.sort-row>span:nth-child(2){flex:1;overflow-wrap:anywhere}.sort-handle{display:grid;place-items:center;width:44px;height:44px;touch-action:none;cursor:grab}.grabbed{box-shadow:0 4px 14px #243d3640;background:#edf4ed}.paused{color:#52605a}
.pin-control { flex:0 0 44px; height:44px; display:grid; place-items:center; padding:0; background:transparent; }
.pin-control span { box-sizing:border-box; width:30px; height:30px; border-radius:6px; border:1px solid #a3aba7; background:#f0f1ef; color:#424c47; display:grid; place-items:center; }
.pin-control[aria-pressed="true"] span { background:#244d43; border-color:#244d43; color:white; }
.pin-control svg { width:16px; height:16px; }
</style>
