<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
//这一堆就是管入场动画的
const storageKey = 'personal-workbench.splash.seen.v1';
const visible = ref(document.documentElement.classList.contains('splash-pending'));//启动页是否需要启动，相当于检查<html class="splash-pending">是否存在
const closing = ref(false);//是否开始关闭入场动画
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;//检查用户设备是否开启“减少动画”
const splashUrl = `${import.meta.env.BASE_URL}launch-splash.webp`;//图片地址
const splashLoaded = ref(false);//启动图片有没有加载完成

let finishTimer;
let removeTimer;

function finishSplash() {
  if (!visible.value || closing.value || !splashLoaded.value) return;

  closing.value = true;

  removeTimer = window.setTimeout(() => {
    visible.value = false;
    document.documentElement.classList.remove('splash-pending');
  }, reduceMotion ? 160 : 260);
}

onMounted(() => {
  document.getElementById('boot-splash')?.remove();

  if (!visible.value) return;

  try {
    sessionStorage.setItem(storageKey, '1');
  } catch {}

  if (splashLoaded.value) {
    finishTimer = window.setTimeout(finishSplash, reduceMotion ? 260 : 1980);
  }
});

onBeforeUnmount(() => {
  window.clearTimeout(finishTimer);
  window.clearTimeout(removeTimer);
  document.documentElement.classList.remove('splash-pending');
});

function handleLoad() {
  splashLoaded.value = true;

  finishTimer = window.setTimeout(
      finishSplash,
      reduceMotion ? 260 : 1980
  );
}
</script>

<template>
  <img
      :src="splashUrl"
      style="display:none"
      @load="handleLoad"
  />

  <div
      v-if="visible"
      class="launch-splash"
      :class="{ 'is-closing': closing }"
      :style="{ backgroundImage: `url(${splashUrl})` }"
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
  background-color: #f5f4ef;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
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
  .launch-splash {
    transition-duration: 160ms;
  }
}
</style>