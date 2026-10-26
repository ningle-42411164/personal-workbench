import { z } from 'zod';
import { createTodo, createNote, createRoutine, createImportantDate, createSimpleItem,
  createProject, updateProject, validateWorkbenchData, isCalendarDate } from '../../../src/data/workbenchData.js';
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
  requestId, type: itemType, title, tags: tags.optional(), priority: z.boolean().optional(),
  urgent: z.boolean().optional(), targetDate: date.optional(),
  fields: projectFieldsSchema.omit({ title: true, tags: true }).optional(),
}).strict();
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
  item.tags = cleanTags(input.tags ?? []);
  validateWorkbenchData({ schemaVersion: 2, items: [item] });
  return item;
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
  if (next.tags) next.tags = cleanTags(next.tags);
  // 沿用 updateProject：仅实际变化写入，只有“当前情况”变化才追加历史。
  return updateProject(item, next);
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
