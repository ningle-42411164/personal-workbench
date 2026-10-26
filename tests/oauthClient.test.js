import test from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthClient } from '../src/cloud/oauthClient.js';
import { CLOUD_CONFIG } from '../src/cloud/cloudConfig.js';

const metadata = {
  issuer: CLOUD_CONFIG.issuer,
  authorization_endpoint: CLOUD_CONFIG.issuer + '/authorize',
  token_endpoint: CLOUD_CONFIG.issuer + '/oauth/token',
  registration_endpoint: CLOUD_CONFIG.issuer + '/oauth/register',
  revocation_endpoint: CLOUD_CONFIG.issuer + '/oauth/token',
  authorization_response_iss_parameter_supported: true,
  token_endpoint_auth_methods_supported: ['none'],
  code_challenge_methods_supported: ['S256'],
};

test('真实 OAuth 库走公共客户端、PKCE、读取与续期、撤销；无 client secret', async () => {
  const requests = [];
  const fetcher = async (url, init = {}) => {
    const parsed = new URL(url);
    requests.push({ path: parsed.pathname, init });
    if (parsed.pathname === '/.well-known/oauth-authorization-server') return Response.json(metadata);
    if (parsed.pathname === '/oauth/register') {
      const data = JSON.parse(init.body);
      assert.equal(data.token_endpoint_auth_method, 'none');
      assert.deepEqual(data.redirect_uris, [CLOUD_CONFIG.redirectUri]);
      assert.equal(data.scope, 'workbench:read offline_access');
      return Response.json({ client_id: 'fake-public-client' }, { status: 201 });
    }
    const body = new URLSearchParams(init.body);
    assert.equal(body.get('client_id'), 'fake-public-client');
    assert.equal(body.has('client_secret'), false);
    if (body.has('token')) return new Response(null, { status: 200 });
    assert.equal(body.get('resource'), CLOUD_CONFIG.issuer);
    if (body.get('grant_type') === 'authorization_code') assert.equal(body.get('code_verifier'), 'a'.repeat(64));
    else assert.equal(body.get('refresh_token'), 'fake-refresh');
    return Response.json({ token_type: 'Bearer', access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 3600, scope: CLOUD_CONFIG.scope });
  };
  const client = createOAuthClient(CLOUD_CONFIG, fetcher);
  const id = await client.register();
  const authorize = new URL(await client.authorize(id, 'fake-state', 'a'.repeat(64)));
  assert.equal(authorize.searchParams.get('scope'), CLOUD_CONFIG.scope);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  const callback = new URL(CLOUD_CONFIG.redirectUri);
  callback.search = new URLSearchParams({ code: 'fake-code', state: 'fake-state', iss: CLOUD_CONFIG.issuer }).toString();
  assert.equal((await client.exchange(id, callback.href, 'fake-state', 'a'.repeat(64))).access_token, 'fake-access');
  assert.equal((await client.refresh(id, 'fake-refresh')).access_token, 'fake-access');
  await client.revoke(id, 'fake-refresh');
  assert.ok(requests.every(({ init }) => init.credentials === 'omit'));
  assert.equal(requests.filter(({ path }) => path === '/.well-known/oauth-authorization-server').length, 1);
});

test('错误 issuer 或跨站 token endpoint 不会被用于发送授权结果', async () => {
  for (const change of [{ issuer: 'https://wrong.test' }, { token_endpoint: 'https://wrong.test/token' }]) {
    const client = createOAuthClient(CLOUD_CONFIG, async () => Response.json({ ...metadata, ...change }));
    await assert.rejects(client.authorize('fake-client', 'fake-state', 'a'.repeat(64)));
  }
});

test('明确增加写权限时，公共客户端注册与 PKCE 授权使用同一范围', async () => {
  let registered;
  const client = createOAuthClient(CLOUD_CONFIG, async (url, init) => {
    if (new URL(url).pathname === '/.well-known/oauth-authorization-server') return Response.json(metadata);
    registered = JSON.parse(init.body);
    return Response.json({ client_id: 'fake-write-client' }, { status: 201 });
  });
  const id = await client.register(undefined, CLOUD_CONFIG.writeScope);
  const url = new URL(await client.authorize(id, 'fake-state', 'a'.repeat(64), undefined, CLOUD_CONFIG.writeScope));
  assert.equal(registered.scope, CLOUD_CONFIG.writeScope);
  assert.match(registered.client_name, /测试读写/);
  assert.equal(url.searchParams.get('scope'), registered.scope);
  assert.equal(registered.token_endpoint_auth_method, 'none');
  assert.equal(Object.hasOwn(registered, 'client_secret'), false);
});
