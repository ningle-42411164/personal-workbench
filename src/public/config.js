// 公开版只认显式公开配置；从不回退到私人 Worker 或所有者授权。
export function publicConfig(env = import.meta.env ?? {}) {
  let apiUrl = '', key = String(env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '');
  try {
    const url = new URL(String(env.VITE_PUBLIC_API_URL ?? ''));
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol === 'https:' || local && url.protocol === 'http:') && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash && !url.hostname.includes('personal-workbench-api-test')) apiUrl = url.origin;
  } catch { /* 未配置时仍完整提供本机使用。 */ }
  const ready = Boolean(apiUrl && /^pk_(test|live)_[A-Za-z0-9_+/-]+={0,2}$/.test(key));
  return Object.freeze({ apiUrl, publishableKey: key, ready, mcpUrl: apiUrl ? apiUrl + '/mcp' : '', message: ready ? '' : '云功能暂不可用；仍可在本机记录和导出备份。' });
}
export const PUBLIC_CONFIG = publicConfig();
