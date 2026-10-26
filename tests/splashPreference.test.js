import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { SPLASH_ENABLED_KEY, readSplashEnabled, writeSplashEnabled } from '../src/data/splashPreference.js';

function memoryStorage(initial = []) {
  const values = new Map(initial);
  return {
    values,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

test('启动偏好：未设置时默认开启，读取不主动写入或清理数据', () => {
  const storage = memoryStorage();
  assert.equal(readSplashEnabled(storage), true);
  assert.equal(storage.values.size, 0);
});

test('启动偏好：仅明确的 false 关闭，非法配置按 true 处理', () => {
  for (const value of ['true', '', 'invalid', '{bad', 'null', '0', '"false"', '{}', '[]']) {
    assert.equal(readSplashEnabled(memoryStorage([[SPLASH_ENABLED_KEY, value]])), true, value);
  }
  assert.equal(readSplashEnabled(memoryStorage([[SPLASH_ENABLED_KEY, 'false']])), false);
});

test('启动偏好：读取异常不会阻塞页面', () => {
  assert.equal(readSplashEnabled({ getItem() { throw new Error('禁止读取'); } }), true);
});

test('启动偏好：开启和关闭跨重新读取保留，事项及会话键不受影响', () => {
  const storage = memoryStorage([
    ['personal-workbench.data.v2', '{"schemaVersion":2,"items":[]}'],
    ['personal-workbench.splash.seen.v1', '1'],
  ]);
  const original = new Map(storage.values);
  for (const enabled of [false, true, false]) {
    writeSplashEnabled(enabled, storage);
    assert.equal(storage.getItem(SPLASH_ENABLED_KEY), JSON.stringify(enabled));
    // 重新读取使用持久化的值，不依赖上一个 Vue 实例中的 ref。
    assert.equal(readSplashEnabled(storage), enabled);
  }
  for (const [key, value] of original) assert.equal(storage.getItem(key), value);
  assert.equal(storage.values.size, original.size + 1);
});

test('启动偏好：写入失败向调用方报告，不覆盖之前的偏好', () => {
  const storage = memoryStorage([[SPLASH_ENABLED_KEY, 'true']]);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => writeSplashEnabled(false, storage), /QuotaExceededError/);
  assert.equal(readSplashEnabled(storage), true);
});

// 执行实际 index.html 的提前初始化，模拟浏览器解析到 body 前的状态，不读取真实浏览器数据。
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function boot(storage, seen = false, sessionFails = false) {
  let pending = true;
  runInNewContext(bootScript, {
    localStorage: storage,
    sessionStorage: { getItem() { if (sessionFails) throw new Error('会话存储不可用'); return seen ? '1' : null; } },
    document: { documentElement: { classList: { remove(name) { if (name === 'splash-pending') pending = false; } } } },
  });
  return pending;
}

test('静态启动层：关闭时首帧取消遮罩，不依赖会话是否看过动画', () => {
  const storage = memoryStorage([[SPLASH_ENABLED_KEY, 'false']]);
  assert.equal(boot(storage), false);
  assert.equal(boot(storage, true), false);
  assert.equal(boot(storage, false, true), false);
});

test('静态启动层：默认、开启和非法值继续遵循原会话规则', () => {
  for (const value of [null, 'true', 'invalid', '{bad', '"false"']) {
    const storage = memoryStorage(value === null ? [] : [[SPLASH_ENABLED_KEY, value]]);
    assert.equal(boot(storage), true);
    assert.equal(boot(storage, true), false);
  }
});

test('静态启动层：偏好读取失败仍执行原会话判断，不抛出启动异常', () => {
  const storage = { getItem() { throw new Error('读取被拒绝'); } };
  assert.equal(boot(storage), true);
  assert.equal(boot(storage, true), false);
  assert.equal(boot(storage, false, true), true);
});
