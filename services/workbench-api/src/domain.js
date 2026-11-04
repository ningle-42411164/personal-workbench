import { z } from 'zod';
import { createTodo, createNote, createRoutine, createImportantDate, createSimpleItem,
  createProject, updateProject, validateWorkbenchData, isCalendarDate, COMPLETABLE_TYPES, toggleTodo } from '../../../src/data/workbenchData.js';
import { normalizeUserTags } from '../../../src/data/userTags.js';
import { ApiError } from './errors.js';

export const itemType = z.enum(['todo', 'note', 'routine', 'importantDate', 'project', 'waiting', 'shopping', 'creation']);
const requestId = z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/).describe('为这次用户确认的操作生成唯一标识；网络重试必须复用同一个标识。');
const title = z.string().max(150);
const tags = z.array(z.string().max(60)).max(30);
const date = z.string().refine(isCalendarDate, '日期必须为有效的 YYYY-MM-DD');
export const projectFieldsSchema = z.object({
  title: title.optional(), tags: tags.optional(), status: z.enum(['active', 'paused', 'done']).nullable().optional(),
  startDate: date.nullable().optional(), dueDate: date.nullable().optional(),
  currentSituation: z.string().max(10000).optional(), nextStep: z.string().max(10000).optional(),
}).strict();
export const listSchema = z.object({
  type: itemType.optional(), includeCompleted: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).max(100000).default(0),
}).strict();
export const getProjectSchema = z.object({ id: z.string().uuid() }).strict();
export const createSchema = z.object({
  requestId, id: z.string().uuid().optional(), type: itemType, title, tags: tags.optional(), priority: z.boolean().optional(),
  urgent: z.boolean().optional(), targetDate: date.optional(),
  fields: projectFieldsSchema.omit({ title: true, tags: true }).optional(),
}).strict();
const versioned = { requestId, id: z.string().uuid(), expectedVersion: z.number().int().positive() };
export const convertSchema = z.object({ ...versioned, targetType: z.enum(['todo', 'project', 'importantDate', 'waiting', 'shopping', 'creation']), targetDate: date.optional() }).strict();
// 同步复用本机 v2 记录，保留离线操作时间和已有项目历史；不是导入任意 JSON 的入口。
const timestamp = z.string().datetime();
const snapshotBase = { rankTie: z.string().regex(/^[A-Za-z0-9]+$/).max(512).optional(), rank: z.number().finite().optional(), id: z.string().uuid(), title, tags, createdAt: timestamp, updatedAt: timestamp, priority: z.boolean().optional() };
const sortableSnapshot = { ...snapshotBase, pinned: z.boolean().optional() };
export const syncSchema = z.object({ requestId, id: z.string().uuid(), expectedVersion: z.number().int().min(0), item: z.discriminatedUnion('type', [
  ...['waiting', 'shopping', 'creation'].map(type => z.object({ ...sortableSnapshot, type: z.literal(type), done: z.boolean().optional(), completedAt: timestamp.nullable().optional() }).strict()),
  z.object({ ...sortableSnapshot, type: z.literal('note'), returnedFromTodo: z.literal(true).optional(), done: z.boolean().optional(), completedAt: timestamp.nullable().optional(), convertedToId: z.string().uuid().optional(), convertedToType: z.enum(['todo', 'project', 'importantDate', 'waiting', 'shopping', 'creation']).optional(), convertedAt: timestamp.optional() }).strict(),
  z.object({ ...snapshotBase, type: z.literal('routine') }).strict(),
  z.object({ ...sortableSnapshot, type: z.literal('importantDate'), targetDate: date }).strict(),
  z.object({ ...sortableSnapshot, type: z.literal('todo'), urgent: z.boolean(), done: z.boolean(), completedAt: timestamp.nullable() }).strict(),
  z.object({ ...sortableSnapshot, type: z.literal('project'), status: z.enum(['active', 'paused', 'done']).nullable().optional(), startDate: date.nullable().optional(), dueDate: date.nullable().optional(), currentSituation: z.string().max(10000).optional(), nextStep: z.string().max(10000).optional(), completedAt: timestamp.nullable().optional(), updates: z.array(z.object({ id: z.string().min(1), content: z.string().max(10000), createdAt: timestamp }).strict()).optional() }).strict(),
]) }).strict();
export const syncBatchSchema = z.object({ requestId, entries: z.array(z.object({ id: z.string().uuid(), expectedVersion: z.number().int().min(0), item: syncSchema.shape.item.nullable() }).strict()).min(2).max(32) }).strict();

export function syncItem(input, previous, references = []) {
  const item = { ...input.item, tags: cleanTags(input.item.tags) };
  if (item.type === 'todo' && item.urgent && item.pinned === false) item.pinned = true;
  if (item.type === 'todo' && previous?.urgent && !item.urgent && item.pinned === undefined) item.pinned = true;
  if (item.id !== input.id || item.type !== 'project' && !item.title.trim()) throw new ApiError(400, 'INVALID_INPUT', '同步事项内容无效。');
  const returning = previous?.type === 'todo' && !previous.done && item.type === 'note' && item.returnedFromTodo === true && !item.done;
  if (previous && (item.type !== previous.type && !returning || item.createdAt !== previous.createdAt)) throw new ApiError(400, 'IMMUTABLE_FIELD', '同步不能改变原记录的分类或创建时间。');
  validateWorkbenchData({ schemaVersion: 2, items: [item, ...references.filter(value => value.id !== item.id)] });
  return previous && JSON.stringify(canonical(previous)) === JSON.stringify(canonical(item)) ? previous : item;
}
export const itemPatchSchema = z.object({ ...versioned, fields: z.object({
  title: title.optional(), tags: tags.optional(), priority: z.boolean().optional(), urgent: z.boolean().optional(), targetDate: date.optional(),
}).strict() }).strict();
export const completionSchema = z.object({ ...versioned, done: z.boolean() }).strict();
export const deleteSchema = z.object(versioned).strict();
const cursor = z.string().regex(/^(0|[1-9][0-9]*)$/).refine(value => Number.isSafeInteger(Number(value)));
export const changesSchema = z.object({ since: cursor.default('0'), until: cursor.optional(), limit: z.number().int().min(1).max(100).default(100) }).strict();
export const updateSchema = z.object({
  requestId, id: z.string().uuid(), expectedVersion: z.number().int().positive(), fields: projectFieldsSchema,
}).strict();

export function makeItem(input) {
  const { type, title: rawTitle, fields, targetDate, urgent, priority } = input;
  if (type !== 'project' && !rawTitle.trim()) throw new ApiError(400, 'INVALID_INPUT', '事项名称不能为空。');
  if ((fields && type !== 'project') || (targetDate !== undefined && type !== 'importantDate') ||
      (urgent !== undefined && type !== 'todo')) throw new ApiError(400, 'INVALID_INPUT', '该分类不支持这些字段。');
  if (type === 'importantDate' && !targetDate) throw new ApiError(400, 'INVALID_INPUT', '重要日需要目标日期。');
  const now = new Date().toISOString();
  const name = rawTitle.trim();
  let item;
  if (type === 'todo') item = createTodo(name, urgent ?? false, now);
  else if (type === 'note') item = createNote(name, now);
  else if (type === 'routine') item = createRoutine(name, now);
  else if (type === 'importantDate') item = createImportantDate(name, targetDate, now, priority ?? false);
  else if (type === 'project') item = createProject(name, fields ?? {}, now, priority ?? false);
  else item = createSimpleItem(type, name, now, priority ?? false);
  if (priority !== undefined) item.priority = priority;
  if (input.id) item.id = input.id;
  item.tags = cleanTags(input.tags ?? []);
  validateWorkbenchData({ schemaVersion: 2, items: [item] });
  return item;
}

export function patchItem(item, fields, references = []) {
  if (Object.hasOwn(fields, 'urgent') && item.type !== 'todo' || Object.hasOwn(fields, 'targetDate') && item.type !== 'importantDate') throw new ApiError(400, 'INVALID_INPUT', '该分类不支持这些字段。');
  const next = { ...fields };
  // 单独撤销紧急标记保留普通置顶，包括原来只有 urgent 的旧待办。
  if (fields.urgent === true || (fields.urgent === false && item.urgent)) next.pinned = true;
  if (next.title !== undefined) { next.title = next.title.trim(); if (!next.title && item.type !== 'project') throw new ApiError(400, 'INVALID_INPUT', '事项名称不能为空。'); }
  if (next.tags) next.tags = cleanTags(next.tags);
  const changed = Object.keys(next).some(key => JSON.stringify(item[key]) !== JSON.stringify(next[key]));
  if (!changed) return item;
  const result = { ...item, ...next, ...(item.type === 'project' ? {rank:-Date.now()} : {}), updatedAt: new Date().toISOString() };
  validateWorkbenchData({ schemaVersion: 2, items: [result, ...references] });
  return result;
}

export function setCompletion(item, done) {
  if (!COMPLETABLE_TYPES.includes(item.type)) throw new ApiError(400, 'INVALID_INPUT', '此分类请使用其专用状态接口。');
  // 明确设为 true/false，而非直接 toggle：不同设备的重复操作不会二次翻转。
  return Boolean(item.done) === done ? item : toggleTodo(item);
}

function cleanTags(values) {
  const normalized = normalizeUserTags(values);
  if (normalized.some(tag => ['优先处理', '急需处理', '需要处理'].includes(tag))) {
    throw new ApiError(400, 'INVALID_INPUT', '系统状态不能作为用户标签。');
  }
  return normalized;
}

export function patchProject(item, fields) {
  const next = { ...fields };
  // 单独撤销紧急标记保留普通置顶，包括原来只有 urgent 的旧待办。
  if (fields.urgent === true || (fields.urgent === false && item.urgent)) next.pinned = true;
  if (next.tags) next.tags = cleanTags(next.tags);
  // 沿用 updateProject：仅实际变化写入，只有“当前情况”变化才追加历史。
  const result = updateProject(item, next);
  return result === item ? item : { ...result, rank: -Date.now() };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]),
  );
  return value;
}

export async function fingerprint(operation, input) {
  const { requestId: _requestId, ...body } = input;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical({ operation, body })));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
