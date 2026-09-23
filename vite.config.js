import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [vue(), VitePWA({
    registerType: 'prompt',
    manifest: {
      name: '我的个人工作台', short_name: '工作台', lang: 'zh-CN',
      start_url: '/', display: 'standalone', background_color: '#f5f4ef', theme_color: '#244d43',
      icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png}'] },
  })],
});
