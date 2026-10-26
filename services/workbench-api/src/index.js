import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { D1Store } from './store.js';
import { WorkbenchService, READ_SCOPE, WRITE_SCOPE } from './service.js';
import { handleApi, json } from './http.js';
import { handleAuthorization } from './authorization.js';
import { ApiError, publicError } from './errors.js';
import { diagnoseTokenResponse } from './authorizationDiagnostics.js';

export function validateConfig(env) {
  let base;
  try { base = new URL(env.PUBLIC_BASE_URL); } catch { return false; }
  return base.protocol === 'https:' && base.origin === env.PUBLIC_BASE_URL &&
    !base.hostname.endsWith('.invalid') && /^\d+$/.test(env.OWNER_GITHUB_ID ?? '') &&
    Boolean(env.DB && env.OAUTH_KV && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

async function boundedRequest(request) {
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 65536) { await reader.cancel(); throw new ApiError(413, 'TOO_LARGE', '请求内容过大。'); }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return new Request(request, { body });
}

function withHeaders(response, origin, allowCors) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  // 授权表单需保留同源 Origin；尊重它的 same-origin 策略，其余响应仍不发送 referrer。
  if (!headers.has('Referrer-Policy')) headers.set('Referrer-Policy', 'no-referrer');
  if (allowCors && origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.append('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id');
    headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Session-Id');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      const ready = validateConfig(env);
      return json({ service: 'personal-workbench', ready }, ready ? 200 : 503);
    }
    if (!validateConfig(env)) return json({ code: 'NOT_CONFIGURED', message: '服务尚未完成部署配置。' }, 503);
    const origin = request.headers.get('origin');
    const allowed = new Set([env.PUBLIC_BASE_URL, 'https://chatgpt.com', env.FRONTEND_ORIGIN].filter(Boolean));
    if (url.origin !== env.PUBLIC_BASE_URL || (origin && !allowed.has(origin))) {
      return json({ code: 'ORIGIN_REJECTED', message: '请求来源不受支持。' }, 403);
    }
    if (request.method === 'OPTIONS') return withHeaders(new Response(null, { status: 204 }), origin, true);
    try {
      const provider = new OAuthProvider({
        apiRoute: ['/mcp', '/api/'],
        apiHandler: {
          async fetch(protectedRequest, protectedEnv, protectedCtx) {
            const id = protectedCtx.props?.userId;
            if (id !== String(protectedEnv.OWNER_GITHUB_ID)) return json({ code: 'OWNER_ONLY', message: '此工作台仅允许所有者使用。' }, 403);
            const principal = { id, scopes: protectedCtx.auth?.scope ?? [] };
            const service = new WorkbenchService(new D1Store(protectedEnv.DB, id), principal);
            return handleApi(protectedRequest, service, protectedEnv.PUBLIC_BASE_URL);
          },
        },
        defaultHandler: { fetch: handleAuthorization },
        authorizeEndpoint: '/authorize', tokenEndpoint: '/oauth/token', clientRegistrationEndpoint: '/oauth/register',
        scopesSupported: [READ_SCOPE, WRITE_SCOPE, 'offline_access'], requiredScopes: [READ_SCOPE],
        accessTokenTTL: 3600, refreshTokenTTL: 2592000,
        // MCP 和网页 API 属于同一受保护服务，audience 覆盖整个服务而非仅 /mcp。
        resourceMetadata: { resource: env.PUBLIC_BASE_URL, authorization_servers: [env.PUBLIC_BASE_URL] },
        clientIdMetadataDocumentEnabled: true,
      });
      const bounded = await boundedRequest(request);
      let stage;
      if (url.pathname === '/oauth/token' && request.method === 'POST') {
        const grant = new URLSearchParams(await bounded.clone().text()).get('grant_type');
        stage = grant === 'authorization_code' ? 'code_exchange' : grant === 'refresh_token' ? 'token_refresh' : 'token_request';
      }
      let response = await provider.fetch(bounded, env, ctx);
      if (stage) response = await diagnoseTokenResponse(response, stage);
      return withHeaders(response, origin, true);
    } catch (error) {
      const failure = publicError(error);
      return withHeaders(json({ code: failure.code, message: failure.message, ...(failure.diagnostic ? { diagnostic: failure.diagnostic } : {}) }, failure.status), origin, true);
    }
  },
};
