# npm 发布与定时维护

## 当前状态

仓库已经包含发布和定时维护配置，但**当前公司电脑不具备 npm 发布权限**。

- 不在公司电脑执行 `npm login`、`npm publish` 或配置 npm 写入令牌。
- 不提交 `.npmrc`、npm token、2FA 恢复码或任何发布凭据。
- 在 npm Trusted Publisher 尚未配置完成前，不推送 `v*` 发布标签；标签会触发发布工作流，但发布步骤会因没有授权而失败。

因此，目前可安全使用的能力只有本地开发、CI 校验和 npm 包消费；正式发布需要由拥有 npm 包管理权限的负责人完成一次外部配置后才启用。

## 仓库内维护点

| 目的 | 维护位置 | 触发方式 | 自动行为 |
| --- | --- | --- | --- |
| 依赖巡检 | `.github/dependabot.yml` | 每周一北京时间 02:00 / 02:15 | 创建依赖升级 PR，不自动合并 |
| 发布 npm 包 | `.github/workflows/publish-npm.yml` | 推送 `v<package-version>` 标签 | 检查通过后发布；稳定版为 `latest`，预发布为 `beta` |
| 用户升级 | 用户电脑 | 用户主动执行 | `npm update -g delivery-workflow-harness` 后重启 |

定时任务只负责发现和提交升级建议。它们不自动合并 PR、不自动创建版本、不自动推送发布标签，也不自动发布 npm。

## 后续启用发布的前置条件

由 npm 包的 Owner 在 npmjs.com 的包设置中配置 Trusted Publisher：

1. 选择 **GitHub Actions**。
2. 填写 GitHub 用户/组织 `chenweicool`。
3. 填写仓库 `delivery-workflow-harness`。
4. 工作流文件名填写 `publish-npm.yml`（只填写文件名）。
5. Environment 填写 `npm`。
6. Allowed action 勾选 `npm publish`。

该配置使用 GitHub OIDC 短期身份完成发布，不需要在 GitHub Secret、公司电脑或仓库中保存 npm token。仓库中的发布工作流已申请 `id-token: write`，并使用 Node 24，符合此发布方式的运行要求。

完成外部配置后，可在 GitHub 的 `npm` Environment 上设置审批人，要求正式发布在人工批准后继续执行。

## 发布操作

发布操作必须在干净工作树、`main` 已包含待发布代码且 CI 通过的前提下进行。

预发布示例：

```bash
npm version prerelease --preid beta
git push origin main --follow-tags
```

正式发布示例（将版本明确升级至目标稳定版本）：

```bash
npm version 0.2.0
git push origin main --follow-tags
```

标签版本必须等于 `package.json` 的版本；否则发布工作流会拒绝发布。npm 已发布版本不可覆盖，发布失败时应修复问题、创建新版本并重新打标签。

## 用户侧升级

用户可直接运行最新版：

```bash
npx -y delivery-workflow-harness@latest start
```

已全局安装的用户可在完成当前工作后升级：

```bash
npm update -g delivery-workflow-harness
dw restart
```

不要在用户电脑上把升级命令设为静默的计划任务，以免在本地控制台运行期间替换程序。需要推广版本时，由发布公告或应用内提示引导用户在合适时机主动升级。

## 领域知识边界

Domain Harness、团队 Skill 和白皮书不随通用 npm 包发布。Workflow 仅生成知识更新提案，仍需知识 Owner 通过正常 Git/GitLab 审查后提交、推送和合并；定时维护任务不得绕过此流程。
