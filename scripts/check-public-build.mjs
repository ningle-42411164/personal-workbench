// 构建产物级别的边界检查；不会启动浏览器或访问私人云。
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root='dist/public';const info=JSON.parse(fs.readFileSync(path.join(root,'release-info.json')));
assert.equal(info.product,'public');assert.equal(info.version,'3.0.0');assert.equal(info.status,'development');assert.equal(info.release,false);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest')));
for(const key of ['id','scope','start_url'])assert.equal(manifest[key],'/personal-workbench-public/');
const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isDirectory())walk(f);else if(/\.(js|html)$/.test(f))files.push(f);}}walk(root);
const contents=files.map(file=>fs.readFileSync(file,'utf8')).join('\n');
assert.equal(contents.includes('personal-workbench-api-test.personal-workbench-ningle-test.workers.dev'),false,'公开包不能包含私人Worker地址');
assert.equal(contents.includes('OWNER_GITHUB_ID'),false);assert.equal(contents.includes('x-test-user'),false);
assert.ok(contents.includes('personal-workbench.public.'));assert.ok(contents.includes('workbench-public-v3'));
assert.equal(fs.readFileSync(path.join(root,'sw.js'),'utf8').includes('assets/clerk-'),false,'匿名首次缓存不能预先获取Clerk动态模块');
console.log('公开开发构建：版本、独立PWA/存储及私人服务地址隔离检查通过。');
