import { CloudError } from './cloudConfig.js';

const DB_NAME = 'personal-workbench.cloud-auth.v1';
const STORE = 'credentials';

// 独立 IndexedDB 保存加密的续期凭据；不会访问本机事项和动画偏好的 LocalStorage。
// 非导出密钥能减少静态明文暴露，但不能防御同源恶意脚本，不能把它称作 HttpOnly。
export function createCredentialVault({ indexedDB = globalThis.indexedDB, cryptography = globalThis.crypto, name = DB_NAME } = {}) {
  let opening;
  async function open() {
    if (!indexedDB || !cryptography?.subtle) throw new CloudError('storage', '浏览器不支持安全保存连接；本机功能仍可使用。');
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => reject(new CloudError('storage', '无法打开连接存储，请检查浏览器设置。'));
      request.onblocked = () => reject(new CloudError('storage', '连接存储被其他窗口占用，请关闭旧窗口后重试。'));
    }).catch(error => { opening = undefined; throw error; });
    return opening;
  }
  async function readRaw(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new CloudError('storage', '连接存储读取失败。'));
    });
  }
  async function updateRaw(key, change) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      let next;
      const request = store.get(key);
      request.onsuccess = () => { next = change(request.result); next === undefined ? store.delete(key) : store.put(next, key); };
      tx.oncomplete = () => resolve(next);
      tx.onerror = tx.onabort = () => reject(new CloudError('storage', '连接存储写入失败，未确认保存。'));
    });
  }
  async function encryptionKey() {
    const existing = await readRaw('key');
    if (existing) return existing;
    const generated = await cryptography.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return updateRaw('key', value => value ?? generated);
  }
  async function encode(value) {
    const key = await encryptionKey();
    const iv = cryptography.getRandomValues(new Uint8Array(12));
    const cipher = await cryptography.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)));
    return { iv, cipher };
  }
  async function get(key) {
    const record = await readRaw(key);
    if (!record) return null;
    try {
      const bytes = await cryptography.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, await encryptionKey(), record.cipher);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch { throw new CloudError('storage', '保存的连接无法解密，请退出连接后重新授权。'); }
  }
  async function put(key, value, expectedRevision) {
    const encoded = await encode(value);
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      let saved = false;
      const revision = store.get('revision');
      revision.onsuccess = () => {
        if (expectedRevision === undefined || (revision.result ?? 0) === expectedRevision) { store.put(encoded, key); saved = true; }
      };
      tx.oncomplete = () => resolve(saved);
      tx.onerror = tx.onabort = () => reject(new CloudError('storage', '连接保存失败，请重新连接。'));
    });
  }
  async function clearSession() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const revision = store.get('revision');
      revision.onsuccess = () => {
        store.put((revision.result ?? 0) + 1, 'revision');
        store.delete('session'); store.delete('transaction');
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new CloudError('storage', '退出连接未能保存，请检查浏览器存储。'));
    });
  }
  // IndexedDB 的短事务租约跨标签串行化 refresh；网络请求不占用 IDB 事务。
  async function withLock(action) {
    const owner = cryptography.randomUUID();
    const deadline = Date.now() + 30000;
    while (true) {
      const lease = await updateRaw('lease', value => !value || value.until < Date.now() ? { owner, until: Date.now() + 45000 } : value);
      if (lease.owner === owner) break;
      if (Date.now() > deadline) throw new CloudError('busy', '其他窗口正在恢复连接，请稍后重试。');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    try { return await action(); }
    finally { await updateRaw('lease', value => value?.owner === owner ? undefined : value); }
  }
  return { get, put, clearSession, withLock, revision: async () => (await readRaw('revision')) ?? 0, remove: key => updateRaw(key, () => undefined) };
}
