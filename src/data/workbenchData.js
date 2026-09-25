export const STORAGE_KEY = 'personal-workbench.data.v2';
export const SCHEMA_VERSION = 2;
const SIMPLE_TYPES = ['project', 'shopping', 'waiting', 'creation'];
const CONVERSION_TYPES = ['todo', 'project', 'importantDate', ...SIMPLE_TYPES.filter(type => type !== 'project')];

export function emptyWorkbenchData() {
  return { schemaVersion: SCHEMA_VERSION, items: [] };
}

function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1) return false;
  const date = utcCalendarDay(year, month, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function utcCalendarDay(year, month, day) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

// 只取本地年月日，再用 UTC 日历序号相减，避免夏令时造成 23/25 小时的误差。
export function daysUntil(targetDate, now = new Date()) {
  if (!isCalendarDate(targetDate)) throw new Error('目标日期格式不正确。');
  const [year, month, day] = targetDate.split('-').map(Number);
  const targetDay = utcCalendarDay(year, month, day).getTime();
  const currentDay = utcCalendarDay(now.getFullYear(), now.getMonth() + 1, now.getDate()).getTime();
  return Math.round((targetDay - currentDay) / 86400000);
}

// 导入和读取共用一套校验；不修补缺失字段，也不替用户编造日期。
export function validateWorkbenchData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('备份格式不正确：顶层必须是数据对象。');
  }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`不支持此备份版本（需要版本 ${SCHEMA_VERSION}）。`);
  }
  if (!Array.isArray(data.items)) {
    throw new Error('备份格式不正确：items 必须是数组。');
  }

  const ids = new Set();
  data.items.forEach((item, index) => {
    const position = `第 ${index + 1} 条事项`;
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        !['todo', 'note', 'routine', 'importantDate', ...SIMPLE_TYPES].includes(item.type) ||
        typeof item.id !== 'string' || !item.id.trim() ||
        typeof item.title !== 'string' || !item.title.trim() || item.title.length > 150 ||
        !Array.isArray(item.tags) || item.tags.some(tag => typeof tag !== 'string') ||
        !isTimestamp(item.createdAt) || !isTimestamp(item.updatedAt)) {
      throw new Error(`${position}格式不正确，请检查类型、标题、标签、时间和完成状态。`);
    }
    if (item.type === 'todo' &&
        (typeof item.urgent !== 'boolean' || typeof item.done !== 'boolean' ||
         !(item.completedAt === null || isTimestamp(item.completedAt)) ||
         (item.done && item.completedAt === null) || (!item.done && item.completedAt !== null))) {
      throw new Error(`${position}的待办完成状态或时间格式不正确。`);
    }
    if (item.type === 'importantDate' && !isCalendarDate(item.targetDate)) {
      throw new Error(`${position}的目标日期不正确。`);
    }
    if (item.priority !== undefined && typeof item.priority !== 'boolean') {
      throw new Error(`${position}的优先处理状态不正确。`);
    }
    if (item.type === 'project') {
      if ((item.status !== undefined && !['active', 'paused', 'done'].includes(item.status)) ||
          (item.startDate !== undefined && item.startDate !== null && !isCalendarDate(item.startDate)) ||
          (item.dueDate !== undefined && item.dueDate !== null && !isCalendarDate(item.dueDate)) ||
          (item.currentSituation !== undefined && typeof item.currentSituation !== 'string') ||
          (item.nextStep !== undefined && typeof item.nextStep !== 'string') ||
          (item.completedAt !== undefined && item.completedAt !== null && !isTimestamp(item.completedAt)) ||
          (item.status === 'done' && !isTimestamp(item.completedAt)) ||
          (item.status !== 'done' && item.completedAt != null) ||
          (item.updates !== undefined && (!Array.isArray(item.updates) || item.updates.some(update =>
            !update || typeof update !== 'object' || Array.isArray(update) ||
            typeof update.id !== 'string' || !update.id.trim() ||
            typeof update.content !== 'string' || !isTimestamp(update.createdAt)) ||
            new Set(item.updates.map(update => update.id)).size !== item.updates.length))) {
        throw new Error(`${position}的项目详情或更新记录格式不正确。`);
      }
    }
    if (item.type === 'note') {
      const conversionFields = [item.convertedToId, item.convertedToType, item.convertedAt];
      if (conversionFields.some(value => value !== undefined) &&
          (typeof item.convertedToId !== 'string' || !item.convertedToId.trim() ||
           !CONVERSION_TYPES.includes(item.convertedToType) || !isTimestamp(item.convertedAt))) {
        throw new Error(`${position}的随笔转换信息不完整。`);
      }
    }
    if (ids.has(item.id)) {
      throw new Error(`备份中存在重复 ID：${item.id}`);
    }
    ids.add(item.id);
  });
  for (const item of data.items) {
    if (item.type === 'note' && item.convertedToId) {
      const target = data.items.find(candidate => candidate.id === item.convertedToId);
      if (!target || target.type !== item.convertedToType) {
        throw new Error(`随笔“${item.title}”的已录入目标不存在或类型不一致。`);
      }
    }
  }
  return data;
}

export function readWorkbenchData(storage = localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return emptyWorkbenchData();
    return validateWorkbenchData(JSON.parse(raw));
  } catch (error) {
    const reason = error instanceof SyntaxError ? '保存内容不是有效的 JSON。' : error.message;
    throw new Error(`新版数据读取失败：${reason}已暂停修改，以保护原始内容。`);
  }
}

// 先写入浏览器，再由页面更新画面；写入失败时原记录保持不变。
export function writeWorkbenchData(data, storage = localStorage) {
  validateWorkbenchData(data);
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function createBaseItem(type, title, now) {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createTodo(title, urgent, now = new Date().toISOString()) {
  return {
    ...createBaseItem('todo', title, now),
    urgent,
    done: false,
    completedAt: null,
  };
}

export function createNote(title, now = new Date().toISOString()) {
  return createBaseItem('note', title, now);
}

export function createRoutine(title, now = new Date().toISOString()) {
  return createBaseItem('routine', title, now);
}

export function createImportantDate(title, targetDate, now = new Date().toISOString(), priority = false) {
  return { ...createBaseItem('importantDate', title, now), targetDate, priority };
}

export function createSimpleItem(type, title, now = new Date().toISOString(), priority = false) {
  if (!SIMPLE_TYPES.includes(type)) throw new Error('不支持此事项分类。');
  const item = { ...createBaseItem(type, title, now), priority };
  return type === 'project' ? {
    ...item, status: 'active', startDate: null, dueDate: null,
    currentSituation: '', nextStep: '', updates: [], completedAt: null,
  } : item;
}

// 旧项目可以没有详情字段；只在用户实际编辑时补齐，不改写原有备份。
export function projectEditableFields(project) {
  if (project.type !== 'project') throw new Error('这不是项目事项。');
  return {
    title: project.title, tags: project.tags, status: project.status ?? 'active',
    startDate: project.startDate ?? null, dueDate: project.dueDate ?? null,
    currentSituation: project.currentSituation ?? '', nextStep: project.nextStep ?? '',
  };
}

export function parseProjectTags(text) {
  return [...new Set(text.split(/[\s,，]+/).map(tag => tag.replace(/^#+/, '').trim()).filter(Boolean))];
}

export function updateProject(project, fields, now = new Date().toISOString()) {
  const before = projectEditableFields(project);
  const next = {
    title: fields.title.trim(), tags: fields.tags, status: fields.status,
    startDate: fields.startDate || null, dueDate: fields.dueDate || null,
    currentSituation: fields.currentSituation, nextStep: fields.nextStep,
  };
  if (!next.title || next.title.length > 150 || !Array.isArray(next.tags) ||
      next.tags.some(tag => typeof tag !== 'string' || !tag.trim()) ||
      !['active', 'paused', 'done'].includes(next.status) ||
      (next.startDate !== null && !isCalendarDate(next.startDate)) ||
      (next.dueDate !== null && !isCalendarDate(next.dueDate))) {
    throw new Error('请检查项目名称、状态、标签和日期。');
  }
  const changed = Object.keys(next).some(key => key === 'tags'
    ? next.tags.length !== before.tags.length || next.tags.some((tag, index) => tag !== before.tags[index])
    : next[key] !== before[key]);
  if (!changed) return project;

  const updates = project.updates ?? [];
  const situationChanged = next.currentSituation !== before.currentSituation;
  return {
    ...project, ...next, updatedAt: now,
    completedAt: next.status === 'done' ? (before.status === 'done' ? project.completedAt : now) : null,
    updates: situationChanged ? [...updates, { id: crypto.randomUUID(), content: next.currentSituation, createdAt: now }] : updates,
  };
}

export function comparePriorityThenNewest(a, b) {
  return Number(Boolean(b.priority)) - Number(Boolean(a.priority)) || b.createdAt.localeCompare(a.createdAt);
}

// 转换保留原随笔，并同时生成一个新事项；页面只需将返回数组保存一次。
export function convertNote(items, noteId, targetType, targetDate, now = new Date().toISOString()) {
  const note = items.find(item => item.id === noteId && item.type === 'note');
  if (!note || note.convertedToId) throw new Error('这条随笔已录入，不能重复转换。');
  if (!CONVERSION_TYPES.includes(targetType)) throw new Error('请选择有效的目标分类。');
  if (targetType === 'importantDate' && !isCalendarDate(targetDate)) {
    throw new Error('请先选择有效的目标日期。');
  }
  const target = targetType === 'todo' ? createTodo(note.title, false, now)
    : targetType === 'importantDate' ? createImportantDate(note.title, targetDate, now)
      : createSimpleItem(targetType, note.title, now);
  return [...items.map(item => item.id === noteId ? {
    ...item, updatedAt: now, convertedToId: target.id, convertedToType: targetType, convertedAt: now,
  } : item), target];
}

// 删除转换目标时只解除原随笔的关联；随笔和其他事项都保持原样。
export function removeItem(items, id, now = new Date().toISOString()) {
  if (!items.some(item => item.id === id)) throw new Error('要删除的事项不存在。');
  return items.filter(item => item.id !== id).map(item => {
    if (item.type !== 'note' || item.convertedToId !== id) return item;
    const { convertedToId, convertedToType, convertedAt, ...originalNote } = item;
    return { ...originalNote, updatedAt: now };
  });
}

export function renameItem(item, title, now = new Date().toISOString()) {
  return { ...item, title, updatedAt: now };
}

export function toggleTodo(todo, now = new Date().toISOString()) {
  const done = !todo.done;
  return { ...todo, done, updatedAt: now, completedAt: done ? now : null };
}
