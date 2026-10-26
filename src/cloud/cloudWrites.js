import { normalizeUserTags } from '../data/userTags.js';
import { isCalendarDate } from '../data/workbenchData.js';

const clone = value => JSON.parse(JSON.stringify(value));
const fieldsOf = record => ({ title: record.item.title, tags: [...record.item.tags], status: record.item.status ?? '', startDate: record.item.startDate ?? '', dueDate: record.item.dueDate ?? '', currentSituation: record.item.currentSituation ?? '', nextStep: record.item.nextStep ?? '' });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 这只是一个人工保存表单，不是本机事项的 outbox，也不会联网自动补传。
// sessionStorage 只保存本窗口草稿/原请求，绝不包含令牌；刷新后不丢失结果不明的 requestId。
export function createCloudWrites({ api, cloud, storage, randomId = () => crypto.randomUUID(), isOnline = () => globalThis.navigator?.onLine !== false } = {}) {
  const key = 'personal-workbench.cloud-drafts.v1';
  let state = { todo: { title: '', urgent: false }, project: null, pending: null, phase: 'idle', message: '', confirmed: null, latest: null, storageWarning: storage ? '' : '草稿仅在内存中，请勿刷新或关闭窗口。' };
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? 'null');
    if (saved?.schema === 1 && saved.todo && ['idle', 'unknown', 'rejected', 'conflict', 'saved', 'saving', 'loading', 'rereading'].includes(saved.phase)) {
      state = { ...state, todo: saved.todo, project: saved.project, pending: saved.pending, phase: saved.phase === 'saving' ? 'unknown' : saved.phase === 'loading' ? 'idle' : saved.phase === 'rereading' ? 'saved' : saved.phase };
      if (state.pending) state.message = '已恢复云端草稿与原请求；不会自动补传。结果不明时只能重试原请求。';
    }
  } catch { state.storageWarning = '未能恢复本窗口草稿。'; }
  const listeners = new Set();
  let generation = 0;
  let request;
  let busy = false;
  function publish(patch) {
    state = { ...state, ...patch };
    try { storage?.setItem(key, JSON.stringify({ schema: 1, todo: state.todo, project: state.project, pending: state.pending, phase: state.phase })); }
    catch { state.storageWarning = '浏览器无法暂存草稿；请勿刷新或关闭窗口。'; }
    listeners.forEach(listener => listener(state));
  }
  function allowed() { return cloud.getState().source === 'cloud' && cloud.getState().auth.canWrite && isOnline(); }
  function unlocked() { return !busy && !['unknown', 'saving'].includes(state.phase); }
  function changedFields(project = state.project) {
    return Object.fromEntries(Object.entries(project.fields).filter(([key, value]) => !equal(value, fieldsOf(project.base)[key]))
      .map(([key, value]) => [key, ['status', 'startDate', 'dueDate'].includes(key) && value === '' ? null : value]));
  }
  function editTodo(patch) {
    if (!unlocked()) return;
    publish({ todo: { ...state.todo, ...patch }, ...(state.phase === 'rejected' ? { phase: 'idle', pending: null } : {}) });
  }
  function editProject(patch) {
    if (!unlocked() || !state.project) return;
    publish({ project: { ...state.project, fields: { ...state.project.fields, ...patch } }, ...(state.phase === 'rejected' ? { phase: 'idle', pending: null } : {}) });
  }
  async function openProject(id) {
    if (!allowed() || !unlocked()) return;
    if (state.project) { publish({ message: '请先保存或关闭当前项目草稿，再编辑另一个项目。' }); return; }
    const start = generation; request = new AbortController(); busy = true;
    publish({ phase: 'loading', message: '正在读取项目最新版本。' });
    try {
      const record = await api.getProject(id, request.signal);
      if (start !== generation) return;
      publish({ project: { base: record, fields: fieldsOf(record) }, phase: 'idle', pending: null, latest: null, message: '' });
    } catch { if (start === generation) publish({ phase: 'idle', message: '读取项目失败，尚未打开编辑；请恢复连接后重试。' }); }
    finally { if (start === generation) busy = false; }
  }
  function closeProject() {
    if (!unlocked()) return;
    publish({ project: null, latest: null, pending: null, phase: 'idle', message: '' });
  }
  async function send() {
    if (busy || !state.pending) return;
    if (!allowed()) { publish({ message: '请联网、切到云端测试并授权写入后再保存；草稿与原请求保留。' }); return; }
    const start = generation;
    const operation = clone(state.pending);
    request = new AbortController(); busy = true;
    publish({ phase: 'saving', message: '正在保存到云端测试库…', confirmed: null });
    try {
      const confirmed = await (operation.kind === 'todo' ? api.createTodo(operation.payload, request.signal) : api.updateProject(operation.payload, request.signal));
      if (start !== generation) return;
      publish({ phase: 'rereading', pending: null, confirmed, latest: null,
        ...(operation.kind === 'todo' ? { todo: { title: '', urgent: false } } : { project: null }),
        message: `服务端已确认“${confirmed.item.title}” · v${confirmed.version}。正在重新读取列表…` });
      try { await cloud.refreshAfterWrite(); }
      catch { if (start === generation) publish({ phase: 'saved', message: `服务端已确认保存 · v${confirmed.version}，但重新读取失败；请点重新读取，勿重复新建。` }); return; }
      if (start !== generation) return;
      publish({ phase: 'saved', message: cloud.getState().readState === 'ready' ? `保存成功并已重新读取：“${confirmed.item.title}” · v${confirmed.version}。` : `服务端已确认保存 · v${confirmed.version}，但重新读取失败；请点重新读取，勿重复新建。` });
    } catch (error) {
      if (start !== generation) return;
      const phase = error.kind === 'conflict' ? 'conflict' : error.unknown || !(error.kind) ? 'unknown' : 'rejected';
      publish({ phase, message: phase === 'unknown' ? '保存结果不明。草稿及原请求已保留；请恢复连接后重试原请求。' : error.message, latest: null });
    } finally { if (start === generation) busy = false; }
  }
  function validateProject() {
    const fields = state.project.fields;
    if (fields.title.length > 150 || fields.currentSituation.length > 10000 || fields.nextStep.length > 10000) return '项目名称最多 150 字，情况和下一步最多 10000 字。';
    if (fields.tags.length > 30 || fields.tags.some(tag => tag.length > 60 || ['优先处理', '急需处理', '需要处理'].includes(tag))) return '请检查用户标签（最多 30 个、每个 60 字，不含系统状态标签）。';
    if (['startDate', 'dueDate'].some(key => fields[key] && !isCalendarDate(fields[key]))) return '日期须为有效的 YYYY-MM-DD。';
    return '';
  }
  async function saveTodo() {
    if (!unlocked() || state.phase === 'conflict') return;
    const title = state.todo.title.trim();
    if (!title || title.length > 150) { publish({ message: '待办名称须为 1 至 150 字。' }); return; }
    publish({ pending: { kind: 'todo', payload: { requestId: randomId(), type: 'todo', title, urgent: state.todo.urgent } } });
    return send();
  }
  async function saveProject() {
    if (!unlocked() || !state.project || state.phase === 'conflict') return;
    const invalid = validateProject();
    if (invalid) { publish({ message: invalid }); return; }
    const fields = changedFields();
    if (!Object.keys(fields).length) { publish({ message: '项目内容未改变，无需保存。' }); return; }
    publish({ pending: { kind: 'project', payload: { requestId: randomId(), id: state.project.base.item.id, expectedVersion: state.project.base.version, fields } } });
    return send();
  }
  async function loadLatest() {
    if (!state.project || busy || !allowed() || state.phase !== 'conflict') return;
    const start = generation; busy = true; request = new AbortController();
    try {
      const latest = await api.getProject(state.project.base.item.id, request.signal);
      if (start === generation) publish({ latest, message: '已读取最新版本。请对照下方服务端内容；采用最新基准后仍需再次点击保存。' });
    } catch { if (start === generation) publish({ message: '最新版本读取失败；冲突草稿仍保留。' }); }
    finally { if (start === generation) busy = false; }
  }
  function rebase() {
    if (busy || !state.latest || state.phase !== 'conflict') return;
    const mine = changedFields();
    const fields = { ...fieldsOf(state.latest), ...Object.fromEntries(Object.entries(mine).map(([key, value]) => [key, value ?? ''])) };
    publish({ project: { base: state.latest, fields }, pending: null, latest: null, phase: 'idle', message: '草稿已采用最新版本作为基准，保留你修改的字段；请核对后手动保存。' });
  }
  function suspend() {
    generation++; request?.abort(); busy = false;
    if (state.phase === 'saving') publish({ phase: 'unknown', message: '连接/视图已切换，保存结果未确认；原请求保留，可回到云端后重试。' });
    else if (state.phase === 'rereading') publish({ phase: 'saved', message: '服务端已确认保存；切回云端后可重新读取。' });
    else if (state.phase === 'loading') publish({ phase: 'idle', message: '' });
  }
  let previous = cloud.getState();
  const unsubscribe = cloud.subscribe(next => {
    if ((previous.source === 'cloud' && next.source === 'local') || (previous.auth.remembered && !next.auth.remembered)) suspend();
    previous = next;
  });
  return {
    editTodo, editProject, openProject, closeProject, saveTodo, saveProject, retry: send, loadLatest, rebase,
    parseTags: text => normalizeUserTags(text.split(/[,，\n]/)),
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    stop() { suspend(); unsubscribe(); listeners.clear(); },
  };
}
