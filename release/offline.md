产品：脱机版 1.0.0

来源提交：{{COMMIT}}

本次建立独立应用编号。两版均保留现有事项、项目历史、收藏、标签、搜索、日期提醒、主题与备份。脱机版不启动云授权或业务同步，并使用独立存储与 PWA 作用范围。

下载：
- personal-workbench-offline-v1.0.0-source.zip：专用源码；解压后 npm ci、npm run build。默认构建本产品，无需云凭据。
- personal-workbench-offline-v1.0.0-web.zip：已构建静态网页，不是 Windows 安装包，不保证双击 HTML 可完整运行。
- GitHub 自动生成的 Source code 是通用仓库归档，不能代替脱机专用源码包。

入口：https://ningle-42411164.github.io/personal-workbench-offline/

部署：按包内 DEPLOY.txt 的路径使用 HTTPS 或 localhost 静态服务；首次联网等待 PWA 缓存完成，再离线使用。接受更新提示后重新打开。含云版仅支持既有所有者服务，部署者须自行配置兼容 Worker 与 OAuth，非多人云服务。

备份：更新或搬数据前导出 JSON；导入需要确认整份覆盖。两产品不自动复制数据、授权、标签规则或提醒冷却。应用编号不改变 schema 或同步纳入标记。许可证 MIT。
