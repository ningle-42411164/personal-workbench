<script setup>
import {ref} from 'vue';
import QuickHelp from './QuickHelp.vue';
import {setReminderDate} from '../data/reminders.js';
const props=defineProps({item:Object,canEdit:Boolean,saveItem:Function});
const emit=defineEmits(['editing']);
const editing=ref(false),draft=ref(''),saving=ref(false),error=ref('');
let base;
function begin(){base=JSON.parse(JSON.stringify(props.item));draft.value=base.reminder?.date??'';error.value='';editing.value=true;emit('editing',props.item.id,base);}
function cancel(){if(saving.value)return;editing.value=false;error.value='';emit('editing',props.item.id,null);}
async function save(clear=false){
  if(saving.value)return false;
  if(!editing.value)begin();
  saving.value=true;
  try {
    const next=setReminderDate(base,clear?'':draft.value);
    if(next===base || await props.saveItem(next,base)) {saving.value=false;cancel();return true;}
    error.value='保存未完成，日期草稿保留，请核对最新记录。';
  } catch(e){error.value=e.message;} finally{saving.value=false;}
  return false;
}
async function finishEditing(){return !editing.value || await save();}
defineExpose({finishEditing});
</script>
<template>
  <section class="reminder-editor">
    <div class="reminder-field-head"><span>提醒</span><QuickHelp label="提醒说明">填写任务当天日期，提前一天转入待办并提醒。</QuickHelp><button v-if="item.reminder?.date" type="button" class="text-button cancel-reminder" :disabled="!canEdit || saving" @click.stop="save(true)">取消提醒</button></div>
    <template v-if="editing">
      <input v-model="draft" type="date" aria-label="提醒日期" :disabled="!canEdit || saving">
      <div class="reminder-buttons"><button type="button" class="secondary" :disabled="saving" @click.stop="cancel">取消编辑</button><button type="button" :disabled="!canEdit || saving" @click.stop="save()">保存</button></div>
    </template>
    <button v-else type="button" class="reminder-date-display secondary" :disabled="!canEdit" @click.stop="begin">{{item.reminder?.date || '未设置'}} · 编辑提醒</button>
    <p v-if="error" class="error" role="alert">{{error}}</p>
  </section>
</template>
