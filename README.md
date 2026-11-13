# Personal Workbench

本机优先的个人工作台，整合待办、项目、标签与日期提醒，支持数据备份及可选云同步。

## 两个产品

| 产品 | 版本 | 入口 | 云功能 |
|---|---|---|---|
| 含云版 | 2.1.0 | https://ningle-42411164.github.io/personal-workbench/ | 既有所有者授权、同步及 MCP |
| 独立脱机版 | 1.1.0 | https://ningle-42411164.github.io/personal-workbench-offline/ | 不含云授权、令牌恢复或业务云请求 |

正式发布状态与对应提交以各产品 Release 为准。两版共享主要业务源码；脱机站点仓库只接收静态发行物。

两版均保留待办、随笔、等待中、购物、娱乐／创作、项目、日常持续、重要日、标签规则、排序、置顶、收藏、项目历史、主题与本机字体、搜索、操作提示、日期提醒和备份。等待提醒按本机自然日提前一天同 ID 转入待办；横幅确认与一小时冷却仅存本机，完成后恢复不重启提醒。

## 下载

[查看中文更新日志与历史版本](docs/version-history.md)：按版本查看新增功能、修复内容和对应提交，包含旧日期编号与早期演进记录。

- [含云版 v2.1.0 Release](https://github.com/ningle-42411164/personal-workbench/releases/tag/v2.1.0)
  - [专用源码](https://github.com/ningle-42411164/personal-workbench/releases/download/v2.1.0/personal-workbench-v2.1.0-source.zip)
  - [静态网页包](https://github.com/ningle-42411164/personal-workbench/releases/download/v2.1.0/personal-workbench-v2.1.0-web.zip)
- [脱机版 v1.1.0 Release](https://github.com/ningle-42411164/personal-workbench/releases/tag/offline-v1.1.0)
  - [专用源码](https://github.com/ningle-42411164/personal-workbench/releases/download/offline-v1.1.0/personal-workbench-offline-v1.1.0-source.zip)
  - [静态网页包](https://github.com/ningle-42411164/personal-workbench/releases/download/offline-v1.1.0/personal-workbench-offline-v1.1.0-web.zip)

不要把单一 Latest 当作两产品共同最新版。GitHub 自动生成的 Source code 是通用仓库归档；脱机专用源码附件默认构建脱机版。

## 构建与部署

使用 Node.js 24。源码包解压后执行 npm ci、npm run build；无需任何云凭据即可构建。通用仓库默认含云版，可明确执行 npm run build:cloud、npm run build:offline，或 npm run build:all。版本集中维护于 release/products.json；release/default-product.json 仅选择源码附件的默认产品。

含云产物 dist/ 部署在 /personal-workbench/；脱机产物 dist/offline/ 部署在 /personal-workbench-offline/。本地可执行 node scripts/serve.mjs dist 5181，在 localhost 访问相应入口。静态网页包按 DEPLOY.txt 部署；这是网页，不是 Windows 安装包，不保证双击 HTML 可完整使用。PWA 要求 HTTPS 或 localhost，首次联网等待缓存完成后再离线，更新通过应用提示接受。

含云版服务端需兼容 services/workbench-api 的严格字段和接口，并配置 Worker、OAuth 回调及所有者身份。它不是供普通朋友直接登录的多人云服务。真实部署配置不随专用源码包分发；请参考公开示例重新配置。

## 本机成就与庆祝

两版均新增五个本机成就、右下角解锁提醒、成就馆和项目完成礼炮；含云版将原云端设置移入弹窗，关闭不停止同步或清除未确认选择。成就仅统计上线后本机界面成功保存的主动完成、删除与拖动，不扫描旧记录，不统计导入、云端回流或 MCP 操作。未解锁成就只显示名称与灰色图标；减少动画模式使用静态完成反馈，无音效。

成就存档与事项在同一 IndexedDB 事务提交，但作为独立本机元数据保存，不进入云 API。两版各自保存，不自动互通。新增的成就元数据格式为 1，旧库缺少字段时按空存档读取，无需升级 IndexedDB、事项 schema、同步范围或纳入标记。

## 保存、隔离与备份

含云版沿用原 IndexedDB、LocalStorage、授权和同步纳入标记。脱机版使用独立 IndexedDB 事务，不读含云数据库；偏好、主题、标签规则、提醒冷却、会话标记及广播通道采用 offline 命名空间。两个站点使用不同 Service Worker 作用范围和缓存前缀，避免旧含云 PWA 截获脱机入口。不清除整个站点数据。

搬数据由使用者主动导出 JSON 并在另一版导入；先展示整份覆盖说明，选择有效文件后再次确认。两版不会自动复制事项或授权。数据 schema 仍为 2，应用改号不触发数据迁移、重新纳入或数据库迁移。

导出 JSON 包含本机成就及统计。新备份导入经原确认流程同时覆盖事项与成就，不合并、不重播历史提醒；旧备份没有成就字段时仅替换事项，保留当前本机成就。取消、校验或事务写入失败均保持原数据；已有同步绑定仍阻止整份覆盖。回滚代码不会恢复或清空成就，成就恢复须另行选择备份并确认。

## 验证与发布

前端 npm test；服务端目录 npm ci --ignore-scripts、npm test、npm run check。npm run build:all 构建两版。

统一双版发布入口为 `node release/run.mjs`：测试、构建、包校验、标签与 Push、两站部署、中文 Release 发布；版本及本批标题从 `release/products.json` 读取，正文来自 `release/cloud.md` 与 `release/offline.md`。重试复用已核对的附件，不移动旧标签或替换已发布包。

发布准备应在无无关修改的独立工作树进行：确定并提交代码，运行 node release/package.mjs，从实际 ZIP 解压安装和构建，核对 SOURCE.json / release-info.json 的提交及版本，再绑定两标签。node release/publish.mjs 使用 GitHub 授权上传草稿并发布；已有标签不得移动，已有同名附件必须逐字节一致，已发布附件不得覆盖。普通提交不会自动升号或创建 Release。Pages 工作流同时构建两版；脱机产物同步到独立静态站点仓库，不能删除另一版站点。

回滚代码与恢复数据是两回事：使用反向提交或重新部署此前验证的静态包，保留现有字段兼容层和数据库；不要清空浏览器存储代替回滚。数据恢复仅在使用者明确选择备份并确认覆盖后执行。

[中文更新日志与历史编号对应](docs/version-history.md)。MIT 许可证；第三方依赖遵循各自许可证。手机主要验收环境为华为 Microsoft Edge。
