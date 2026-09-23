# 我的工作台：第一课

Vue 3 + JavaScript + Vite + PWA。此版本只练习添加任务、完成任务与本地保存。Router、Pinia和组件拆分将在后续课程加入，避免一次引入过多概念。

## 启动

安装 Node.js LTS（包含 npm）后，在本目录运行 `npm install`，然后 `npm run dev`。
构建：`npm run build`。验证离线版本：`npm run preview`，在本机通过 localhost 打开。开发模式不用于验证离线缓存。

## 文件阅读顺序

1. src/main.js：把应用放入网页。
2. src/App.vue：上半部分保存数据、定义函数，下半部分显示界面。
3. src/style.css：外观和手机布局。
4. vite.config.js：构建时生成离线缓存及安装信息。

## 离线与发布

首次使用需要联网加载完整页面，等待“页面已缓存”提示，然后刷新确认服务工作线程已控制页面。此后可断网查看、添加和完成任务。手机必须从 HTTPS 地址访问，不能用普通局域网 HTTP 地址验证 PWA。

尚未部署到 VPS，也没有云同步。浏览器可能清理本地数据；请使用导出备份。当前仅包含 SVG 图标，手机安装兼容性还需补充 PNG 图标并在真实设备验证。离线并非永不丢失数据。

## 参考

- https://github.com/vuejs/create-vue
- https://github.com/vite-pwa/vite-plugin-pwa

下一课：逐行解释输入框如何通过 v-model 保存标题，以及 addTask 如何新增任务。
