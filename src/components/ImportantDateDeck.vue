<script setup>
import { computed, ref } from 'vue';
import PinnedMark from './PinnedMark.vue';
import { daysUntil } from '../data/workbenchData.js';
const props = defineProps({ items: Array, today: Date, canEdit: Boolean, highlighted: String });
defineEmits(['delete']);
const selected = ref(null), detail = ref(null);
const index = computed(() => Math.max(0, props.items.findIndex(item => item.id === selected.value)));
const stacked = computed(() => props.items.length >= 3);
const visible = computed(() => stacked.value ? [props.items[index.value]] : props.items);
const relative = delta => props.items[(index.value + delta + props.items.length) % props.items.length];
function select(item) { selected.value = item.id; detail.value = null; }
// 搜索只切换浏览卡片，不保存、排序或修改数据。
defineExpose({ locate(id) { const item = props.items.find(value => value.id === id); if (item) selected.value = id; } });
const remaining = item => daysUntil(item.targetDate, props.today);
</script>

<template>
  <p v-if="!items.length" class="empty">还没有重要日，选一个值得记住的日期吧。</p>
  <div v-else :class="['day-deck', { pair: items.length === 2, stack: stacked }]">
    <template v-if="stacked">
      <div v-for="delta in [1,2]" :key="relative(delta).id" class="peek">
        <button type="button" class="peek-select" @click="select(relative(delta))"><span>{{ relative(delta).title }}</span><time>{{ relative(delta).targetDate }}</time></button>
        <PinnedMark :item="relative(delta)" />
      </div>
    </template>
    <article v-for="item in visible" :key="item.id" :id="'item-' + item.id" :class="{located:highlighted === item.id}" class="day-face">
      <button type="button" class="day-name" :aria-expanded="detail === item.id" @click="detail = detail === item.id ? null : item.id">{{ item.title }}</button>
      <PinnedMark :item="item" />
      <time :datetime="item.targetDate">{{ item.targetDate }}</time>
      <small>{{ remaining(item) > 0 ? '还有' : remaining(item) < 0 ? '已过' : '今天' }}</small>
      <div class="days"><b>{{ Math.abs(remaining(item)) }}</b><span>天</span></div>
      <span v-if="item.priority" class="urgent-mark">优先处理</span><span v-for="tag in item.tags" :key="tag" class="project-user-tag">#{{ tag.replace(/^#+/, '') }}</span>
      <button v-if="detail === item.id" type="button" class="text-button danger" :disabled="!canEdit" @click="$emit('delete',item.id)">删除</button>
      <template v-if="stacked"><button class="prev" aria-label="上一个重要日" @click="select(relative(-1))"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><button class="next" aria-label="下一个重要日" @click="select(relative(1))"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button></template>
    </article>
    <small v-if="stacked" class="page">{{ index + 1 }} / {{ items.length }}</small>
  </div>
</template>
<style scoped>
.day-deck {
  --date-ink:#243d36; --date-muted:#65766e; --date-accent:#244d43; --date-border:transparent;
  --date-fill:linear-gradient(135deg,#e7efe9,#f5f4ef);
}
.day-face,.peek { box-sizing:border-box; min-width:0; border:1px solid var(--date-border); color:var(--date-ink); overflow-wrap:anywhere; }
.day-face { position:relative; min-height:164px; padding:16px; border-radius:14px; text-align:left; background:var(--date-fill); }
.day-name { display:block; max-width:100%; padding:0; color:inherit; background:transparent; font-size:1.0625rem; line-height:1.35; text-align:inherit; overflow-wrap:anywhere; }
.day-face time,.day-face small { display:block; margin:0; color:var(--date-muted); font-size:.75rem; }
.day-face time { margin-top:5px; }
.day-face small { margin-top:16px; }
.days { display:flex; align-items:baseline; gap:5px; color:var(--date-accent); font-size:.875rem; }
.days b { font-size:2.125rem; line-height:1.2; }
.day-face .project-user-tag { max-width:100%; white-space:normal; overflow-wrap:anywhere; }
.pair { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.pair .day-face { display:flex; flex-direction:column; align-items:flex-start; min-height:158px; padding:12px; }
/* 方形参照只规定行的最小尺寸，长内容仍可把同一行的两张卡一起撑高。 */
.pair::before { content:""; grid-area:1 / 1; aspect-ratio:1; width:100%; pointer-events:none; }
.pair .day-face:first-child { grid-area:1 / 1; }
.pair .day-name { font-size:.875rem; }
.pair .day-face small { margin-top:auto; padding-top:12px; }
.pair .days b { font-size:1.875rem; }
@media(max-width:360px) { .pair { gap:8px; } .pair .day-face { padding:10px; } }
/* 标题条参与正常排版；名称增高时，完整前卡随之下移。 */
.peek { display:flex; align-items:center; gap:8px; width:calc(100% - 28px); min-height:48px; margin:0 auto; padding:0; border-radius:13px 13px 0 0; border-bottom:0; text-align:left; background:var(--date-fill); font-size:.8125rem; }
.peek:nth-child(2) { width:calc(100% - 14px); }
.peek-select { display:flex; align-items:center; justify-content:space-between; gap:8px; flex:1; min-width:0; align-self:stretch; padding:9px 0 9px 12px; color:inherit; font:inherit; text-align:left; background:transparent; overflow-wrap:anywhere; }
.peek-select span { min-width:0; }
.day-face > .item-pin-slot { position:absolute; top:0; right:0; }
.day-deck:not(.stack) .day-name { max-width:calc(100% - 36px); }
.peek time { flex:none; color:var(--date-muted); font-size:.6875rem; }
.stack .day-face { min-height:230px; padding:22px 49px 20px; text-align:center; }
.stack .day-name { margin:0 auto; font-size:1.125rem; }
.stack .day-face small { margin-top:24px; }
.stack .days { justify-content:center; }
.stack .days b { font-size:2.625rem; }
.prev,.next { position:absolute; top:50%; transform:translateY(-50%); display:grid; place-items:center; width:44px; height:44px; min-height:0; padding:0; border-radius:50%; background:white; color:var(--date-accent); box-shadow:0 2px 9px #243d3610; }
.prev { left:8px; } .next { right:8px; }
.prev svg,.next svg { display:block; width:19px; height:19px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
.page { display:block; margin:14px 0 0; color:var(--date-muted); font-size:.75rem; text-align:center; }
</style>
