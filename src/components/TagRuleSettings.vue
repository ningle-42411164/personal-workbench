<script setup>
import { ref } from 'vue';
import ProjectCard from './ProjectCard.vue';
const props = defineProps({ rules: Array, available: Array, saveRules: Function });
const emit = defineEmits(['close']);
const keyword = ref(''), tag = ref(''), error = ref('');
function save(rules) {
  try { props.saveRules(rules); error.value = ''; return true; }
  catch (failure) { error.value = failure.message || '规则未保存，请检查本机存储。'; return false; }
}
function add() {
  const word = keyword.value.trim();
  if (!word || !props.available.includes(tag.value)) return;
  if (props.rules.some(rule => rule.keyword === word && rule.tag === tag.value)) { error.value = '已有相同规则。'; return; }
  if (save([...props.rules, { keyword: word, tag: tag.value }])) { keyword.value = ''; tag.value = ''; }
}
</script>
<template>
  <ProjectCard title="标签自动匹配" :request-close="() => emit('close')">
    <ul class="tag-rule-list"><li v-for="(rule,index) in rules" :key="rule.keyword + ':' + rule.tag"><span>标题含「{{ rule.keyword }}」 → #{{ rule.tag }}</span><button type="button" class="text-button" :aria-label="`删除规则 ${rule.keyword} ${rule.tag}`" @click="save(rules.filter((_,i) => i !== index))">删除</button></li></ul>
    <p v-if="!rules.length" class="empty">还没有匹配规则。</p>
    <form class="project-edit" @submit.prevent="add">
      <label>标题含关键词<input v-model="keyword" required maxlength="150"></label>
      <label>预选标签<select v-model="tag" required><option disabled value="">选择已有标签</option><option v-for="option in available" :key="option" :value="option">{{ option }}</option></select></label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="form-buttons"><button :disabled="!keyword.trim() || !tag">添加规则</button></div>
    </form>
  </ProjectCard>
</template>
