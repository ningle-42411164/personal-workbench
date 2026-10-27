<script setup>
import { computed } from 'vue';
import { NODE_ONE_VERSION } from '../sync/ownerPhone.js';
import { isKnownTestRecord } from '../sync/knownTestRecords.js';
const props = defineProps({ snapshot: Object, status: Object, connection: Object, ownerPhone: Boolean });
const emit = defineEmits(['enabled', 'resolve']);
const pending = computed(() => Object.keys(props.snapshot?.dirty ?? {}).length);
const conflicts = computed(() => Object.entries(props.snapshot?.blocked ?? {}).map(([id, value]) => ({ id, ...value, local: props.snapshot.data.items.find(item => item.id === id) })));
const testRecords = computed(() => props.snapshot?.data.items.filter(item => isKnownTestRecord(item.id)) ?? []);
const heldCopies = computed(() => props.snapshot?.data.items.filter(item => props.snapshot.heldLocal?.[item.id]) ?? []);
</script>

<template>
  <section class="panel sync-settings" aria-label="自动同步设置">
    <h2>自动同步 <small>{{ NODE_ONE_VERSION }}</small></h2>
    <p>所有者连接后，八类事项在原首页保存并自动同步；随笔转换保留原文并一起同步关联，日常无需上传按钮。</p>
    <p v-if="!connection.auth.remembered && connection.auth.state !== 'connected' && !snapshot?.nodeOne">当前为本机使用，无需登录；云端仅供工作台所有者连接。</p>
    <p v-else-if="ownerPhone && !snapshot?.nodeOne">此手机更新后会自动纳入支持的分类，复用有效读写连接，无需逐项勾选。</p>
    <p v-else-if="ownerPhone">已从此手机自动纳入 {{ snapshot?.nodeOne?.enrolledIds.length || 0 }} 项，已有绑定继续复用。</p>
    <p v-else>此设备不执行首次纳入，本机未绑定记录不会自动上传；首次来源只取正式页面上的手机数据。</p>
    <p v-if="snapshot?.nodeOne || snapshot?.enabled || connection.auth.remembered" role="status">{{ status.message }}<template v-if="snapshot"> · 待同步 {{ pending }} 项 · 待核对 {{ conflicts.length }} 项</template></p>
    <button v-if="snapshot?.enabled" type="button" class="secondary" @click="emit('enabled', false)">暂停自动同步</button>
    <button v-else-if="snapshot?.nodeOne" type="button" :disabled="!connection.auth.canWrite" @click="emit('enabled', true)">恢复自动同步</button>
    <button v-else-if="snapshot && !ownerPhone && connection.auth.state === 'connected'" type="button" @click="emit('enabled', true)">启用已绑定事项同步</button>
    <p v-if="!connection.auth.canWrite && (connection.auth.remembered || snapshot?.nodeOne)">正在等待有效读写连接；已保存的连接会自动恢复。本机无需登录，连接失效时可在上方处理，事项和待同步修改不会清除。</p>
    <p v-if="status.lastSuccess">最后完成同步：{{ new Date(status.lastSuccess).toLocaleString() }}</p>
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
      <p>本机冲突副本继续保留，不自动覆盖或再次上传；核对后可在原事项中处理。</p>
    </article>
    <p v-if="heldCopies.length">有 {{ heldCopies.length }} 份本机冲突副本，已保留在首页并标注“冲突副本”，暂不自动上传。</p>
    <details v-if="testRecords.length">
      <summary>已隔离的历史测试记录（{{ testRecords.length }}）</summary>
      <p>仅按确定的测试 ID 隔离；原文与完整备份继续保留，不进入正式列表或同步队列。</p>
      <ul><li v-for="item in testRecords" :key="item.id">{{ item.title }}</li></ul>
    </details>
  </section>
</template>

<style scoped>
.sync-settings button { margin: 6px 8px 6px 0; min-height: 44px; }
.sync-settings p { overflow-wrap: anywhere; }
</style>
