import { ApiError } from './errors.js';
import { READ_SCOPE, WRITE_SCOPE } from './service.js';
import { authorizationStage } from './authorizationDiagnostics.js';

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function redirect(to, headers) {
  const result = new Headers(headers);
  result.set('Location', to);
  result.set('Cache-Control', 'no-store');
  return new Response(null, { status: 302, headers: result });
}

export async function readGithubIdentity(code, env, fetcher = fetch) {
  const tokenResponse = await fetcher('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
      code, redirect_uri: `${env.PUBLIC_BASE_URL}/auth/github/callback` }),
  });
  if (!tokenResponse.ok) throw new ApiError(502, 'IDENTITY_UNAVAILABLE', 'GitHub 身份验证暂时不可用。');
  const token = await tokenResponse.json();
  if (typeof token.access_token !== 'string' || !token.access_token) throw new ApiError(401, 'IDENTITY_REJECTED', 'GitHub 授权未成功。');
  // GitHub 令牌只用于核实身份，不保存、不传给 MCP 客户端，也不申请 repo scope。
  const userResponse = await fetcher('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'personal-workbench' },
  });
  if (!userResponse.ok) throw new ApiError(502, 'IDENTITY_UNAVAILABLE', 'GitHub 身份验证暂时不可用。');
  const user = await userResponse.json();
  if (String(user.id) !== String(env.OWNER_GITHUB_ID)) throw new ApiError(403, 'OWNER_ONLY', '此工作台仅允许所有者使用。');
  return { userId: String(user.id) };
}

export async function handleAuthorization(request, env) {
  const url = new URL(request.url);
  const oauth = env.OAUTH_PROVIDER;
  if (url.pathname === '/authorize' && request.method === 'GET') {
    const authRequest = await authorizationStage('authorize_parse', () => oauth.parseAuthRequest(request));
    if (!authRequest.codeChallenge || authRequest.codeChallengeMethod !== 'S256') throw new ApiError(400, 'PKCE_REQUIRED', '授权必须使用 PKCE S256。');
    if (!authRequest.scope.includes(READ_SCOPE) || authRequest.scope.some(scope => ![READ_SCOPE, WRITE_SCOPE, 'offline_access'].includes(scope))) {
      throw new ApiError(400, 'INVALID_SCOPE', '授权范围不受支持。');
    }
    const description = await authorizationStage('authorize_describe', () => oauth.describeConsent(authRequest));
    const consent = await authorizationStage('consent_begin', () => oauth.beginConsent(authRequest));
    const headers = new Headers(consent.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Cache-Control', 'no-store');
    // Chromium 也检查表单的 302 跳转链；只允许本服务、GitHub 和已验证客户端的回调 origin。
    const callbackOrigin = new URL(authRequest.redirectUri).origin;
    headers.set('Content-Security-Policy', `default-src 'none'; form-action 'self' https://github.com ${callbackOrigin}; frame-ancestors 'none'; base-uri 'none'`);
    // no-referrer 会让浏览器的表单 POST 携带 Origin:null，误触发严格来源检查。
    // same-origin 保留本服务表单的来源，但不向 GitHub 等其他 origin 发送 referrer。
    headers.set('Referrer-Policy', 'same-origin');
    const permissions = description.scope.map(scope => `<li>${escapeHtml(scope)}</li>`).join('');
    return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>授权个人工作台</title><main><h1>授权个人工作台</h1><p>应用：${escapeHtml(description.clientName)}</p><p>应用域名：${escapeHtml(description.clientDomain ?? '未验证，名称由应用自行填写')}</p><p>返回位置：${escapeHtml(description.redirectHost)}</p>${description.redirectIsLoopback ? '<p>返回位置是本机程序，请确认它由你启动。</p>' : ''}<p>请求权限：</p><ul>${permissions}</ul><p>只有工作台所有者能够完成接下来的 GitHub 身份验证；不会授予仓库访问权限。</p><form method="post" action="/authorize/decision"><input type="hidden" name="handle" value="${escapeHtml(consent.handle)}"><button name="decision" value="allow">允许并验证身份</button><button name="decision" value="deny">拒绝</button></form></main></html>`, { headers });
  }
  if (url.pathname === '/authorize/decision' && request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin !== env.PUBLIC_BASE_URL) throw new ApiError(403, 'ORIGIN_REJECTED', '授权表单来源不正确。');
    const form = await request.formData();
    const handle = form.get('handle');
    if (typeof handle !== 'string' || handle.length > 2048) throw new ApiError(400, 'INVALID_CONSENT', '授权请求无效。');
    if (form.get('decision') === 'deny') {
      const denied = await authorizationStage('consent_deny', () => oauth.denyConsent(request, handle));
      return redirect(denied.redirectTo, denied.headers);
    }
    if (form.get('decision') !== 'allow') throw new ApiError(400, 'INVALID_CONSENT', '请选择允许或拒绝。');
    const approved = await authorizationStage('consent_approve', () => oauth.approveConsent(request, handle));
    const upstream = await authorizationStage('github_begin', () => oauth.beginUpstream(approved.request, { headers: approved.headers }));
    const github = new URL('https://github.com/login/oauth/authorize');
    github.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, state: upstream.state,
      redirect_uri: `${env.PUBLIC_BASE_URL}/auth/github/callback`, scope: 'read:user' }).toString();
    return redirect(github, upstream.headers);
  }
  if (url.pathname === '/auth/github/callback' && request.method === 'GET') {
    // 库验证浏览器绑定的 state 并一次性消费，不能用 query 中的 userId 代替身份校验。
    const resumed = await authorizationStage('github_return', () => oauth.finishUpstream(request));
    if (url.searchParams.has('error')) throw new ApiError(401, 'IDENTITY_REJECTED', 'GitHub 授权已取消。');
    const code = url.searchParams.get('code');
    if (!code || code.length > 1024) throw new ApiError(400, 'IDENTITY_REJECTED', '缺少有效的身份授权码。');
    const identity = await authorizationStage('github_identity', () => readGithubIdentity(code, env));
    const completed = await authorizationStage('code_issue', () => oauth.completeAuthorization({ request: resumed.request, userId: identity.userId,
      metadata: { source: 'github' }, scope: resumed.request.scope, props: identity }));
    return redirect(completed.redirectTo, resumed.headers);
  }
  return new Response('Not found', { status: 404 });
}
