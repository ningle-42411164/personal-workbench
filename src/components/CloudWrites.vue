<script setup>
import { computed } from 'vue';
const props = defineProps({ state: { type: Object, required: true }, connection: { type: Object, required: true }, writer: { type: Object, required: true } });
const locked = computed(() => !props.connection.auth.canWrite || ['saving', 'unknown', 'loading', 'rereading'].includes(props.state.phase));
const cannotSave = computed(() => locked.value || props.state.phase === 'conflict');
function change(key, event) { props.writer.editProject({ [key]: event.target.value }); }
</script>

<template>
  <section class="panel cloud-writes" aria-label="云端测试写入">
    <h2>云端测试写入</h2>
    <p class="cloud-note">仅使用虚构测试数据。以下保存写入云端测试库，与本机数据分开；没有自动补传。</p>
    <p v-if="!connection.auth.canWrite" class="cloud-message">当前没有测试写权限。可继续读取，或在页面底部“云端连接”中明确授权写入；输入会保留。</p>
    <p v-if="state.storageWarning" class="cloud-message" role="status">{{ state.storageWarning }}</p>
    <form @submit.prevent="writer.saveTodo()">
      <fieldset :disabled="locked">
        <legend>新建云端待办</legend>
        <label>待办名称<input :value="state.todo.title" maxlength="150" required aria-label="云端待办名称" @input="writer.editTodo({ title: $event.target.value })"></label>
        <label class="cloud-check"><input type="checkbox" :checked="state.todo.urgent" @change="writer.editTodo({ urgent: $event.target.checked })">急需处理</label>
        <button type="submit" :disabled="cannotSave">确认新建到云端测试</button>
      </fieldset>
    </form>
    <form v-if="state.project" class="project-edit" @submit.prevent="writer.saveProject()">
      <h3>编辑云端项目 · 基准 v{{ state.project.base.version }}</h3>
      <fieldset :disabled="locked">
        <legend>仅保存实际改动的字段</legend>
        <label>项目名称<input :value="state.project.fields.title" maxlength="150" aria-label="云端项目名称" @input="change('title', $event)"></label>
        <label>当前情况<textarea :value="state.project.fields.currentSituation" maxlength="10000" aria-label="云端当前情况" @input="change('currentSituation', $event)"></textarea></label>
        <label>下一步<textarea :value="state.project.fields.nextStep" maxlength="10000" aria-label="云端下一步" @input="change('nextStep', $event)"></textarea></label>
        <label>项目状态<select :value="state.project.fields.status" aria-label="云端项目状态" @change="change('status', $event)"><option value="">未设置</option><option value="active">进行中</option><option value="paused">暂停中</option><option value="done">已完成</option></select></label>
        <label>用户标签（用逗号分隔）<input :value="state.project.fields.tags.join(', ')" aria-label="云端项目标签" @change="writer.editProject({ tags: writer.parseTags($event.target.value) })"></label>
        <div class="project-date-fields"><label>开始日期<input type="date" :value="state.project.fields.startDate" aria-label="云端开始日期" @input="change('startDate', $event)"></label><label>截止日期<input type="date" :value="state.project.fields.dueDate" aria-label="云端截止日期" @input="change('dueDate', $event)"></label></div>
        <div class="form-buttons"><button type="button" class="secondary" @click="writer.closeProject()">关闭草稿</button><button type="submit" :disabled="cannotSave">确认保存云端项目</button></div>
      </fieldset>
    </form>
    <p v-if="state.message" class="cloud-message" role="status">{{ state.message }}</p>
    <div v-if="state.phase === 'unknown'" class="cloud-actions"><button type="button" :disabled="!connection.auth.canWrite" @click="writer.retry()">用原请求重试（内容保持不变）</button></div>
    <div v-if="state.phase === 'conflict'" class="cloud-conflict">
      <button type="button" class="secondary" :disabled="!connection.auth.canWrite" @click="writer.loadLatest()">读取冲突项目最新版本</button>
      <div v-if="state.latest">
        <h3>服务端最新 · v{{ state.latest.version }}</h3>
        <dl><dt>项目名称</dt><dd>{{ state.latest.item.title }}</dd><dt>当前情况</dt><dd>{{ state.latest.item.currentSituation || '未填写' }}</dd><dt>下一步</dt><dd>{{ state.latest.item.nextStep || '未填写' }}</dd><dt>状态／标签</dt><dd>{{ state.latest.item.status || '未设置' }} ／ {{ state.latest.item.tags.join(', ') }}</dd><dt>开始／截止</dt><dd>{{ state.latest.item.startDate || '未设置' }} ／ {{ state.latest.item.dueDate || '未设置' }}</dd></dl>
        <button type="button" :disabled="!connection.auth.canWrite" @click="writer.rebase()">已核对：采用最新基准，保留我的改动</button>
      </div>
    </div>
    <p v-if="state.confirmed" class="cloud-note">最近一次服务端确认：{{ state.confirmed.item.title }} · v{{ state.confirmed.version }}。保存后列表以重新读取结果为准。</p>
  </section>
</template>
