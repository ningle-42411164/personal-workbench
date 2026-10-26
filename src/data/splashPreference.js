export const SPLASH_ENABLED_KEY = 'personal-workbench.splash.enabled.v1';

// 用户偏好用 LocalStorage 跨刷新/重新打开保留，和“本会话是否看过”的 sessionStorage 分开。
// 只有明确保存的 false 才关闭；未设置、非法值或无法读取都默认开启，保持旧用户的原行为。
export function readSplashEnabled(storage) {
  try {//(storage ?? localStorage)的意思是如果storage存在就用storage，否则就用localStorage
    return (storage ?? localStorage).getItem(SPLASH_ENABLED_KEY) !== 'false';//getItem返回的是字符串，如果是'false'就返回false，否则返回true
  } catch {
    return true;
  }
}
//enabled是用户想要的状态,storage是可选的存储对象，如果没有传入就使用localStorage
//JSON.stringify(enabled)是将enabled转换为字符串存储在localStorage中
export function writeSplashEnabled(enabled, storage) {
  (storage ?? localStorage).setItem(SPLASH_ENABLED_KEY, JSON.stringify(enabled));
}
