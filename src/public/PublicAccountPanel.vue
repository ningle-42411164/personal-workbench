<script setup>
import {ref} from 'vue';
import ProjectCard from '../components/ProjectCard.vue';
import SyncSettings from '../components/SyncSettings.vue';
const props=defineProps({open:Boolean,state:Object,snapshot:Object,status:Object,controller:Object,requestClose:Function});
const host=ref(null);
async function attempt(action){try{await action();}catch{/* 错误由控制器保留在卡片，草稿和原数据不清除。 */}}
function close(){props.controller.cancelLogin();props.requestClose();}
</script>
<template>
  <ProjectCard title="账号与云服务" :open="open" :request-close="close">
    <section class="public-account-panel">
      <p v-if="!state.configured" role="status">{{ state.configMessage }}</p>
      <p v-if="state.activeAccount">当前本机空间：{{ state.activeAccount.email }}<br><small>退出后保留此账号的本机缓存和待上传修改，其他账号不能接续它的队列。</small></p>
      <p v-else>当前为本机空间，无需账号即可记录、编辑、完成和导出备份。</p>
      <p v-if="state.error" role="alert">{{ state.error }}</p>
      <div class="public-actions">
        <button type="button" :disabled="!state.configured||state.busy" @click="attempt(()=>controller.requestSync({host}))">{{ state.activeAccount?'连接此账号／切换账号':'开启云同步' }}</button>
        <button type="button" class="secondary" :disabled="!state.configured||state.busy" @click="attempt(()=>controller.connectAi({host}))">连接 AI</button>
        <button v-if="state.activeAccount||state.signedInAccount" type="button" class="secondary" :disabled="state.busy" @click="attempt(()=>controller.logout())">退出账号</button>
      </div>
      <div ref="host" class="public-email-login" aria-label="邮箱验证" />
      <button v-if="state.busy" type="button" class="secondary" @click="controller.cancelLogin()">取消登录</button>
      <section v-if="state.pending" class="import-confirm" aria-label="确认关联本机事项">
        <h3>关联本机事项</h3>
        <p>目标账号：{{ state.pending.email }}</p>
        <p>待关联 {{ state.pending.count }} 条。本机内容会进入此账号的同步空间；云端存在不同版本时保留双方并请你核对。</p>
        <div class="public-actions"><button type="button" class="secondary" @click="controller.cancelAssociation()">取消</button><button type="button" @click="attempt(()=>controller.confirmAssociation())">确认关联并开启同步</button></div>
      </section>
      <SyncSettings v-if="state.activeAccount" public-mode :snapshot="snapshot" :status="status" :connection="state" :owner-phone="false" @enabled="value=>attempt(()=>controller.enabled(value))" @resolve="value=>attempt(()=>controller.resolve(value))" />
      <section aria-label="连接外部 AI" class="public-ai">
        <h3>连接外部 AI</h3>
        <p>支持标准远程 MCP（Streamable HTTP）的 AI 客户端共用此地址。可先在客户端发起连接，再用同一邮箱账号登录。</p>
        <label v-if="state.mcpUrl">MCP 地址<input readonly :value="state.mcpUrl" aria-label="公开版 MCP 地址"></label>
        <p v-else>公开版 MCP 地址尚未配置。</p>
        <p>只读：读取当前账号事项。读写：在你确认后创建或更新事项。连接 AI 不会自动关联或上传设备上的本机事项。</p>
        <p v-if="state.signedInAccount">授权管理账号：{{ state.signedInAccount.email }}</p>
        <ul v-if="state.grants.length" class="public-grants"><li v-for="grant in state.grants" :key="grant.id"><span>{{ grant.clientName || grant.clientId || '已授权客户端' }}<small>{{ Array.isArray(grant.scope)?grant.scope.join('、'):grant.scope }}</small></span><button type="button" class="secondary" @click="attempt(()=>controller.revokeGrant(grant.id))">撤销授权</button></li></ul>
        <p v-else-if="state.signedInAccount">此账号当前没有已列出的外部 AI 授权。</p>
      </section>
    </section>
  </ProjectCard>
</template>
<style scoped>
.public-account-panel,.public-ai {min-width:0;overflow-wrap:anywhere;}
.public-actions {display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;}
.public-account-panel button {min-height:44px;white-space:normal;}
.public-email-login {max-width:100%;overflow-x:auto;}
.public-ai {margin-top:18px;border-top:1px solid var(--line);padding-top:12px;}
.public-ai input {box-sizing:border-box;width:100%;min-width:0;font-size:16px;}
.public-grants {padding:0;list-style:none;}
.public-grants li {display:flex;gap:8px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding:8px 0;}
.public-grants small {display:block;}
</style>
