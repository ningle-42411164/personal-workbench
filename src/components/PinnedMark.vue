<script setup>
import { isPinned } from '../data/itemOrder.js';
defineProps({ item: Object });
</script>
<template><span class="item-pin-slot"><svg v-if="isPinned(item)" class="pinned-mark" viewBox="0 0 16 16" role="img" aria-label="已置顶"><path d="M2 2h12M8 14V5m-4 4 4-4 4 4"/></svg></span></template>
<style scoped>
.item-pin-slot { display:grid; place-items:center; width:44px; min-height:44px; pointer-events:none; }
.pinned-mark { display:block; width:14px; height:14px; pointer-events:none; fill:none; stroke:var(--muted-3); stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
</style>
