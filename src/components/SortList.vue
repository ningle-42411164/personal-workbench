<script setup>
import { onMounted,onBeforeUnmount,ref } from 'vue';
import Sortable from 'sortablejs';
import { subgroup } from '../data/itemOrder.js';
const props=defineProps({items:Array});
const emit=defineEmits(['move','pin','exit']);
const list=ref(null);
let sorter, snapshot, cancelled=false, dragging=false;
function capture(e) { sorter.option('delay',e.target.closest('.sort-handle') ? 0 : 350); cancelled=false; }
function outside(e) {
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
<template><div ref="list" class="sort-list"><div v-for="item in items" :key="item.id" class="sort-row" :data-group="subgroup(item)" :class="{paused:item.status==='paused'}"><span class="sort-handle" aria-label="拖动排序">⠿</span><span>{{item.title}}</span><button v-if="item.type==='project'" :aria-label="item.pinned?'取消置顶':'置顶'" :aria-pressed="!!item.pinned" @click="emit('pin',item)">{{item.pinned?'⬆':'↑'}}</button></div></div></template>
<style scoped>
.sort-row{display:flex;align-items:center;gap:8px;min-height:48px;border-top:1px solid #dce5dd;user-select:none;background:#fff}.sort-row>span:nth-child(2){flex:1;overflow-wrap:anywhere}.sort-handle{display:grid;place-items:center;width:44px;height:44px;touch-action:none;cursor:grab}.grabbed{box-shadow:0 4px 14px #243d3640;background:#edf4ed}.paused{color:#52605a}
</style>
