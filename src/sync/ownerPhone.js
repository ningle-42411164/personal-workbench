export const NODE_ONE_VERSION = '2026.10.26.1';
export const PHONE_ENROLLMENT_VERSION = 1;
const productionOrigin = 'https://ningle-42411164.github.io';

// 首次纳入仅从手机的正式站点读取本机数据；桌面、小屏窗口、localhost 预览都不自动成为来源。
// 这是避免误操作的设备门控，不是安全身份认证；身份与权限仍由现有 OAuth/Worker 校验。
// 不采集高熵设备信息，也不把用户代理或设备指纹上传。
export function isOwnerPhoneTarget(location = globalThis.location, navigator = globalThis.navigator) {
  if (location?.origin !== productionOrigin || !location?.pathname?.startsWith('/personal-workbench/')) return false;
  const ua = navigator?.userAgent ?? '';
  if (/Windows NT|Macintosh|CrOS|X11/i.test(ua) || !(navigator?.maxTouchPoints > 0)) return false;
  const mobilePlatform = /Android|HarmonyOS|OpenHarmony|iPhone|iPod/i.test(ua);
  const mobileSignal = navigator?.userAgentData?.mobile === true || /Mobile|iPhone|iPod/i.test(ua);
  return mobilePlatform && mobileSignal;
}

// 后台运行前复用已有连接；首次网络失败后下一轮仍会重试，不把本机编辑绑在登录请求上。
export async function prepareOwnerPhoneSync(store, auth) {
  const current = await store.read();
  if (!store.ownerPhone) return current;
  const connection = auth.getStatus();
  if ((current.enabled || !current.nodeOne) && connection.remembered && connection.state !== 'connected') await auth.getAccessToken();
  const latest = auth.getStatus();
  return store.activateOwnerPhone(latest.state === 'connected' && latest.canWrite === true);
}
