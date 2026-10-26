import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 只检查公开健康状态、发现元数据和未认证拦截；不读取凭证，不创建或修改事项。
const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const base = config.vars.PUBLIC_BASE_URL;
const checks = [];
async function request(path, init) {
  return fetch(`${base}${path}`, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20000) });
}

const health = await request('/health');
assert.equal(health.status, 200);
assert.equal((await health.json()).ready, true);
checks.push('/health: 200, ready=true');

for (const path of ['/mcp', '/api/items']) {
  const response = await request(path, path === '/mcp'
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    : undefined);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate') ?? '', /oauth-protected-resource/);
  checks.push(`${path}: anonymous request rejected with 401 and OAuth discovery challenge`);
}

const resourceResponse = await request('/.well-known/oauth-protected-resource');
assert.equal(resourceResponse.status, 200);
const resource = await resourceResponse.json();
assert.equal(resource.resource, base);
assert.deepEqual(resource.authorization_servers, [base]);
checks.push('Protected resource metadata: correct resource and authorization server');

const discoveryResponse = await request('/.well-known/oauth-authorization-server');
assert.equal(discoveryResponse.status, 200);
const discovery = await discoveryResponse.json();
assert.equal(discovery.issuer, base);
assert.equal(discovery.authorization_endpoint, `${base}/authorize`);
assert.equal(discovery.token_endpoint, `${base}/oauth/token`);
assert.equal(discovery.registration_endpoint, `${base}/oauth/register`);
assert.ok(discovery.code_challenge_methods_supported.includes('S256'));
for (const scope of ['workbench:read', 'workbench:write']) {
  assert.ok(discovery.scopes_supported.includes(scope));
}
checks.push('Authorization discovery: correct issuer/endpoints, PKCE S256 and read/write scopes');

console.log(JSON.stringify({ base, checks }, null, 2));
