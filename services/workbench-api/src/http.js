import { ApiError, publicError } from './errors.js';
import { handleMcp } from './mcp.js';

export function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...extraHeaders } });
}

export async function readJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'JSON_REQUIRED', '请使用 application/json。');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_JSON', '请求缺少 JSON 内容。');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) { await reader.cancel(); throw new ApiError(413, 'TOO_LARGE', '请求内容过大。'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError(400, 'INVALID_JSON', '请求不是有效的 JSON。'); }
}

export async function handleApi(request, service, baseUrl) {
  try {
    const url = new URL(request.url);
    if (url.pathname === '/mcp') return await handleMcp(request, service, baseUrl);
    if (url.pathname === '/api/items' && request.method === 'GET') {
      const allowed = new Set(['type', 'includeCompleted', 'limit', 'offset']);
      if ([...url.searchParams.keys()].some(key => !allowed.has(key))) throw new ApiError(400, 'INVALID_INPUT', '存在未知查询字段。');
      const raw = Object.fromEntries(url.searchParams);
      if (raw.includeCompleted !== undefined && !['true', 'false'].includes(raw.includeCompleted)) throw new ApiError(400, 'INVALID_INPUT', 'includeCompleted 必须为 true 或 false。');
      return json(await service.list({
        ...(raw.type !== undefined ? { type: raw.type } : {}),
        ...(raw.includeCompleted !== undefined ? { includeCompleted: raw.includeCompleted === 'true' } : {}),
        ...(raw.limit !== undefined ? { limit: Number(raw.limit) } : {}),
        ...(raw.offset !== undefined ? { offset: Number(raw.offset) } : {}),
      }));
    }
    if (url.pathname === '/api/items' && request.method === 'POST') return json(await service.create(await readJson(request)), 201);
    const match = /^\/api\/projects\/([^/]+)$/.exec(url.pathname);
    if (match && request.method === 'GET') return json(await service.getProject({ id: match[1] }));
    if (match && request.method === 'PATCH') {
      const body = await readJson(request);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.hasOwn(body, 'id')) throw new ApiError(400, 'INVALID_INPUT', '项目 ID 只能通过路径指定。');
      return json(await service.updateProject({ ...body, id: match[1] }));
    }
    return json({ code: 'NOT_FOUND', message: '接口不存在。' }, 404);
  } catch (error) {
    const failure = publicError(error);
    return json({ code: failure.code, message: failure.message }, failure.status, failure.code === 'INSUFFICIENT_SCOPE' ? {
      'WWW-Authenticate': `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource", error="insufficient_scope", scope="workbench:read workbench:write"`,
    } : {});
  }
}
