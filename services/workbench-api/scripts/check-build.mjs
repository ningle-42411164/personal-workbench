import { build } from 'esbuild';

// 只在本机打包；不调用部署命令、不连接 Cloudflare，不读取任何云账号凭证。
await build({
  entryPoints: ['src/index.js'], outfile: '.build/index.js', bundle: true, format: 'esm',
  platform: 'neutral', conditions: ['workerd', 'worker', 'browser'], mainFields: ['browser', 'module', 'main'],
  external: ['cloudflare:*', 'node:*'], target: 'es2022', logLevel: 'info',
});
