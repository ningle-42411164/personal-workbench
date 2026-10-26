import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createCredentialVault } from '../src/cloud/credentialVault.js';
import { createCloudAuth, captureOAuthCallback } from '../src/cloud/cloudAuth.js';
import { createCloudController } from '../src/cloud/cloudController.js';
import { createWorkbenchApi } from '../src/cloud/workbenchApi.js';
import { CLOUD_CONFIG } from '../src/cloud/cloudConfig.js';
import { createProject } from '../src/data/workbenchData.js';

const later = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const fakeTokens = n => ({ access_token: `fake-access-${n}`, refresh_token: `fake-refresh-${n}`, expires_in: 3600, scope: 'workbench:read offline_access' });
function setup() {
  const indexedDB = new IDBFactory();
  const vault = createCredentialVault({ indexedDB });
  let clock = 100000;
  let refreshes = 0;
  const client = {
    async register() { return 'public-browser-client'; },
    async authorize(id, state) { return `https://auth.test/authorize?state=${state}`; },
    async exchange() { return fakeTokens(1); },
    async refresh() { return fakeTokens(++refreshes + 1); },
    async revoke() {},
  };
  const auth = createCloudAuth({ vault, client, now: () => clock });
  return { vault, indexedDB, client, auth, setClock(value) { clock = value; }, get refreshes() { return refreshes; } };
}
async function authorize(context) {
  await context.auth.login();
  const transaction = await context.vault.get('transaction');
  const url = new URL(CLOUD_CONFIG.redirectUri);
  url.search = new URLSearchParams({ code: 'fake-code', state: transaction.state, iss: CLOUD_CONFIG.issuer }).toString();
  await context.auth.finish(url.href);
}

test('连接保险库：加密持久化、非导出密钥、重新打开可恢复，退出版本拒绝迟到凭据', async () => {
  const s = setup();
  await authorize(s);
  const second = createCredentialVault({ indexedDB: s.indexedDB });
  assert.equal((await second.get('session')).refreshToken, 'fake-refresh-1');
  const db = await new Promise(resolve => { const request = s.indexedDB.open('personal-workbench.cloud-auth.v1'); request.onsuccess = () => resolve(request.result); });
  const records = await new Promise(resolve => { const request = db.transaction('credentials').objectStore('credentials').getAll(); request.onsuccess = () => resolve(request.result); });
  assert.ok(!JSON.stringify(records).includes('fake-refresh'));
  const key = records.find(record => record instanceof CryptoKey);
  assert.equal(key.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('raw', key));
  const revision = await s.vault.revision();
  await s.vault.clearSession();
  assert.equal(await s.vault.put('session', { refreshToken: 'fake-late' }, revision), false);
  assert.equal(await s.vault.get('session'), null);
});

test('刷新页面恢复连接并轮换续期凭据；并发读取仅续期一次，到期不循环登录', async () => {
  const s = setup(); await authorize(s);
  const again = createCloudAuth({ vault: s.vault, client: s.client, now: () => 101000 });
  const tokens = await Promise.all([again.restore(), again.restore(), again.restore()]);
  assert.equal(s.refreshes, 1); assert.ok(tokens.every(token => token === tokens[0]));
  assert.equal((await s.vault.get('session')).refreshToken, 'fake-refresh-2');
  const expired = createCloudAuth({ vault: s.vault, client: s.client, now: () => 100000 + CLOUD_CONFIG.grantLifetimeMs + 1 });
  assert.equal(await expired.restore(), null);
  assert.equal(expired.getStatus().state, 'expired');
  assert.equal(await s.vault.get('session'), null);
});

test('授权取消、错误 state、过期与重复回调都清理临时事务，不发起循环跳转', async () => {
  for (const mode of ['cancel', 'wrong-state', 'expired', 'missing-code']) {
    const s = setup(); await s.auth.login();
    const transaction = await s.vault.get('transaction');
    let exchanges = 0; s.client.exchange = async () => { exchanges++; return fakeTokens(1); };
    const url = new URL(CLOUD_CONFIG.redirectUri);
    url.searchParams.set('state', mode === 'wrong-state' ? 'fake-wrong-state' : transaction.state);
    if (mode === 'cancel') url.searchParams.set('error', 'access_denied');
    else if (mode !== 'missing-code') url.searchParams.set('code', 'fake-code');
    if (mode === 'expired') s.setClock(transaction.expiresAt + 1);
    await assert.rejects(s.auth.finish(url.href));
    assert.equal(exchanges, 0); assert.equal(await s.vault.get('transaction'), null);
    await assert.rejects(s.auth.finish(url.href));
    assert.equal(exchanges, 0);
  }
});

test('授权回调在挂载前移除敏感参数，保留非 OAuth 查询与子路径', () => {
  let clean;
  const callback = captureOAuthCallback({ href: CLOUD_CONFIG.redirectUri + '?code=fake-code&state=fake-state&iss=fake-issuer&view=test#anchor' }, { replaceState(_state, _title, url) { clean = url; } });
  assert.match(callback, /fake-code/);
  assert.equal(clean, '/personal-workbench/?view=test#anchor');
  assert.equal(captureOAuthCallback({ href: CLOUD_CONFIG.redirectUri }, {}), null);
});

test('网络续期失败保留连接，invalid_grant 清理失效凭据；退出后刷新不再恢复', async () => {
  const s = setup(); await authorize(s);
  const again = createCloudAuth({ vault: s.vault, client: s.client, now: () => 101000 });
  s.client.refresh = async () => { throw new TypeError('fake network'); };
  await assert.rejects(again.restore());
  assert.ok(await s.vault.get('session'));
  s.client.refresh = async () => { throw Object.assign(new Error('fake expired'), { error: 'invalid_grant' }); };
  assert.equal(await again.restore(), null); assert.equal(await s.vault.get('session'), null);
  const fresh = setup(); await authorize(fresh);
  fresh.client.revoke = async () => { throw new TypeError('fake offline'); };
  const logout = await fresh.auth.logout();
  assert.equal(logout.revoked, false); assert.match(logout.message, /撤销未确认/);
  assert.equal(await fresh.auth.restore(), null);
});

test('退出发生在续期中时，迟到结果不能重新保存或恢复已退出的会话', async () => {
  const s = setup(); await authorize(s);
  const wait = later(); const entered = later();
  s.client.refresh = async () => { entered.resolve(); return wait.promise; };
  const restoring = s.auth.restore(true);
  await entered.promise;
  const logout = s.auth.logout();
  wait.resolve(fakeTokens(2));
  await assert.rejects(restoring, { name: 'AbortError' });
  await logout;
  assert.equal(await s.vault.get('session'), null);
  assert.equal(s.auth.getStatus().state, 'disconnected');
});

test('旧退出的远程响应晚于新登录时，不能覆盖新的授权状态', async () => {
  const s = setup(); await authorize(s);
  const wait = later(); const entered = later();
  s.client.revoke = async () => { entered.resolve(); return wait.promise; };
  const logout = s.auth.logout();
  await entered.promise;
  await s.auth.login();
  wait.resolve();
  assert.equal((await logout).obsolete, true);
  assert.equal(s.auth.getStatus().state, 'authorizing');
});

function controllerSetup(api) {
  let subscriber;
  const status = { state: 'connected', remembered: true, message: 'fake connected' };
  const auth = { getStatus: () => status, subscribe(fn) { subscriber = fn; return () => {}; }, async restore() {}, async logout() { return { message: 'fake logged out' }; }, invalidate() { subscriber({ state: 'disconnected', remembered: false }); } };
  let clock = 10000;
  const controller = createCloudController({ auth, api, now: () => clock });
  return { controller, setClock(value) { clock = value; } };
}

test('切回本机和退出后，迟到云端响应既不切换来源也不恢复云端快照', async () => {
  for (const action of ['local', 'logout']) {
    const wait = later();
    const { controller } = controllerSetup({ listItems: () => wait.promise });
    controller.selectSource('cloud'); await tick();
    if (action === 'local') controller.selectSource('local'); else await controller.logout();
    wait.resolve([{ item: { title: 'fake late data' }, version: 1 }]); await tick();
    assert.deepEqual(controller.getState().items, []);
    if (action === 'local') assert.equal(controller.getState().source, 'local');
    controller.stop();
  }
});

test('失败保留成功快照；只有成功空响应显示空列表；手动、前台和联网读取去重', async () => {
  let calls = 0; let failure = false;
  const records = [{ item: { title: 'fake snapshot' }, version: 2 }];
  const { controller, setClock } = controllerSetup({ async listItems() { calls++; if (failure) throw new TypeError('fake offline'); return records; } });
  controller.selectSource('cloud'); await tick();
  await Promise.all([controller.refresh('auto'), controller.refresh('auto')]);
  assert.equal(calls, 1);
  controller.offline(); await controller.refresh('auto');
  assert.equal(calls, 2);
  failure = true; setClock(13000); await controller.refresh();
  assert.equal(calls, 3); assert.deepEqual(controller.getState().items, records);
  assert.equal(controller.getState().stale, true); assert.equal(controller.getState().readState, 'failed');
  controller.stop();
  let release; let inFlightCalls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const other = controllerSetup({ listItems() { inFlightCalls++; return pending; } }).controller;
  other.selectSource('cloud');
  const all = Promise.all([other.refresh(), other.refresh('auto'), other.refresh('auto')]);
  release([]); await all;
  assert.equal(inFlightCalls, 1); assert.equal(other.getState().readState, 'ready');
  assert.deepEqual(other.getState().items, []); other.stop();
});

test('只读 API 完整分页保留版本、只发送 GET，未认证最多续期一次', async () => {
  const project = createProject('虚构只读分页项目');
  const other = createProject('虚构另一页项目');
  const calls = []; let renews = 0;
  const api = createWorkbenchApi({ auth: { async getAccessToken(force) { if (force) renews++; return 'fake-access'; } }, fetcher: async (url, init) => {
    calls.push({ offset: new URL(url).searchParams.get('offset'), method: init.method ?? 'GET' });
    if (calls.length === 1) return new Response('', { status: 401 });
    return Response.json(calls.at(-1).offset === '0' ? { items: [{ item: project, version: 2 }], nextOffset: 1 } : { items: [{ item: other, version: 1 }], nextOffset: null });
  } });
  const records = await api.listItems();
  assert.equal(records.length, 2); assert.equal(records[0].version, 2);
  assert.equal(renews, 1); assert.ok(calls.every(call => call.method === 'GET'));
  assert.deepEqual(Object.keys(api).sort(), ['createTodo', 'getProject', 'listItems', 'updateProject']);
});

test('写入必须显式升级；拒绝不丢原只读会话，续期不能静默增加权限', async () => {
  const s = setup(); await authorize(s);
  assert.equal(s.auth.getStatus().canWrite, false);
  const readSession = await s.vault.get('session');
  let registrationScope, authorizationScope;
  s.client.register = async (_signal, scope) => { registrationScope = scope; return 'fake-public-write-client'; };
  s.client.authorize = async (_id, state, _verifier, _signal, scope) => { authorizationScope = scope; return `https://auth.test/?state=${state}`; };
  await s.auth.login({ write: true });
  let transaction = await s.vault.get('transaction');
  assert.equal(registrationScope, CLOUD_CONFIG.writeScope); assert.equal(authorizationScope, CLOUD_CONFIG.writeScope);
  await assert.rejects(s.auth.finish(`${CLOUD_CONFIG.redirectUri}?state=${transaction.state}&error=access_denied`));
  assert.deepEqual(await s.vault.get('session'), readSession);
  await s.auth.restore(); assert.equal(s.auth.getStatus().canWrite, false);
  s.client.refresh = async () => ({ ...fakeTokens(4), scope: CLOUD_CONFIG.writeScope });
  await assert.rejects(s.auth.restore(true));
  assert.equal(s.auth.getStatus().canWrite, false);
  await s.auth.login({ write: true }); transaction = await s.vault.get('transaction');
  s.client.exchange = async () => ({ ...fakeTokens(5), scope: CLOUD_CONFIG.writeScope });
  await s.auth.finish(`${CLOUD_CONFIG.redirectUri}?state=${transaction.state}&code=fake-code`);
  assert.equal(s.auth.getStatus().canWrite, true);
  const again = createCloudAuth({ vault: s.vault, client: s.client, now: () => 101000 });
  await again.restore(); assert.equal(again.getStatus().canWrite, true);
});

test('保存后确认读取不会复用保存前尚未完成的旧 GET', async () => {
  const oldRead = later(); let calls = 0;
  const { controller } = controllerSetup({ async listItems() { calls++; return calls === 1 ? oldRead.promise : [{ item: { title: '虚构保存后最新结果' }, version: 3 }]; } });
  controller.selectSource('cloud');
  const confirming = controller.refreshAfterWrite();
  assert.equal(calls, 1);
  oldRead.resolve([{ item: { title: '虚构保存前旧结果' }, version: 2 }]);
  await confirming;
  assert.equal(calls, 2);
  assert.equal(controller.getState().items[0].version, 3);
  controller.stop();
});
