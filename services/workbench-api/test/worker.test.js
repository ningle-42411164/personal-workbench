import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, createFetchMock } from 'miniflare';

const base = 'https://workbench.test';
const cookies = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');

test('本地 workerd：OAuth授权码+PKCE、未认证拦截及真实D1读写完整闭环', async t => {
  const { outputFiles } = await build({
    // fileURLToPath 同时处理 Windows 盘符和空格，避免 pathname 生成 /C:/... 无效路径。
    entryPoints: [fileURLToPath(new URL('../src/index.js', import.meta.url))], bundle: true, write: false,
    format: 'esm', platform: 'neutral', conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['browser', 'module', 'main'], external: ['cloudflare:*', 'node:*'], target: 'es2022',
  });
  const fetchMock = createFetchMock();
  // 整个运行测试禁止真实外连：GitHub仅使用虚构身份响应，不上传代码或数据。
  fetchMock.disableNetConnect();
  fetchMock.get('https://github.com').intercept({ path: '/login/oauth/access_token', method: 'POST' })
    .reply(200, { access_token: 'fake-github-token' }, { headers: { 'content-type': 'application/json' } });
  fetchMock.get('https://api.github.com').intercept({ path: '/user', method: 'GET' })
    .reply(200, { id: 275953771 }, { headers: { 'content-type': 'application/json' } });
  const mf = new Miniflare({
    modules: true, script: outputFiles[0].text, compatibilityDate: '2026-04-30',
    compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
    d1Databases: ['DB'], kvNamespaces: ['OAUTH_KV'], fetchMock,
    bindings: { PUBLIC_BASE_URL: base, FRONTEND_ORIGIN: 'https://ningle-42411164.github.io',
      OWNER_GITHUB_ID: '275953771', GITHUB_CLIENT_ID: 'fake-client', GITHUB_CLIENT_SECRET: 'fake-secret' },
  });
  t.after(() => mf.dispose());
  const call = (path, init = {}) => mf.dispatchFetch(`${base}${path}`, { redirect: 'manual', ...init });
  const db = await mf.getD1Database('DB');
  const sql = readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8');
  await db.batch(sql.split(';').filter(statement => statement.trim()).map(statement => db.prepare(statement)));

  const unauthenticated = await call('/mcp', { method: 'POST', body: '{}' });
  assert.equal(unauthenticated.status, 401);
  assert.match(unauthenticated.headers.get('www-authenticate'), /oauth-protected-resource/);
  assert.equal((await call('/api/items')).status, 401);
  assert.equal((await call('/api/items', { headers: { Origin: 'https://evil.test' } })).status, 403);
  const preflight = await call('/api/items', { method: 'OPTIONS', headers: { Origin: 'https://ningle-42411164.github.io' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://ningle-42411164.github.io');
  const metadata = await (await call('/.well-known/oauth-protected-resource')).json();
  assert.equal(metadata.resource, base);

  const registeredResponse = await call('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    client_name: '<script>not-trusted</script>', redirect_uris: ['https://chatgpt.com/connector/oauth/test-only'],
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
  }) });
  assert.equal(registeredResponse.status, 201, await registeredResponse.clone().text());
  const registered = await registeredResponse.json();
  const verifier = 'a'.repeat(64);
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
  const authQuery = new URLSearchParams({ client_id: registered.client_id, response_type: 'code',
    redirect_uri: 'https://chatgpt.com/connector/oauth/test-only', scope: 'workbench:read workbench:write offline_access',
    resource: base, state: 'client-owned-state', code_challenge: challenge, code_challenge_method: 'S256' });
  for (const [change, category] of [[{ client_id: 'nonexistent-test-client' }, 'client_unknown'], [{ redirect_uri: 'https://wrong.test/' }, 'redirect_mismatch']]) {
    const invalidQuery = new URLSearchParams(authQuery);
    for (const [key, value] of Object.entries(change)) invalidQuery.set(key, value);
    const rejected = await call(`/authorize?${invalidQuery}`);
    const failure = await rejected.json();
    assert.equal(rejected.status, 400);
    assert.deepEqual({ stage: failure.diagnostic.stage, category: failure.diagnostic.category }, { stage: 'authorize_parse', category });
    assert.match(failure.diagnostic.correlationId, /^[0-9a-f-]{36}$/);
    assert.doesNotMatch(JSON.stringify(failure), /client-owned-state|fake-secret|code_challenge|redirect_uri/);
  }
  const consent = await call(`/authorize?${authQuery}`);
  assert.equal(consent.status, 200, await consent.clone().text());
  assert.equal(consent.headers.get('referrer-policy'), 'same-origin');
  assert.match(consent.headers.get('content-security-policy'), /form-action 'self' https:\/\/github\.com https:\/\/chatgpt\.com;/);
  assert.match(consent.headers.get('content-security-policy'), /default-src 'none'/);
  const html = await consent.text();
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  const handle = /name="handle" value="([^"]+)"/.exec(html)[1];
  const missingBinding = await call('/authorize/decision', { method: 'POST', headers: {
    Origin: base, 'Content-Type': 'application/x-www-form-urlencoded',
  }, body: new URLSearchParams({ handle, decision: 'allow' }).toString() });
  assert.equal((await missingBinding.json()).diagnostic.category, 'browser_binding_missing');
  const browserMissingBinding = await call('/authorize/decision', { method: 'POST', headers: {
    Origin: base, Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded',
  }, body: new URLSearchParams({ handle, decision: 'allow' }).toString() });
  assert.equal(browserMissingBinding.status, 400);
  const help = await browserMissingBinding.text();
  assert.match(help, /请在 Edge 普通浏览器完成连接/);
  assert.match(help, /https:\/\/ningle-42411164.github.io\/personal-workbench\//);
  assert.doesNotMatch(help, new RegExp(handle));
  assert.doesNotMatch(help, /client-owned-state|fake-secret|code_challenge=/);
  // 修复浏览器表单策略不等于放宽来源白名单：opaque origin 依然必须被拒绝。
  const opaqueOrigin = await call('/authorize/decision', { method: 'POST', headers: {
    Origin: 'null', Cookie: cookies(consent), 'Content-Type': 'application/x-www-form-urlencoded',
  }, body: new URLSearchParams({ handle, decision: 'allow' }).toString() });
  assert.equal(opaqueOrigin.status, 403);
  const approval = await call('/authorize/decision', { method: 'POST', headers: {
    Origin: base, Cookie: cookies(consent), 'Content-Type': 'application/x-www-form-urlencoded',
  }, body: new URLSearchParams({ handle, decision: 'allow' }).toString() });
  assert.equal(approval.status, 302, await approval.clone().text());
  const githubUrl = new URL(approval.headers.get('location'));
  assert.equal(githubUrl.origin, 'https://github.com');
  assert.equal(githubUrl.searchParams.get('scope'), 'read:user');
  const callbackPath = `/auth/github/callback?${new URLSearchParams({ state: githubUrl.searchParams.get('state'), code: 'fake-github-code' })}`;
  const missingUpstreamBinding = await call(callbackPath);
  const upstreamFailure = await missingUpstreamBinding.json();
  assert.equal(upstreamFailure.diagnostic.stage, 'github_return');
  assert.equal(upstreamFailure.diagnostic.category, 'browser_binding_missing');
  const callback = await call(callbackPath, { headers: { Cookie: cookies(approval) } });
  assert.equal(callback.status, 302, await callback.clone().text());
  const location = new URL(callback.headers.get('location'));
  assert.equal(location.origin, 'https://chatgpt.com');
  assert.equal(location.searchParams.get('state'), 'client-owned-state');
  const tokenResponse = await call('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: location.searchParams.get('code'),
      client_id: registered.client_id, redirect_uri: 'https://chatgpt.com/connector/oauth/test-only', code_verifier: verifier,
      resource: base }).toString() });
  assert.equal(tokenResponse.status, 200, await tokenResponse.clone().text());
  const tokens = await tokenResponse.json();
  assert.ok(tokens.access_token);
  const auth = { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' };
  const payload = { requestId: 'runtime-create-1', type: 'project', title: '虚构运行测试' };
  const createdResponse = await call('/api/items', { method: 'POST', headers: auth, body: JSON.stringify(payload) });
  assert.equal(createdResponse.status, 201, await createdResponse.clone().text());
  const created = await createdResponse.json();
  const replay = await (await call('/api/items', { method: 'POST', headers: auth, body: JSON.stringify(payload) })).json();
  assert.equal(replay.item.id, created.item.id);
  const list = await (await call('/api/items', { headers: auth })).json();
  assert.equal(list.items.length, 1);
  const mcpHeaders = { ...auth, Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' };
  const mcpRead = await call('/mcp', { method: 'POST', headers: mcpHeaders, body: JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_items', arguments: {} },
  }) });
  assert.equal(mcpRead.status, 200, await mcpRead.clone().text());
  assert.equal((await mcpRead.json()).result.structuredContent.items[0].item.id, created.item.id);
  const patch = await call(`/api/projects/${created.item.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({
    requestId: 'runtime-patch-1', expectedVersion: 1, fields: { currentSituation: '真实D1事务已验证' },
  }) });
  assert.equal(patch.status, 200, await patch.clone().text());
  assert.equal((await patch.json()).version, 2);
  const stale = await call(`/api/projects/${created.item.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({
    requestId: 'runtime-stale-1', expectedVersion: 1, fields: { currentSituation: '过期更新' },
  }) });
  assert.equal(stale.status, 409);
  const competing = await Promise.all(['A', 'B'].map(suffix => call(`/api/projects/${created.item.id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ requestId: `runtime-race-${suffix}`, expectedVersion: 2,
      fields: { currentSituation: suffix } }),
  })));
  assert.deepEqual(competing.map(response => response.status).sort(), [200, 409]);
  const reusedCallback = await call(callbackPath, { headers: { Cookie: cookies(approval) } });
  assert.equal(reusedCallback.status, 400);
  assert.equal((await reusedCallback.json()).diagnostic.category, 'transaction_expired_or_used');
  fetchMock.assertNoPendingInterceptors();
});
