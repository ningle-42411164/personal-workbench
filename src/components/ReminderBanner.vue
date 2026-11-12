<script setup>
import {reminderText} from '../data/reminders.js';
import ReminderIcon from './ReminderIcon.vue';
defineProps({item:Object,today:Date});
defineEmits(['acknowledge']);
</script>
<template><aside v-if="item" class="reminder-banner" aria-label="日期提醒" role="status"><ReminderIcon/><div><strong>{{item.title}}</strong><div>{{item.reminder.date}} · {{reminderText(item,today)}}</div></div><button type="button" class="secondary" @click="$emit('acknowledge')">知道了</button></aside></template>
