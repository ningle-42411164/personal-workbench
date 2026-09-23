<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

const storageKey = 'personal-workbench.splash.seen.v1';
const visible = ref(document.documentElement.classList.contains('splash-pending'));
const closing = ref(false);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let finishTimer;
let removeTimer;

function finishSplash() {
  if (!visible.value || closing.value) return;
  closing.value = true;
  removeTimer = window.setTimeout(() => {
    visible.value = false;
    document.documentElement.classList.remove('splash-pending');
  }, reduceMotion ? 160 : 260);
}

onMounted(() => {
  // Vue 遮罩首次渲染完成后，接替 HTML 中防止闪屏的静态遮罩。
  document.getElementById('boot-splash')?.remove();
  if (!visible.value) return;

  try {
    sessionStorage.setItem(storageKey, '1');
  } catch {
    // 隐私模式禁用 sessionStorage 时仍可展示，不影响任务数据。
  }

  finishTimer = window.setTimeout(finishSplash, reduceMotion ? 260 : 1980);
});

onBeforeUnmount(() => {
  window.clearTimeout(finishTimer);
  window.clearTimeout(removeTimer);
  document.documentElement.classList.remove('splash-pending');
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
  transition: opacity 260ms ease, transform 260ms ease;
}

.launch-splash.is-closing {
  opacity: 0;
  transform: scale(1.01);
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .launch-splash { transition-duration: 160ms; }
}
</style>
