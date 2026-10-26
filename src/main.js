import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { prepareCloudCallback, startCloudConnection } from './cloud/useCloudWorkbench.js';

// 授权返回参数先从地址栏清除；连接恢复在后台进行，不阻塞本机功能和启动偏好。
const cloudCallback = prepareCloudCallback();
// 在 index.html 的 #app 中挂载根组件；之后界面由 Vue 根据响应式数据生成。
createApp(App).mount('#app');
startCloudConnection(cloudCallback);
