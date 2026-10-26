import { CLOUD_CONFIG } from './cloudConfig.js';

// 当前华为 Edge 桌面入口的授权弹出上下文不回传绑定 cookie。
// 在普通浏览器首次授权，再由同源加密保险库恢复；不绕过服务端 cookie/PKCE/所有者校验。
export function needsBrowserConnection(surface = globalThis.window, navigator = globalThis.navigator) {
  return Boolean(surface?.matchMedia?.('(display-mode: standalone)').matches || surface?.matchMedia?.('(display-mode: fullscreen)').matches || navigator?.standalone === true);
}
export const browserConnectionUrl = CLOUD_CONFIG.redirectUri;
