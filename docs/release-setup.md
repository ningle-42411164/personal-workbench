# 一次性发布授权与使用

主仓库通过 GitHub Actions 自动提供的 GITHUB_TOKEN 操作本仓库；权限按任务分配为 Contents 写、Actions 读及选中的 Pages 写。普通检查只有读取权限。凭据不进入仓库、日志、ZIP 或发布记录。

独立脱机仓库不在默认 GITHUB_TOKEN 的范围内。本机 Git 的授权不会自动出现在 Actions 中，也不将它复制到工作流。

## 少步骤的仓库限定令牌

1. 在 GitHub 官方页面 https://github.com/settings/personal-access-tokens/new 创建 Fine-grained personal access token。Resource owner 选择 ningle-42411164；Repository access 选择 Only select repositories，仅选 personal-workbench-offline。
2. Repository permissions 只增加 Contents: Read and write、Pages: Read-only；Metadata 的读取由 GitHub 自动添加。有效期由所有者选择，到期只需替换同名 Secret。
3. 在主仓库官方设置页 https://github.com/ningle-42411164/personal-workbench/settings/secrets/actions 点击 New repository secret，名称 OFFLINE_PUBLISH_TOKEN。值只粘贴在 GitHub 官方 Secret 表单，不发送到聊天、不写入文件。
4. 返回实施窗口告知“已配置”即可。流程会用它访问独立仓库，真实写入成功才算跨仓库权限验证通过。

参考：https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens 和 https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions 。也可按 https://github.com/actions/create-github-app-token 使用仅安装到脱机仓库、同等权限的 GitHub App 短期令牌；本批不自动创建 App 或外部服务。

## 发布与续跑

先提交版本、中文日志和本批代码并 Push。node release/run.mjs --target cloud / offline / both 明确触发；加 --dry-run 无远程写入。任务链接与最终 Summary 是统一结果入口。本机无需持续开启，电脑断开后任务继续。

Actions 内预演后的实际发布只对所选产品创建标签、部署和发布。再次执行同一 target 与完整 SHA 会自动寻找匹配且未过期的已保存记录；已完成步骤核验后复用。失败的公共下载不会删除已发布版本。不同 SHA、目标或 Node/平台输入不能混用旧验证记录。正式流程固定 Node 24.21.0，避免平台自动升级补丁导致原批次无法续跑；未来更换构建运行时须作为显式工具变更。

普通 Push 工作流只检查。Rollback workbench site 手动工作流接收一个产品和已发布旧标签，只验证并部署对应旧网页包，不改旧标签、附件或个人数据。无需以重复 Push 重试部署。回滚也需要对应站点权限。

报告保存在 Actions Summary 与 release-state-final 产物；Actions 记录默认保留30天。工作区备份与保护哈希只在所有者本机保存，不作为公开 Actions 产物上传。

控制器与产品分别固定提交：工作流将输入 commit 检出到产品工作树，将该次工作流 github.sha 检出到独立控制器目录。恢复后仅新增控制器验证，不改已验证产品包；Actions Summary 同时列出两个提交。发布控制器修正不移动已有产品标签、不占新应用版本。

已有标签经 SHA 核对后，创建 Release 只提交 tag_name，不再提交用于创建新标签的 target_commitish。该参数在已有标签时无效，并可能因旧产品与当前分支的 workflow 差异触发额外权限检查；不以增加主仓库令牌权限解决。依据：https://docs.github.com/en/rest/releases/releases#create-a-release 。恢复记录按 run attempt 与 prepare → cloud → final 顺序选择，不假定 GitHub 产物 ID 按时间递增。
