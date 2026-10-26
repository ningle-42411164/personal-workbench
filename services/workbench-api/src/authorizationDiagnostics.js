import { publicError } from './errors.js';

// 只将锁定的 1.2.4 库中已知错误映射成枚举。绝不输出原始 description、URL、cookie 或凭证。
const categories = new Map([
  ['client_id is required', 'client_missing'], ['Invalid client_id', 'client_unknown'],
  ['Invalid redirect URI', 'redirect_mismatch'],
  ['Authorization request was sent to an unconfigured endpoint', 'endpoint_mismatch'],
  ['response_type is required', 'response_type_missing'],
  ['Missing state parameter', 'state_missing'], ['Missing transaction handle', 'transaction_missing'],
  ['This authorization was not started in this browser; start again', 'browser_binding_missing'],
  ['This authorization belongs to a different browser session; start again', 'browser_binding_mismatch'],
  ['This authorization expired or was already used; start again', 'transaction_expired_or_used'],
  ['Approved scopes must be ones this server supports', 'scope_unsupported'],
]);
export function authorizationDiagnostic(error, stage) {
  const category = error?.name === 'AuthorizationError'
    ? categories.get(error.description) ?? ({ invalid_target: 'resource_invalid', invalid_scope: 'scope_invalid', unsupported_response_type: 'response_type_unsupported', unauthorized_client: 'client_response_type', invalid_request: 'request_invalid' }[error.code] ?? 'oauth_validation')
    : error?.code === 'OWNER_ONLY' ? 'owner_rejected' : error?.code === 'PKCE_REQUIRED' ? 'pkce_required' : error?.code === 'INVALID_SCOPE' ? 'scope_unsupported' : error?.name === 'CimdFetchError' ? 'client_metadata_unavailable' : error?.code === 'ORIGIN_REJECTED' ? 'origin_rejected' : error?.code === 'IDENTITY_REJECTED' ? 'identity_rejected' : 'service_unavailable';
  return { stage, category, correlationId: crypto.randomUUID() };
}
export async function authorizationStage(stage, operation) {
  try { return await operation(); }
  catch (error) {
    const failure = publicError(error);
    failure.diagnostic = authorizationDiagnostic(error, stage);
    // 不记录整个异常或 Request。响应中的同一非敏感编号可供用户反馈。
    console.warn(JSON.stringify({ event: 'oauth_failure', ...failure.diagnostic }));
    throw failure;
  }
}

export async function diagnoseTokenResponse(response, stage) {
  if (response.ok) return response;
  let body;
  try { body = await response.clone().json(); } catch { return response; }
  const allowed = new Set(['invalid_grant', 'invalid_client', 'invalid_request', 'invalid_scope', 'invalid_target', 'unauthorized_client', 'unsupported_grant_type']);
  const diagnostic = { stage, category: allowed.has(body.error) ? body.error : 'token_rejected', correlationId: crypto.randomUUID() };
  console.warn(JSON.stringify({ event: 'oauth_failure', ...diagnostic }));
  return Response.json({ ...body, diagnostic }, { status: response.status, headers: response.headers });
}
