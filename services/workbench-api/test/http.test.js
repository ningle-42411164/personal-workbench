import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { D1Store } from '../src/store.js';
import { WorkbenchService, READ_SCOPE, WRITE_SCOPE } from '../src/service.js';
import { handleApi } from '../src/http.js';
import { readGithubIdentity, escapeHtml, handleAuthorization } from '../src/authorization.js';
import { sqliteD1 } from './sqlite-d1.js';

const base = 'https://workbench.test';
function setup(t, scopes = [READ_SCOPE, WRITE_SCOPE]) {
  const db = sqliteD1(); t.after(() => db.close());
  return new WorkbenchService(new D1Store(db, '275953771'), { id: '275953771', scopes });
}
function request(path, body, method = 'POST') {
  return new Request(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('REST 创建后读取、项目按版本更新，与共享业务层一致', async t => {
  const service = setup(t);
  const response = await handleApi(request('/api/items', { requestId: 'http-create-1', type: 'project', title: 'HTTP项目' }), service, base);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const created = await response.json();
  const updated = await handleApi(request(`/api/projects/${created.item.id}`, {
    requestId: 'http-update-1', expectedVersion: 1, fields: { nextStep: '验证MCP' },
  }, 'PATCH'), service, base);
  assert.equal(updated.status, 200);
  const read = await handleApi(new Request(`${base}/api/projects/${created.item.id}`), service, base);
  assert.equal((await read.json()).item.nextStep, '验证MCP');
});

test('REST 错误版本、错误JSON和只读权限均返回明确错误', async t => {
  const service = setup(t, [READ_SCOPE]);
  const denied = await handleApi(request('/api/items', { requestId: 'denied-http-1', type: 'todo', title: '拒绝' }), service, base);
  assert.equal(denied.status, 403);
  assert.match(denied.headers.get('www-authenticate'), /insufficient_scope/);
  const invalid = await handleApi(new Request(`${base}/api/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }), service, base);
  assert.equal(invalid.status, 400);
  const invalidQuery = await handleApi(new Request(`${base}/api/items?includeCompleted=maybe`), service, base);
  assert.equal(invalidQuery.status, 400);
});

test('REST 拒绝超大正文，不暴露内部数据库信息', async t => {
  const service = setup(t);
  const large = await handleApi(request('/api/items', { title: 'x'.repeat(70000) }), service, base);
  assert.equal(large.status, 413);
  service.store.db.batch = async () => { throw new Error('private-sql-secret'); };
  const failed = await handleApi(request('/api/items', { requestId: 'http-failed-1', type: 'todo', title: '失败' }), service, base);
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private-sql-secret/);
});

test('真实MCP SDK客户端完成初始化、工具发现、创建、查询和项目更新', async t => {
  const service = setup(t);
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    fetch: (url, init) => handleApi(new Request(url, init), service, base),
  });
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  await client.connect(transport); t.after(() => client.close());
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), ['list_items', 'get_project', 'create_item', 'update_project', 'ping']);
  assert.ok(tools.filter(tool => tool.name !== 'ping').every(tool => tool.outputSchema?.type === 'object'));
  const ping = tools.find(tool => tool.name === 'ping');
  assert.equal(Object.hasOwn(ping, 'outputSchema'), false);
  assert.equal(Object.hasOwn(ping, '_meta'), false);
  const beforePing = await service.list({ includeCompleted: true });
  assert.deepEqual(await client.callTool({ name: 'ping', arguments: {} }), { content: [{ type: 'text', text: 'Personal Workbench ping OK' }] });
  assert.deepEqual(await service.list({ includeCompleted: true }), beforePing);
  assert.deepEqual(tools.find(tool => tool.name === 'list_items').outputSchema.required.sort(), ['items', 'nextOffset']);
  assert.equal(tools.find(tool => tool.name === 'list_items').annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === 'create_item').annotations.readOnlyHint, false);
  const created = await client.callTool({ name: 'create_item', arguments: { requestId: 'mcp-create-1', type: 'project', title: 'MCP项目' } });
  assert.notEqual(created.isError, true);
  const record = created.structuredContent;
  assert.equal(record.item.title, 'MCP项目');
  const updated = await client.callTool({ name: 'update_project', arguments: {
    requestId: 'mcp-update-1', id: record.item.id, expectedVersion: record.version, fields: { currentSituation: 'MCP更新' },
  } });
  assert.equal(updated.structuredContent.version, 2);
  const listed = await client.callTool({ name: 'list_items', arguments: {} });
  assert.equal(listed.structuredContent.items[0].item.currentSituation, 'MCP更新');
  assert.deepEqual(JSON.parse(listed.content[0].text), listed.structuredContent);
  assert.ok(Buffer.byteLength(JSON.stringify(listed), 'utf8') < 8192);
});

test('MCP只读令牌调用写工具返回权限错误，不执行写入', async t => {
  const service = setup(t, [READ_SCOPE]);
  const client = new Client({ name: 'read-only-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    fetch: (url, init) => handleApi(new Request(url, init), service, base),
  })); t.after(() => client.close());
  const denied = await client.callTool({ name: 'create_item', arguments: { requestId: 'mcp-denied-1', type: 'todo', title: '拒绝' } });
  assert.equal(denied.isError, true);
  assert.match(denied._meta['mcp/www_authenticate'][0], /insufficient_scope/);
  assert.equal((await service.list({})).items.length, 0);
});

test('GitHub身份只接受固定所有者，令牌不进入返回数据', async () => {
  const env = { GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-secret', PUBLIC_BASE_URL: base, OWNER_GITHUB_ID: '275953771' };
  const fetcher = userId => async url => Response.json(String(url).includes('/access_token') ? { access_token: 'test-token' } : { id: userId, login: 'test-owner' });
  assert.deepEqual(await readGithubIdentity('test-code', env, fetcher(275953771)), { userId: '275953771' });
  await assert.rejects(readGithubIdentity('test-code', env, fetcher(999)), { code: 'OWNER_ONLY' });
  await assert.rejects(readGithubIdentity('bad-code', env, async () => Response.json({ error: 'bad_verification_code' })), { code: 'IDENTITY_REJECTED' });
});

test('授权页元数据经过转义，未使用S256的请求被拒绝', async () => {
  assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
  const env = { PUBLIC_BASE_URL: base, OAUTH_PROVIDER: { parseAuthRequest: async () => ({ codeChallengeMethod: 'plain', codeChallenge: 'x' }) } };
  await assert.rejects(handleAuthorization(new Request(`${base}/authorize`), env), { code: 'PKCE_REQUIRED' });
  await assert.rejects(handleAuthorization(new Request(`${base}/authorize/decision`, { method: 'POST', headers: { Origin: 'https://evil.test' } }), env), { code: 'ORIGIN_REJECTED' });
});
