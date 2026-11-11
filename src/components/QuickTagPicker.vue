<script setup>
import { computed, ref } from 'vue';
import { normalizeUserTags } from '../data/userTags.js';
const props = defineProps({ available: Array, selected: Array });
const emit = defineEmits(['select']);
const query = ref('');
const fullTag = computed(() => normalizeUserTags([query.value])[0] ?? '');
const results = computed(() => fullTag.value ? props.available.filter(tag => tag.toLocaleLowerCase().includes(fullTag.value.toLocaleLowerCase())) : []);
function select(tag) { emit('select', tag); query.value = ''; }
</script>
<template>
  <div class="quick-tag-picker">
    <input v-model="query" type="search" aria-label="输入或查找标签" placeholder="输入或查找标签" maxlength="60" autocomplete="off" @keydown.enter.prevent>
    <div v-if="results.length || fullTag" class="tag-results">
      <button v-for="tag in results" :key="tag" type="button" class="secondary" :disabled="selected.includes(tag)" @click="select(tag)">#{{ tag }}</button>
      <button v-if="fullTag && !available.includes(fullTag) && !selected.includes(fullTag)" type="button" class="secondary" @click="select(fullTag)">将「{{ fullTag }}」加入本次草稿</button>
    </div>
  </div>
</template>
