<script setup>
import { computed, ref } from 'vue';
import { daysUntil } from '../data/workbenchData.js';
const props = defineProps({ items: Array, today: Date, canEdit: Boolean });
defineEmits(['delete']);
const selected = ref(null), detail = ref(null);
const index = computed(() => Math.max(0, props.items.findIndex(item => item.id === selected.value)));
const stacked = computed(() => props.items.length >= 3);
const visible = computed(() => stacked.value ? [props.items[index.value]] : props.items);
const relative = delta => props.items[(index.value + delta + props.items.length) % props.items.length];
function select(item) { selected.value = item.id; detail.value = null; }
const remaining = item => daysUntil(item.targetDate, props.today);
</script>

<template>
  <p v-if="!items.length" class="empty">还没有重要日，选一个值得记住的日期吧。</p>
  <div v-else :class="['day-deck', { pair: items.length === 2, stack: stacked }]">
    <template v-if="stacked">
      <button v-for="delta in [1,2]" :key="relative(delta).id" type="button" class="peek" @click="select(relative(delta))"><span>{{ relative(delta).title }}</span><time>{{ relative(delta).targetDate }}</time></button>
    </template>
    <article v-for="item in visible" :key="item.id" class="day-face">
      <button type="button" class="day-name" :aria-expanded="detail === item.id" @click="detail = detail === item.id ? null : item.id">{{ item.title }}</button>
      <time :datetime="item.targetDate">{{ item.targetDate }}</time>
      <small>{{ remaining(item) > 0 ? '还有' : remaining(item) < 0 ? '已过' : '今天' }}</small>
      <div><b>{{ Math.abs(remaining(item)) }}</b> 天</div>
      <span v-if="item.priority" class="urgent-mark">优先处理</span><span v-for="tag in item.tags" :key="tag" class="project-user-tag">#{{ tag.replace(/^#+/, '') }}</span>
      <button v-if="detail === item.id" type="button" class="text-button danger" :disabled="!canEdit" @click="$emit('delete',item.id)">删除</button>
      <template v-if="stacked"><button class="prev" aria-label="上一个重要日" @click="select(relative(-1))">‹</button><button class="next" aria-label="下一个重要日" @click="select(relative(1))">›</button></template>
    </article>
    <small v-if="stacked" class="page">{{ index + 1 }} / {{ items.length }}</small>
  </div>
</template>
<style scoped>
.deck-heading,.peek { display:flex;justify-content:space-between;align-items:center;gap:8px }
.deck-heading { margin-bottom:14px }
.pair { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px }
.day-face,.peek { background:#eff5ef;color:#243d36;border:1px solid #cbd8ce;border-radius:15px;overflow-wrap:anywhere }
.day-face { position:relative;padding:16px;text-align:left;min-width:0 }
.pair .day-face { padding:12px;min-height:min(40vw,180px) }
.day-name { display:block;padding:0;background:transparent;color:inherit;font-size:18px;text-align:inherit;white-space:normal;overflow-wrap:anywhere }
.day-face time,.day-face small { display:block }.day-face small { margin-top:14px }.day-face b { font-size:clamp(28px,8vw,42px) }
.peek { min-height:48px;border-radius:14px 14px 0 0;padding:8px 12px;text-align:left;width:calc(100% - 28px);margin:auto }.peek:nth-child(2) { width:calc(100% - 14px) }.peek time { flex:none;font-size:12px }
.stack .day-face { min-height:230px;text-align:center;padding:24px 48px }.stack .day-name { margin:auto }
.prev,.next { position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:#dce9df;color:#214738;padding:0;font-size:24px }.prev {left:2px}.next {right:2px}.page {display:block;text-align:center;margin-top:12px}
</style>
