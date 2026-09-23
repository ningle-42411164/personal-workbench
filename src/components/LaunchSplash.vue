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
    // 隐私模式禁用 sessionStorage 时仍可正常展示，且不影响任务数据。
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
    role="presentation"
    @click="finishSplash"
    @keydown.esc="finishSplash"
  >
    <div class="launch-splash__glow" aria-hidden="true"></div>
    <div class="launch-splash__content">
      <div class="launch-splash__mark" aria-hidden="true">
        <img src="/logo.svg" alt="">
        <span></span>
      </div>
      <p>我的工作台</p>
    </div>
    <small>轻触跳过</small>
  </div>
</template>

<style scoped>
.launch-splash {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  min-width: 280px;
  min-height: 100dvh;
  overflow: hidden;
  color: #244d43;
  background: #f5f4ef;
  cursor: pointer;
  touch-action: manipulation;
  transition: opacity 260ms ease, transform 260ms ease;
}

.launch-splash.is-closing {
  opacity: 0;
  transform: scale(1.015);
  pointer-events: none;
}

.launch-splash__glow {
  position: absolute;
  inset: -25%;
  background:
    radial-gradient(circle at 34% 42%, rgb(143 164 155 / 22%), transparent 31%),
    radial-gradient(circle at 68% 61%, rgb(197 203 200 / 32%), transparent 28%);
  filter: blur(22px);
  animation: drift 1.9s ease-in-out both;
}

.launch-splash__content {
  position: relative;
  width: min(78vw, 390px);
  text-align: center;
}

.launch-splash__mark {
  position: relative;
  width: min(72vw, 340px);
  aspect-ratio: 1;
  margin-inline: auto;
  overflow: hidden;
  animation: reveal-mark 1.15s 120ms cubic-bezier(.2, .7, .2, 1) both;
}

.launch-splash__mark img {
  display: block;
  width: 100%;
  height: 100%;
}

.launch-splash__mark span {
  position: absolute;
  top: 5%;
  bottom: 5%;
  left: -35%;
  width: 28%;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 70%), transparent);
  transform: skewX(-16deg);
  mix-blend-mode: screen;
  animation: sweep 850ms 520ms ease-in-out both;
}

.launch-splash p {
  margin: -18px 0 0;
  font-size: clamp(20px, 5vw, 27px);
  font-weight: 650;
  letter-spacing: .42em;
  text-indent: .42em;
  opacity: 0;
  animation: title-in 620ms 980ms ease-out forwards;
}

.launch-splash > small {
  position: absolute;
  bottom: max(24px, env(safe-area-inset-bottom));
  color: #6e7f78;
  font-size: 12px;
  letter-spacing: .08em;
  opacity: 0;
  animation: hint-in 420ms 1.25s ease-out forwards;
}

@keyframes drift {
  0% { opacity: 0; transform: translate3d(-2%, 1%, 0) scale(.96); }
  55% { opacity: 1; }
  100% { opacity: .72; transform: translate3d(2%, -1%, 0) scale(1.04); }
}

@keyframes reveal-mark {
  0% { clip-path: inset(0 100% 0 0); filter: blur(10px); opacity: 0; transform: scale(.97); }
  35% { opacity: .68; }
  100% { clip-path: inset(0); filter: blur(0); opacity: 1; transform: scale(1); }
}

@keyframes sweep {
  from { left: -35%; opacity: 0; }
  30% { opacity: .75; }
  to { left: 110%; opacity: 0; }
}

@keyframes title-in {
  from { opacity: 0; letter-spacing: .42em; transform: translateY(8px); }
  to { opacity: 1; letter-spacing: .2em; transform: translateY(0); }
}

@keyframes hint-in {
  to { opacity: .72; }
}

@media (max-height: 560px) {
  .launch-splash__content { width: min(62vh, 320px); }
  .launch-splash__mark { width: min(58vh, 285px); }
  .launch-splash p { margin-top: -26px; }
}

@media (prefers-reduced-motion: reduce) {
  .launch-splash,
  .launch-splash__glow,
  .launch-splash__mark,
  .launch-splash__mark span,
  .launch-splash p,
  .launch-splash > small {
    animation: none;
    transition-duration: 160ms;
  }

  .launch-splash__mark,
  .launch-splash p {
    opacity: 1;
  }

  .launch-splash p { letter-spacing: .2em; }
  .launch-splash > small { display: none; }
}
</style>
