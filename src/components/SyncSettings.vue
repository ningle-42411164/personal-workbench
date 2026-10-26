<script setup>
import { computed, ref } from 'vue';
import { syncSupported } from '../sync/syncStore.js';
const props = defineProps({ snapshot: Object, status: Object, connection: Object });
const emit = defineEmits(['enabled', 'enroll', 'resolve']);
const preview = ref(null), selected = ref([]);
const localOnly = computed(() => props.snapshot?.data.items.filter(item => syncSupported(item) && !props.snapshot.bindings[item.id]) ?? []);
const pending = computed(() => Object.keys(props.snapshot?.dirty ?? {}).length);
const conflicts = computed(() => Object.entries(props.snapshot?.blocked ?? {}).map(([id, value]) => ({ id, ...value, local: props.snapshot.data.items.find(item => item.id === id) })));
function showPreview() {
  preview.value = { revision: props.snapshot.revision, items: localOnly.value.map(item => ({ id: item.id, title: item.title, type: item.type })) };
  selected.value = [];
}
function confirmPreview() {
  emit('enroll', { ids: [...selected.value], revision: preview.value.revision });
  preview.value = null; selected.value = [];
}
</script>

<template>
  <section class="panel sync-settings" aria-label="自动同步设置">
    <h2>自动同步 <small>首批：待办与项目</small></h2>
    <p>在原首页正常编辑，先保存到本机；页面打开且联网时自动补传，并获取 GPT 的修改。其他分类暂留本机。服务仍使用测试环境，请先用虚构事项验收。</p>
    <p>开启后，新建待办和项目自动纳入；已有本机事项仍需下方预览确认。首次连接或增加写权限使用上方连接入口，日常无需上传按钮。</p>
    <p role="status">{{ status.message }}<template v-if="snapshot"> · 待同步 {{ pending }} 项 · 待核对 {{ conflicts.length }} 项</template></p>
    <button v-if="snapshot && !snapshot.enabled" type="button" :disabled="!connection.auth.canWrite" @click="emit('enabled', true)">开启新建事项自动同步</button>
    <button v-else-if="snapshot" type="button" class="secondary" @click="emit('enabled', false)">暂停自动同步</button>
    <p v-if="!connection.auth.canWrite">请先登录并授权写入。本机编辑无需登录；退出连接或暂停后，已保存的事项和待同步修改仍保留在本机。</p>
    <p v-if="status.lastSuccess">最后完成同步：{{ new Date(status.lastSuccess).toLocaleString() }}</p>
    <button v-if="snapshot?.enabled && localOnly.length" type="button" class="secondary" @click="showPreview">预览已有本机事项（{{ localOnly.length }}）</button>
    <div v-if="preview" class="import-confirm">
      <p>只将勾选的事项首次纳入当前云端服务；不会自动选中。正式事项请先核对，测试时只选虚构记录。</p>
      <label v-for="item in preview.items" :key="item.id" class="sync-choice"><input v-model="selected" type="checkbox" :value="item.id">{{ item.title || '未命名项目' }} · {{ item.type === 'todo' ? '待办' : '项目' }}</label>
      <div class="form-buttons"><button type="button" class="secondary" @click="preview = null">取消</button><button type="button" :disabled="!selected.length || preview.revision !== snapshot.revision" @click="confirmPreview">确认将 {{ selected.length }} 项纳入云端</button></div>
      <p v-if="preview.revision !== snapshot.revision">事项已变化，请关闭并重新预览。</p>
    </div>
    <article v-for="conflict in conflicts" :key="conflict.id" class="import-confirm">
      <h3>{{ conflict.local?.title || conflict.remote?.item?.title || '已在本机删除的事项' }}</h3>
      <p>{{ conflict.message }}</p>
      <p>本机：{{ conflict.local ? conflict.local.title || '未命名项目' : '已删除' }}</p>
      <p v-if="conflict.local?.type === 'project'">当前情况：{{ conflict.local.currentSituation }}；下一步：{{ conflict.local.nextStep }}</p>
      <template v-if="conflict.remote">
        <p>云端：{{ conflict.remote.deleted ? '已删除' : conflict.remote.item.title || '未命名项目' }}</p>
        <p v-if="conflict.remote.item?.type === 'project'">当前情况：{{ conflict.remote.item.currentSituation }}；下一步：{{ conflict.remote.item.nextStep }}</p>
        <button type="button" class="secondary" @click="emit('resolve', conflict.id)">保留本机副本并采用云端</button>
      </template>
      <p>本机副本不会自动上传，核对后可另行纳入；不会用旧版本覆盖云端。</p>
    </article>
  </section>
</template>

<style scoped>
.sync-settings button { margin: 6px 8px 6px 0; min-height: 44px; }
.sync-choice { display: flex; align-items: center; gap: 8px; margin: 10px 0; overflow-wrap: anywhere; }
.sync-settings p { overflow-wrap: anywhere; }
</style>
