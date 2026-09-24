export const STORAGE_KEY = 'personal-workbench.data.v2';
export const SCHEMA_VERSION = 2;

export function emptyWorkbenchData() {
  return { schemaVersion: SCHEMA_VERSION, items: [] };
}

function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value;
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
    if (!item || typeof item !== 'object' || Array.isArray(item) || item.type !== 'todo' ||
        typeof item.id !== 'string' || !item.id.trim() ||
        typeof item.title !== 'string' || !item.title.trim() || item.title.length > 150 ||
        !Array.isArray(item.tags) || item.tags.some(tag => typeof tag !== 'string') ||
        !isTimestamp(item.createdAt) || !isTimestamp(item.updatedAt) ||
        typeof item.urgent !== 'boolean' || typeof item.done !== 'boolean' ||
        !(item.completedAt === null || isTimestamp(item.completedAt)) ||
        (item.done && item.completedAt === null) || (!item.done && item.completedAt !== null)) {
      throw new Error(`${position}格式不正确，请检查类型、标题、标签、时间和完成状态。`);
    }
    if (ids.has(item.id)) {
      throw new Error(`备份中存在重复 ID：${item.id}`);
    }
    ids.add(item.id);
  });
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

export function createTodo(title, urgent, now = new Date().toISOString()) {
  return {
    id: crypto.randomUUID(),
    type: 'todo',
    title,
    tags: [],
    createdAt: now,
    updatedAt: now,
    urgent,
    done: false,
    completedAt: null,
  };
}

export function toggleTodo(todo, now = new Date().toISOString()) {
  const done = !todo.done;
  return { ...todo, done, updatedAt: now, completedAt: done ? now : null };
}
