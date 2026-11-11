<script setup>
import { ref } from 'vue';
const props = defineProps({ item:Object, disabled:Boolean, saveFavorite:{type:Function,required:true} });
const busy = ref(false), error = ref('');
async function toggle() {
  if (busy.value || props.disabled) return;
  busy.value = true; error.value = '';
  try {
    if (!await props.saveFavorite(props.item)) error.value = '收藏保存失败，原状态保留，请重试。';
  } catch { error.value = '收藏保存失败，原状态保留，请重试。'; }
  finally { busy.value = false; }
}
</script>
<template>
  <div class="favorite-slot" @click.stop @pointerdown.stop>
    <button type="button" class="favorite-star" :class="{selected:item.favorite === true}" :disabled="disabled || busy" :aria-pressed="item.favorite === true" :aria-label="`${item.favorite ? '取消收藏' : '收藏'} ${item.title}`" @click.stop="toggle">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.5 2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96Z"/></svg>
    </button>
    <span v-if="error" class="favorite-error error" role="alert">{{ error }}</span>
  </div>
</template>
<style scoped>
.favorite-slot { position:relative; justify-self:end; width:44px; }
.favorite-star { display:grid; place-items:center; width:44px; height:44px; padding:0; border:0; border-radius:8px; background:transparent; color:#AAB7AF; }
.favorite-star svg { width:22px; height:22px; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linejoin:round; }
.favorite-star.selected { color:#E4BD62; }
.favorite-star.selected svg { fill:currentColor; }
.favorite-error { position:absolute; right:0; top:100%; z-index:2; width:180px; padding:8px; background:var(--panel); border:1px solid var(--line); border-radius:8px; }
</style>
