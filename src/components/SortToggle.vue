<script setup>
defineProps({active:Boolean});
</script>
<template><button type="button" class="sort-toggle" aria-label="调整分类顺序" :aria-pressed="active"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 6h13M9 12h13M9 18h13M2 4l2-1v6M2 9h4M2 14q4-3 4 0 0 1-4 5h4"/></svg></button></template>
<style scoped>.sort-toggle{margin-left:auto;width:44px;height:44px;padding:0;display:grid;place-items:center;background:transparent;color:#345246}.sort-toggle[aria-pressed=true]{background:#dceadd}</style>
