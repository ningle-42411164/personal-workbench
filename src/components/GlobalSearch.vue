<script setup>
import { computed, ref, watch } from 'vue';
import { searchItems, typeLabels, itemStateLabel } from '../data/searchItems.js';
const props = defineProps({ items: Array, message: String });
defineEmits(['locate']);
const query = ref(''), completedOnly = ref(false);
const results = computed(() => searchItems(props.items, query.value, completedOnly.value));
watch(query, value => { if (!value.trim()) completedOnly.value = false; });
</script>
<template>
  <section class="global-search" aria-label="全局搜索">
    <input v-model="query" type="search" aria-label="搜索事项名称或标签" placeholder="搜索事项名称或标签" autocomplete="off">
    <template v-if="query.trim()">
      <label class="search-filter"><input v-model="completedOnly" type="checkbox">仅已完成</label>
      <p v-if="message" role="status">{{ message }}</p>
      <ul class="search-results" aria-label="搜索结果">
        <li v-for="item in results" :key="item.id"><button type="button" :data-result-id="item.id" @click="$emit('locate', item.id)"><span>{{ item.title || '未命名项目' }}</span><small>{{ typeLabels[item.type] }}<template v-if="itemStateLabel(item)"> · {{ itemStateLabel(item) }}</template></small></button></li>
      </ul>
      <p v-if="!results.length">没有匹配的事项。</p>
    </template>
  </section>
</template>
<style scoped>
.global-search { padding-top:16px; }
.global-search input[type=search] { min-height:44px; font-size:16px; border:1px solid var(--input-border); border-radius:8px; background:var(--input); margin:0; }
.search-filter { display:flex; align-items:center; gap:6px; min-height:44px; }
.search-results { list-style:none; padding:0; margin:0; }
.search-results button { display:block; width:100%; min-height:44px; padding:9px; text-align:left; background:transparent; color:var(--ink); overflow-wrap:anywhere; }
.search-results small { display:block; margin:0; }
</style>
