<script setup>
defineProps({ name:String });
</script>
<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-if="name==='bolt'" d="m13 2-9 12h7l-1 8 10-13h-8z" />
    <g v-else-if="name==='brush'"><path d="m14 4 6 6M13 5l-8 8 6 6 8-8M5 13l-3 7 7-1M5 17l2 2"/><path d="m16 2 6 6"/></g>
    <g v-else-if="name==='archive'"><path d="M3 4h18v5H3zM5 9v12h14V9M9 13h6"/><path d="m10 17 2 2 4-4"/></g>
    <g v-else-if="name==='sort'"><path d="M8 3v18m-4-4 4 4 4-4M16 21V3m-4 4 4-4 4 4"/></g>
    <g v-else-if="name==='party'"><path d="m3 21 4-14 10 10-14 4Zm4-8 4 4M15 2l-1 5m8 3-5 1M8 2l1 2m12 13-2-1M18 4l2 2-3 3"/></g>
    <g v-else><path d="M7 3h10v6a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 14v6m-5 1h10"/></g>
  </svg>
</template>
