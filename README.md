# Personal Workbench

本机优先的个人工作台，整合待办、项目、标签与日期提醒，支持数据备份及可选云同步。

## 两个产品

| 产品 | 版本 | 入口 | 云功能 |
|---|---|---|---|
| 含云版 | 2.1.1 | https://ningle-42411164.github.io/personal-workbench/ | 既有所有者授权、同步及 MCP |
| 独立脱机版 | 1.1.1 | https://ningle-42411164.github.io/personal-workbench-offline/ | 不含云授权、令牌恢复或业务云请求 |

正式发布状态与对应提交以各产品 Release 为准。两版共享主要业务源码；脱机站点仓库只接收静态发行物。

两版均保留待办、随笔、等待中、购物、娱乐／创作、项目、日常持续、重要日、标签规则、排序、置顶、收藏、项目历史、主题与本机字体、搜索、操作提示、日期提醒和备份。等待提醒按本机自然日提前一天同 ID 转入待办；横幅确认与一小时冷却仅存本机，完成后恢复不重启提醒。

## 下载

[查看中文更新日志与历史版本](docs/version-history.md)：按版本查看新增功能、修复内容和对应提交，包含旧日期编号与早期演进记录。

- [含云版 v2.1.1 Release](https://github.com/ningle-42411164/personal-workbench/releases/tag/v2.1.1)
  - [专用源码](https://github.com/ningle-42411164/personal-workbench/releases/download/v2.1.1/personal-workbench-v2.1.1-source.zip)
  - [静态网页包](https://github.com/ningle-42411164/personal-workbench/releases/download/v2.1.1/personal-workbench-v2.1.1-web.zip)
- [脱机版 v1.1.1 Release](https://github.com/ningle-42411164/personal-workbench/releases/tag/offline-v1.1.1)
  - [专用源码](https://github.com/ningle-42411164/personal-workbench/releases/download/offline-v1.1.1/personal-workbench-offline-v1.1.1-source.zip)
  - [静态网页包](https://github.com/ningle-42411164/personal-workbench/releases/download/offline-v1.1.1/personal-workbench-offline-v1.1.1-web.zip)

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

Codex 在提交前准备 release/products.json 和 docs/version-history.md 的中文日志。发布命令不猜测或自动增加版本；Release 直接复用日志正文。

统一入口：

- node release/run.mjs --target cloud：仅含云版。
- node release/run.mjs --target offline：仅脱机版。
- node release/run.mjs --target both：两版分别发布并汇总。
- 追加 --dry-run：只展示计划，无远程写入。
- 追加 --sha 完整SHA：固定来源；默认当前提交。
- 追加 --no-wait：拿到任务链接即返回，电脑关闭不影响 Actions。

普通 Push 只运行检查，不部署、不建标签或 Release。正式发布由 Actions 接手：固定提交测试 → 所选产品构建 → 逐包验证 → 标签 → 所选站点 → Release → 无登录公开下载校验 → 中文报告。网页包与站点复用同一正式构建；源码包另外解压并默认构建验证。网页包不是安装包，部署路径见包内 DEPLOY.txt。

失败后再次执行同一 target/SHA 命令。流程会检查同一提交、产品、Node 版本及平台的 Actions 保存产物与实际远程状态，只补未完成步骤。ZIP 使用临时文件后原子改名；每份 ZIP 单独记录 SHA256，不使用 Actions 外层产物摘要代替它。已发布且下载失败时报告“已发布，下载核验未完成”，不删除 Release、不回滚正常站点。记录与包保留 30 天；过期或输入改变时不能保证跳过此前本机步骤，旧标签与附件仍禁止覆盖。

跨仓库权限只给脱机部署任务：一次性配置见 [发布授权说明](docs/release-setup.md)。不把本机 Git 凭据复制到 Actions。主仓库使用临时 GITHUB_TOKEN；独立脱机仓库需要单独的最小写入授权。

Actions Summary 和 release-state-final 产物包含中文结果、各步骤、部署和公开下载证据。未发生真实单版发布前，只把单版路径称为隔离验证。站点回滚可在 GitHub Actions 的 Rollback workbench site 中指定产品和旧标签，使用旧网页包；不需要反复 Push。

回滚代码与恢复数据是两回事：使用反向提交或重新部署此前验证的静态包，保留现有字段兼容层和数据库；不要清空浏览器存储代替回滚。数据恢复仅在使用者明确选择备份并确认覆盖后执行。

[中文更新日志与历史编号对应](docs/version-history.md)。MIT 许可证；第三方依赖遵循各自许可证。手机主要验收环境为华为 Microsoft Edge。
