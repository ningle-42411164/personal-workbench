import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import products from './release/products.json' with {type:'json'};
import vue from '@vitejs/plugin-vue';
import {VitePWA} from 'vite-plugin-pwa';
const local=p=>fileURLToPath(new URL(p,import.meta.url));
export default defineConfig(({mode})=>{
 const offline=mode==='offline',base=products[offline?'offline':'cloud'].base;
 const alias=offline?[
 ['cloud/useCloudWorkbench.js','offline/cloud.js'],['sync/useSyncWorkbench.js','offline/useLocalWorkbench.js'],['sync/syncStore.js','offline/equal.js'],
 ...['CloudConnection','SyncSettings','SyncSymbol'].map(x=>['components/'+x+'.vue','offline/Empty.vue'])
 ].map(([from,to])=>({find:new RegExp('(?:\\.\\./|\\./)'+from.replaceAll('.','\\.')+'$'),replacement:local('./src/'+to)})):[];
 return {base,resolve:{alias},build:{outDir:offline?'dist/offline':'dist'},plugins:[
 {name:'product-storage',enforce:'pre',transform(code,id){if(offline&&id.replaceAll('\\','/').includes('/src/')&&!id.includes('/cloud/')&&!id.includes('/offline/'))return code.replaceAll('personal-workbench.','personal-workbench.offline.');},transformIndexHtml(html){return offline?html.replaceAll('personal-workbench.','personal-workbench.offline.'):html;}},
 vue(),VitePWA({registerType:'prompt',includeManifestIcons:false,
 manifest:{name:offline?'个人工作台 · 脱机版':'我的个人工作台',short_name:offline?'脱机工作台':'工作台',lang:'zh-CN',id:base,start_url:base,scope:base,display:'standalone',background_color:'#f5f4ef',theme_color:'#244d43',icons:[
 {src:base+'pwa-192x192.png',sizes:'192x192',type:'image/png',purpose:'any'},
 {src:base+'pwa-512x512.png',sizes:'512x512',type:'image/png',purpose:'any'},
 {src:base+'pwa-maskable-512x512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]},
 workbox:{cacheId:offline?'workbench-offline':'workbench-cloud',globPatterns:['**/*.{js,css,html,svg,png,webp}'],globIgnores:['offline/**'],navigateFallbackDenylist:offline?[]:[/^\/personal-workbench\/offline(?:\/|$)/],cleanupOutdatedCaches:false}
 })]};
});
