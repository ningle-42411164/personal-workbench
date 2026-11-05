<script setup>
import { isPinned } from '../data/itemOrder.js';
defineProps({ item: Object });
</script>
<template><svg v-if="isPinned(item)" class="pinned-mark" viewBox="0 0 16 16" role="img" aria-label="已置顶"><path d="M2 2h12M8 14V5m-4 4 4-4 4 4"/></svg></template>
<style scoped>
.pinned-mark { display:inline-block; width:14px; height:14px; margin-inline-start:6px; vertical-align:-.1em; pointer-events:none; fill:none; stroke:#526a5c; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
</style>
