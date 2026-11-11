<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick, useId } from 'vue';
const props = defineProps({ content:String, expanded:Boolean });
const emit = defineEmits(['toggle']);
const probe = ref(null), fullProbe = ref(null), overflowing = ref(false);
const contentId = useId();
let observer;
function measure() {
  if (probe.value) overflowing.value = probe.value.scrollHeight > probe.value.clientHeight + 1;
}
onMounted(() => {
  observer = new ResizeObserver(measure); observer.observe(probe.value); observer.observe(fullProbe.value);
  document.fonts?.addEventListener('loadingdone', measure);
  document.fonts?.ready.then(measure);
  measure();
});
watch(() => props.content, async () => { await nextTick(); measure(); });
onBeforeUnmount(() => { observer?.disconnect(); document.fonts?.removeEventListener('loadingdone', measure); });
</script>
<template>
  <div class="history-body">
    <!-- 独立的三行测量层避免展开后丢失溢出判断，也能响应字体和宽度变化。 -->
    <div class="history-probes" aria-hidden="true">
      <p ref="probe" class="history-probe history-clamped">{{ content }}</p>
      <p ref="fullProbe" class="history-probe">{{ content }}</p>
    </div>
    <p :id="contentId" class="history-content" :class="{'history-clamped':!expanded}" :role="overflowing ? 'button' : undefined" :tabindex="overflowing ? 0 : undefined" :aria-expanded="overflowing ? expanded : undefined" @click="overflowing && emit('toggle')" @keydown.enter.prevent="overflowing && emit('toggle')" @keydown.space.prevent="overflowing && emit('toggle')">{{ content }}</p>
    <button v-if="overflowing" type="button" class="text-button history-text-toggle" :aria-expanded="expanded" :aria-controls="contentId" @click="emit('toggle')">{{ expanded ? '收起全文' : '展开全文' }}</button>
  </div>
</template>
<style scoped>
.history-body { position:relative; min-width:0; }
.history-clamped { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden; }
.history-probes { position:absolute; top:0; left:0; width:100%; height:0; overflow:hidden; visibility:hidden; pointer-events:none; }
.history-content[role=button] { cursor:pointer; }
.history-text-toggle { min-height:44px; padding:4px 0; }
</style>
