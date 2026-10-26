import { projectEditableFields, updateProject } from './workbenchData.js';
import { normalizeUserTags } from './userTags.js';

// 仅协调当前项目字段草稿；持久化仍交给 App.saveProject，不新增存储格式或云端请求。
export function createProjectEditor({ state, getProject, saveProject, canEdit, confirmComplete = () => true }) {
  let editingBase;
  function cancel() { if (!state.busy) { state.field = null; state.draft = ''; state.error = ''; } }
  async function persist(fields) {
    try {
      const project = getProject();
      const next = updateProject(project, fields);
      if (next === project) return true; // 无实际变化不写入，也不追加历史。
      if (!canEdit()) { state.error = '当前无法保存，输入已保留，尚未关闭或切换。'; return false; }
      if (next.status === 'done' && project.status !== 'done' && !confirmComplete(project)) return false;
      if (!await saveProject(next)) { state.error = '保存失败，输入已保留；请重试保存后再关闭或切换。'; return false; }
      return true;
    } catch (error) { state.error = error.message || '保存失败，输入已保留。'; return false; }
  }
  async function commit() {
    if (state.busy) return false;
    if (!state.field) return true;
    state.busy = true;
    try {
      if (JSON.stringify(projectEditableFields(getProject())[state.field]) !== editingBase) {
        state.error = '此字段在编辑期间已由其他窗口或云端修改，输入保留。请核对新值后再编辑，不会自动覆盖。'; return false;
      }
      if (!await persist({ [state.field]: state.draft })) return false;
      state.field = null; state.draft = ''; state.error = '';
      return true;
    } finally { state.busy = false; }
  }
  async function begin(field) {
    if (state.busy || !canEdit()) return false;
    if (state.field === field) return true; // 同字段重入只聚焦，不能用正式旧值重置输入。
    if (!await commit()) return false;
    const value = projectEditableFields(getProject())[field];
    editingBase = JSON.stringify(value);
    state.field = field;
    state.draft = field === 'tags' ? normalizeUserTags(value) : value ?? '';
    state.error = '';
    return true;
  }
  async function complete() {
    if (!await commit()) return false;
    state.busy = true;
    try { return await persist({ status: 'done' }); }
    finally { state.busy = false; }
  }
  return { begin, commit, cancel, complete };
}
