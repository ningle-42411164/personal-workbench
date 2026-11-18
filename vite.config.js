import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import products from './release/products.json' with {type:'json'};
import publicProduct from './release/public.json' with {type:'json'};
import vue from '@vitejs/plugin-vue';
import {VitePWA} from 'vite-plugin-pwa';
const local=p=>fileURLToPath(new URL(p,import.meta.url));
export default defineConfig(({mode})=>{
 const offline=mode==='offline',publicMode=mode==='public';
 const product=publicMode?publicProduct:products[offline?'offline':'cloud'],base=product.base;
 const mappings=offline?[
  ['cloud/useCloudWorkbench.js','offline/cloud.js'],['sync/useSyncWorkbench.js','offline/useLocalWorkbench.js'],['sync/syncStore.js','offline/equal.js'],
  ...['CloudConnection','SyncSettings','SyncSymbol'].map(x=>['components/'+x+'.vue','offline/Empty.vue'])
 ]:publicMode?[
  ['cloud/useCloudWorkbench.js','public/cloud.js'],['sync/useSyncWorkbench.js','public/usePublicWorkbench.js'],
  ['cloud/cloudConfig.js','public/cloudConfig.js'],['components/CloudConnection.vue','offline/Empty.vue']
 ]:[];
 const alias=mappings.map(([from,to])=>({find:new RegExp('(?:\\.\\./|\\./)'+from.replaceAll('.','\\.')+'$'),replacement:local('./src/'+to)}));
 const namespace=publicMode?'personal-workbench.public.':offline?'personal-workbench.offline.':null;
 return {base,resolve:{alias},build:{outDir:publicMode?'dist/public':offline?'dist/offline':'dist'},plugins:[
 {name:'product-storage',enforce:'pre',transform(code,id){
  const normalized=id.replaceAll('\\','/');
  // 公开/脱机专用模块自己定义存储边界，避免二次添加前缀；共享模块按构建目标隔离。
  if(namespace&&normalized.includes('/src/')&&!normalized.includes('/offline/')&&!normalized.includes('/public/')&&(!offline||!normalized.includes('/cloud/')))return code.replaceAll('personal-workbench.',namespace);
 },transformIndexHtml(html){return namespace?html.replaceAll('personal-workbench.',namespace):html;}},
 vue(),VitePWA({registerType:'prompt',includeManifestIcons:false,
 manifest:{name:publicMode?'Personal Workbench · 公开版开发预览':offline?'个人工作台 · 脱机版':'我的个人工作台',short_name:publicMode?'公开工作台':offline?'脱机工作台':'工作台',lang:'zh-CN',id:base,start_url:base,scope:base,display:'standalone',background_color:'#f5f4ef',theme_color:'#244d43',icons:[
 {src:base+'pwa-192x192.png',sizes:'192x192',type:'image/png',purpose:'any'},
 {src:base+'pwa-512x512.png',sizes:'512x512',type:'image/png',purpose:'any'},
 {src:base+'pwa-maskable-512x512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]},
 workbox:{cacheId:publicMode?'workbench-public-v3':offline?'workbench-offline':'workbench-cloud',globPatterns:['**/*.{js,css,html,svg,png,webp}'],globIgnores:['offline/**','public/**',...(publicMode?['assets/clerk-*.js']:[])],navigateFallbackDenylist:offline||publicMode?[]:[/^\/personal-workbench\/offline(?:\/|$)/],cleanupOutdatedCaches:false}
 })]};
});
