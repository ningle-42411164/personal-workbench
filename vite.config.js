import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [vue(), VitePWA({
    registerType: 'prompt',
    includeManifestIcons: false,
    manifest: {
      name: '我的个人工作台',
      short_name: '工作台',
      lang: 'zh-CN',
      start_url: '/',
      display: 'standalone',
      background_color: '#f5f4ef',
      theme_color: '#244d43',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png}'] },
  })],
});
