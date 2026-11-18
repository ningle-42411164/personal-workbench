import {PUBLIC_CONFIG} from './config.js';
// 共享同步 HTTP 客户端需要错误类型与默认地址；缺配置时给不可路由占位，不使用私人地址。
export const CLOUD_CONFIG = Object.freeze({issuer:PUBLIC_CONFIG.apiUrl || 'https://public-workbench.invalid'});
export class CloudError extends Error { constructor(kind,message){super(message);this.name='CloudError';this.kind=kind;} }
export function connectionError(error){return error instanceof CloudError ? error : new CloudError('network','公开云连接暂不可用，本机内容与待上传修改保留。');}
