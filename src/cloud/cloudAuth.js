import { CLOUD_CONFIG, CloudError, connectionError } from './cloudConfig.js';
import { createCredentialVault } from './credentialVault.js';
import { createOAuthClient } from './oauthClient.js';

const interrupted = () => new DOMException('连接操作已取消', 'AbortError');

// 这是一个所有者的浏览器连接，不是注册、用户表或账号管理系统。
export function createCloudAuth({ config = CLOUD_CONFIG, vault = createCredentialVault(), client = createOAuthClient(config), now = Date.now, cryptography = globalThis.crypto } = {}) {
  let access;
  let generation = 0;
  let controller = new AbortController();
  let renewing;
  let status = { state: 'checking', message: '正在检查已保存的连接。', remembered: false };
  const listeners = new Set();
  function publish(state, message, remembered = status.remembered) {
    status = { state, message, remembered, canWrite: state === 'connected' && access?.canWrite === true }; listeners.forEach(listener => listener(status));
  }
  function cancel() { generation++; controller.abort(); controller = new AbortController(); access = undefined; }
  function ensureCurrent(start) { if (start !== generation) throw interrupted(); }
  async function accept(result, saved, revision, start) {
    ensureCurrent(start);
    // 旧的 1A 会话没有 scope 时按只读处理；续期不能把只读连接升级为写入。
    const scope = result.scope ?? saved.scope ?? config.scope;
    const scopes = scope.split(' ');
    if (!result.access_token || !result.refresh_token || !scopes.includes('workbench:read') ||
        scopes.some(value => !['workbench:read', 'workbench:write', 'offline_access'].includes(value)) ||
        (scopes.includes('workbench:write') && !(saved.scope ?? config.scope).includes('workbench:write'))) {
      throw new CloudError('configuration', '云端返回的权限与本次授权不符，请重新授权。');
    }
    const session = { ...saved, scope, refreshToken: result.refresh_token };
    if (!await vault.put('session', session, revision)) throw interrupted();
    ensureCurrent(start);
    if (await vault.revision() !== revision) throw interrupted();
    access = { token: result.access_token, clientId: session.clientId, scope: session.scope, grantExpiresAt: session.grantExpiresAt, canWrite: scopes.includes('workbench:write'), expiresAt: now() + Math.min(Number(result.expires_in) || config.accessTokenSeconds, config.accessTokenSeconds) * 1000, revision };
    publish('connected', `${access.canWrite ? '云端测试读写' : '只读'}连接已恢复；本机事项仍独立保存。`, true);
    return access.token;
  }
  function failed(error) {
    if (error?.name === 'AbortError') return;
    const failure = connectionError(error);
    publish(failure.kind === 'network' ? 'offline' : 'error', failure.message);
  }
  async function restore(force = false) {
    if (!force && access && access.expiresAt > now() + 30000 && await vault.revision() === access.revision) {
      // 普通浏览器可能刚完成了权限升级。不能继续使用桌面窗口缓存的一小时只读令牌。
      const saved = await vault.get('session');
      if (saved?.clientId === access.clientId && saved.scope === access.scope && saved.grantExpiresAt === access.grantExpiresAt) return access.token;
    }
    if (renewing) return renewing;
    const start = generation;
    const signal = controller.signal;
    const operation = vault.withLock(async () => {
      ensureCurrent(start);
      const revision = await vault.revision();
      const saved = await vault.get('session');
      ensureCurrent(start);
      if (!saved) { publish('disconnected', '本机功能无需登录；连接后可读取云端测试数据。', false); return null; }
      if (saved.grantExpiresAt <= now()) {
        await vault.clearSession(); access = undefined;
        publish('expired', '保存的连接已到期，请重新授权。', false); return null;
      }
      publish('checking', '正在安全恢复连接。', true);
      try {
        const result = await client.refresh(saved.clientId, saved.refreshToken, signal);
        return await accept(result, saved, revision, start);
      } catch (error) {
        ensureCurrent(start);
        if (['invalid_grant', 'invalid_client', 'invalid_token'].includes(error?.error)) {
          await vault.clearSession();
          if (error.error === 'invalid_client') await vault.remove(saved.scope?.includes('workbench:write') ? 'client-write' : 'client');
          access = undefined; publish('expired', '连接已失效或被撤销，请重新授权。', false); return null;
        }
        throw error;
      }
    });
    renewing = operation;
    try { return await operation; }
    catch (error) { ensureCurrent(start); failed(error); throw connectionError(error); }
    finally { if (renewing === operation) renewing = undefined; }
  }
  async function login({ write = false } = {}) {
    cancel();
    const start = generation;
    const signal = controller.signal;
    publish('authorizing', '正在准备授权；请在浏览器中完成 GitHub 身份验证。');
    try {
      return await vault.withLock(async () => {
        const revision = await vault.revision();
        const scope = write ? config.writeScope : config.scope;
        const clientKey = write ? 'client-write' : 'client';
        let registration = await vault.get(clientKey);
        // 每个浏览器/PWA 一个公共客户端，避免重新登录撤销另一设备的授权。
        if (!registration) {
          registration = { clientId: await client.register(signal, scope) };
          ensureCurrent(start);
          if (!await vault.put(clientKey, registration, revision)) throw interrupted();
        }
        const state = cryptography.randomUUID();
        const verifier = cryptography.randomUUID() + cryptography.randomUUID();
        const transaction = { clientId: registration.clientId, scope, state, verifier, expiresAt: now() + config.transactionLifetimeMs, revision };
        const url = await client.authorize(transaction.clientId, state, verifier, signal, scope);
        ensureCurrent(start);
        if (!await vault.put('transaction', transaction, revision)) throw interrupted();
        return url;
      });
    } catch (error) { ensureCurrent(start); failed(error); throw connectionError(error); }
  }
  async function finish(callback) {
    const start = generation;
    const signal = controller.signal;
    publish('checking', '正在完成授权。');
    try {
      return await vault.withLock(async () => {
        const transaction = await vault.get('transaction');
        // 一次性消费：错误、取消、过期或成功都不能自动循环换码。
        await vault.remove('transaction');
        const url = new URL(callback);
        if (!transaction || transaction.expiresAt <= now()) throw new CloudError('expired', '授权事务已过期或不在当前浏览上下文，请点击登录重新授权。');
        if (url.origin + url.pathname !== config.redirectUri || url.searchParams.get('state') !== transaction.state ||
            (url.searchParams.has('iss') && url.searchParams.get('iss') !== config.issuer)) throw new CloudError('callback', '授权返回校验失败，未建立连接。请重新登录。');
        if (url.searchParams.has('error')) throw new CloudError('cancelled', '授权已取消，本机功能仍可使用。');
        if (!url.searchParams.get('code')) throw new CloudError('callback', '授权返回缺少有效结果，请重新登录。');
        const result = await client.exchange(transaction.clientId, callback, transaction.state, transaction.verifier, signal);
        const previous = await vault.get('session');
        const token = await accept(result, { clientId: transaction.clientId, scope: transaction.scope ?? config.scope, grantExpiresAt: now() + config.grantLifetimeMs }, transaction.revision, start);
        // 新的独立写客户端成功后，尽力撤销被替换的只读授权；取消升级不丢原连接。
        if (previous && previous.clientId !== transaction.clientId) {
          try { await client.revoke(previous.clientId, previous.refreshToken); } catch { /* 本机已只保存新会话，旧授权最长按原期限失效。 */ }
        }
        return token;
      });
    } catch (error) {
      ensureCurrent(start);
      const failure = error instanceof CloudError ? error : new CloudError('callback', '授权未能完成，请检查网络后重新登录。');
      publish(failure.kind === 'expired' ? 'expired' : 'error', failure.message);
      throw failure;
    }
  }
  async function logout() {
    cancel(); renewing = undefined;
    const start = generation;
    publish('signingout', '正在清除本机连接。', false);
    let saved;
    await vault.withLock(async () => { saved = await vault.get('session'); await vault.clearSession(); });
    // 本机退出先落盘；远程撤销不成功时也不能在下次打开自动恢复旧连接。
    let revoked = !saved;
    if (saved) { try { await client.revoke(saved.clientId, saved.refreshToken); revoked = true; } catch {} }
    const message = revoked ? '已退出云端连接；本机事项和 ChatGPT 的独立连接保留。' : '本机已退出；网络不可用，服务端撤销未确认。';
    if (start !== generation) return { revoked, message, obsolete: true };
    publish('disconnected', message, false);
    return { revoked, message };
  }
  return {
    login, finish, restore, logout, getAccessToken: restore,
    getStatus: () => status,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    invalidate() { cancel(); renewing = undefined; publish('disconnected', '连接已在另一个窗口退出。', false); },
  };
}

// 只移除 OAuth 参数，保留其他页面查询；在挂载和任何授权网络请求前执行。
export function captureOAuthCallback(location, history, redirectUri = CLOUD_CONFIG.redirectUri) {
  const url = new URL(location.href);
  if (!['code', 'error', 'state', 'iss'].some(key => url.searchParams.has(key))) return null;
  const captured = url.href;
  for (const key of ['code', 'state', 'iss', 'error', 'error_description', 'error_uri']) url.searchParams.delete(key);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  return new URL(captured).origin + new URL(captured).pathname === redirectUri ? captured : 'invalid-callback';
}
