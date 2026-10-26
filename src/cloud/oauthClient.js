import * as oauth from 'oauth4webapi';
import { CloudError } from './cloudConfig.js';

export function createOAuthClient(config, fetcher = globalThis.fetch) {
  let metadata;
  const options = signal => ({ [oauth.customFetch]: (url, init) => fetcher(url, { ...init, cache: 'no-store', credentials: 'omit' }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
  async function discover(signal) {
    if (!metadata) {
      const issuer = new URL(config.issuer);
      const response = await oauth.discoveryRequest(issuer, { algorithm: 'oauth2', ...options(signal) });
      const candidate = await oauth.processDiscoveryResponse(issuer, response);
      for (const field of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint', 'revocation_endpoint']) {
        if (candidate[field] && new URL(candidate[field]).origin !== issuer.origin) throw new CloudError('configuration', '云端授权地址与配置不一致，已停止连接。');
      }
      metadata = candidate;
    }
    return metadata;
  }
  const client = id => ({ client_id: id, token_endpoint_auth_method: 'none' });
  return {
    async register(signal) {
      const as = await discover(signal);
      const response = await fetcher(as.registration_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', credentials: 'omit', signal: options(signal).signal,
        body: JSON.stringify({ client_name: '个人工作台网页（只读）', redirect_uris: [config.redirectUri], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: config.scope }) });
      if (!response.ok) throw new CloudError('configuration', '网页连接初始化失败，请稍后重试。');
      const result = await response.json();
      if (typeof result.client_id !== 'string' || result.client_secret) throw new CloudError('configuration', '云端没有返回公共客户端，已停止连接。');
      return result.client_id;
    },
    async authorize(clientId, state, verifier, signal) {
      const as = await discover(signal);
      const url = new URL(as.authorization_endpoint);
      url.search = new URLSearchParams({ client_id: clientId, redirect_uri: config.redirectUri, response_type: 'code', resource: config.issuer,
        scope: config.scope, state, code_challenge: await oauth.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256' }).toString();
      return url.href;
    },
    async exchange(clientId, callback, state, verifier, signal) {
      const as = await discover(signal);
      const params = oauth.validateAuthResponse(as, client(clientId), new URL(callback), state);
      const response = await oauth.authorizationCodeGrantRequest(as, client(clientId), oauth.None(), params, config.redirectUri, verifier, { ...options(signal), additionalParameters: { resource: config.issuer } });
      return oauth.processAuthorizationCodeResponse(as, client(clientId), response);
    },
    async refresh(clientId, refreshToken, signal) {
      const as = await discover(signal);
      const response = await oauth.refreshTokenGrantRequest(as, client(clientId), oauth.None(), refreshToken, { ...options(signal), additionalParameters: { resource: config.issuer } });
      return oauth.processRefreshTokenResponse(as, client(clientId), response);
    },
    async revoke(clientId, token) {
      const as = await discover();
      const response = await oauth.revocationRequest(as, client(clientId), oauth.None(), token, { ...options(), additionalParameters: { token_type_hint: 'refresh_token' } });
      return oauth.processRevocationResponse(response);
    },
  };
}
