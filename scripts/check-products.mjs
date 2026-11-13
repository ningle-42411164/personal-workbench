import fs from 'node:fs';import assert from 'node:assert/strict';
const root='dist',cloud=JSON.parse(fs.readFileSync(root+'/manifest.webmanifest')),offline=JSON.parse(fs.readFileSync(root+'/offline/manifest.webmanifest'));
assert.notEqual(cloud.id,offline.id);assert.ok(!offline.scope.startsWith(cloud.scope));
const code=fs.readdirSync(root+'/offline/assets').filter(x=>x.endsWith('.js')).map(x=>fs.readFileSync(root+'/offline/assets/'+x,'utf8')).join('');
for(const forbidden of ['workers.dev','personal-workbench.cloud-auth.v1','personal-workbench.local-sync.v1','oauth2/authorize'])assert.ok(!code.includes(forbidden),forbidden);
for(const key of ['personal-workbench.offline.data.v1','personal-workbench.offline.reminder-shown.v1','personal-workbench.offline.tag-rules.v1','personal-workbench.offline.theme.v1','personal-workbench.offline.splash.enabled.v1','personal-workbench.offline.splash.seen.v1','personal-workbench.offline.changed.v1'])assert.ok(code.includes(key),key);
for(const dir of [root,root+'/offline']){const sw=fs.readFileSync(dir+'/sw.js','utf8');assert.ok(sw.includes('launch-splash.webp'));assert.ok(!sw.includes('cleanupOutdatedCaches()'));}
console.log('双版本产物、存储键、SW范围与云模块排除检查通过');
