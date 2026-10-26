// 只有公开地址和可申请的权限；GitHub Client ID/secret 继续只存在于 Worker secrets。
export const CLOUD_CONFIG = Object.freeze({
  issuer: 'https://personal-workbench-api-test.personal-workbench-ningle-test.workers.dev',
  redirectUri: 'https://ningle-42411164.github.io/personal-workbench/',
  scope: 'workbench:read offline_access',
  writeScope: 'workbench:read workbench:write offline_access',
  accessTokenSeconds: 3600,
  grantLifetimeMs: 30 * 24 * 60 * 60 * 1000,
  transactionLifetimeMs: 10 * 60 * 1000,
});

export class CloudError extends Error {
  constructor(kind, message) { super(message); this.name = 'CloudError'; this.kind = kind; }
}

export function connectionError(error) {
  if (error instanceof CloudError) return error;
  return new CloudError('network', '无法连接云端。已有内容可能已过期，请联网后重新读取。');
}
