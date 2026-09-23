<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

const storageKey = 'personal-workbench.splash.seen.v1';
const visible = ref(false);
const closing = ref(false);
let finishTimer;
let removeTimer;

function finishSplash() {
  if (!visible.value || closing.value) return;
  closing.value = true;
  removeTimer = window.setTimeout(() => { visible.value = false; }, 260);
}

onMounted(() => {
  try {
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, '1');
  } catch {
    // 隐私模式禁用 sessionStorage 时仍可展示，不影响任务数据。
  }

  visible.value = true;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  finishTimer = window.setTimeout(finishSplash, reduceMotion ? 260 : 1980);
});

onBeforeUnmount(() => {
  window.clearTimeout(finishTimer);
  window.clearTimeout(removeTimer);
});
</script>

<template>
  <div
    v-if="visible"
    class="launch-splash"
    :class="{ 'is-closing': closing }"
    aria-hidden="true"
    @click="finishSplash"
  ></div>
</template>

<style scoped>
.launch-splash {
  position: fixed;
  z-index: 1000;
  inset: 0;
  height: 100vh;
  height: 100dvh;
  background: #f5f4ef url('/launch-splash.png') center / cover no-repeat;
  cursor: pointer;
  touch-action: manipulation;
  animation: appear 800ms ease-out both;
  transition: opacity 260ms ease, transform 260ms ease;
}

.launch-splash.is-closing {
  opacity: 0;
  transform: scale(1.01);
  pointer-events: none;
}

@keyframes appear {
  from { opacity: 0; filter: blur(5px); }
  to { opacity: 1; filter: blur(0); }
}

@media (prefers-reduced-motion: reduce) {
  .launch-splash { animation: none; transition-duration: 160ms; }
}
</style>
