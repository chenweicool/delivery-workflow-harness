# Delivery Workflow

Delivery Workflow 是一个目录原生、模型无关的 AI 辅助软件交付控制台。它围绕 PRD、Domain Harness 上下文、交付证据、质量门禁和人工确认组织需求 Workspace。

它不是 AI IDE，也不是聊天管理器。研发人员仍可在 Workspace 中使用自己的 Codex、Claude Code、IDE 或其他 AI 工具推进交付。

## 安装、运行与卸载

无需安装即可试用：

```bash
npx delivery-workflow-harness start
```

推荐全局安装，以使用简短的 `dw` 命令：

```bash
npm install -g delivery-workflow-harness
dw start
```

该命令默认在后台启动本地控制台，通常访问地址为：

```text
http://127.0.0.1:3040
```

卸载前请先停止本地控制台，然后执行 npm 的全局卸载命令：

```bash
dw stop
npm uninstall -g delivery-workflow-harness
```

如果通过 `npx` 使用，则无需卸载；它不会安装为全局命令。

## 常用命令

```bash
dw start
dw stop
dw restart
dw status
dw logs
dw update --check
dw update
dw domain inspect --root <domain-harness-path>
dw domain attach --workspace <path> --root <domain-harness-path>
dw init <demand-name> --owner <name> --demand-url <url> [--context <text>] [--domain <source>]
dw prd import <file-or-directory> --workspace <path>
dw status --workspace <path>
dw next --workspace <path>
dw gate check --workspace <path>
dw gate approve <gate-id> --workspace <path> --note "..."
dw gate reject <gate-id> --workspace <path> --note "..."
```

`delivery-workflow` 是完整命令名，`dw` 是日常使用的简写。

本地开发时可使用前台模式：

```bash
dw start --foreground
```

新用户可参阅[快速开始](docs/quick-start.md)。

## 更新

控制台启动后会检查新版本；发现更新时，左下角“检查更新”会显示红点。点击后仍需确认，安装完成后执行：

```bash
dw restart
```

也可在命令行完成同一操作：

```bash
dw update --check
dw update
dw restart
```

请勿将更新设为静默后台计划任务，以免运行中的本地控制台被替换。

## 本地开发

```bash
cd delivery-workflow-harness
npm run check
npm run test:regression
npm run start
```

本地控制台源代码位于 `console/`，Workspace 模板位于 `templates/`。

## 产品模型

```text
PRD + 补充上下文 + 当前代码 + 可选 Domain Harness / 团队策略
  -> 需求 Workspace
  -> 研发人员使用 Codex / Claude / IDE 实施
  -> 交付证据 + 人工质量门禁
  -> 交付总结与知识更新提案
```

npm 包仅包含通用的流程机制和示例。团队专属资产应存放在独立的私有 Git 仓库中。

## Domain Harness 挂载

Domain Harness 不是创建 Workspace 的必选项。没有 Harness 时，Workflow 仍会使用 `context/demand-context.md`、PRD、人工确认和当前代码推进；后续可再挂载一个主 Domain Harness 和多个只读参考 Harness。每个来源可以是本地目录或 Git 地址。远程来源只会被克隆到当前 Workspace 的 `context/domain-sources/`；Workflow 会把版本、代码入口和来源记录到 `context/domain-summary.md` 和 `.workflow/domain.lock.json`，不会修改原始 Harness 或其源仓库。

```bash
# 不依赖 Harness，直接提供需求与补充上下文
dw init <demand-name> --owner <负责人> --demand-url <需求链接> --context "业务背景、约束和关注点"

# 创建时按需挂载 Harness
dw init <demand-name> --domain <local-harness> --domain <reference-harness-git-url> --owner <负责人> --demand-url <需求链接>
# 也可在初始化后挂载
dw domain attach --workspace <workspace-path> --root <domain-harness-path>
```

Agent 应将 PRD 和人工确认视为目标行为，将当前代码视为当前行为来源，将 Domain Harness 材料视为领域背景和风险证据；有冲突时必须记录并交由人工确认。

## 质量门禁

每个 Workspace 都包含 `.workflow/quality-policy.yaml`，用于定义需求确认、技术方案就绪和交付验证所需的证据。`dw gate check` 会将可审计状态写入 `.workflow/gates.json`；仅证据齐备的门禁才能被批准。

技术方案阶段会冻结 `design/unit-test-design.md`，测试用例必须以表格记录。冒烟用例不由 Workflow 设计：研发需在提测前提供 `review/evidence/smoke-test-case.md`，QA 将执行结果记录到 `review/evidence/smoke-test-result.md`。

## Workspace 产物结构

```text
prd/document.md                    解析后的 PRD
prd/source/                        原始 PRD 材料
context/demand-context.md          创建时填写的本需求补充上下文
context/domain-summary.md          可选领域 Harness 快照；未挂载时明确降级来源
design/*.md                        已确认的设计与测试基线
design/process/                    上下文、确认与修订记录
design/approvals/                  检查点记录
tasks/task-list.md                 已确认的任务计划
tasks/process/                     任务确认与执行进度
review/quality-report.md           独立评审结论
review/evidence/                   测试、冒烟、风险和追溯证据
review/process/                    变更日志与自检
archive/                           知识提案和案例卡片
.workflow/                         命令、锁文件与运行状态
```

技术方案检查点获批后，Workflow 会生成 `context/current-context.md`。新的 Codex 或 Claude 会话通过 Workspace 指引读取它，再按链接读取已确认的设计和测试基线。Skill 保持为外部能力：Workflow 负责路由和锁定选中的 Skill，但不会硬编码团队或集成专属实现。

## PRD 导入

本地 PRD 会先复制到 `prd/source/`。内置导入器会将 Markdown、纯文本和 DOCX 规范化到 `prd/document.md`，并保留可读的 Word 表格。每个来源和解析结果都会记录到 `prd/metadata/ingestion.json`；DOCX 解析失败会以 `parse-failed` 及原因明确记录。PDF 和旧版 DOC 会被安全归档并标记为 `needs-parser`，直至后续适配器或 Agent 产出规范化 Markdown。

详细架构和连接器模型见[控制台重构方案](docs/control-plane-refactor-plan.md)。

## 公开 npm 发布

该包发布到公开 npm registry。用户无需 npm 账号，可直接运行已发布的 `latest` 版本：

```bash
npx -y delivery-workflow-harness@latest start
```

仓库有两条自动化发布相关流程：

- Dependabot 每周为 npm 依赖和 GitHub Actions 更新创建 PR；它不会自动合并或发布。
- 推送名为 `v<package-version>` 的 Git tag 后，将运行检查并发布 npm 包；稳定版使用 `latest`，预发布版使用 `beta`。

发布限制、仓库维护位置与启用清单见[npm 发布与维护](docs/npm-release-and-maintenance.md)。

启用发布工作流前，请为该 GitHub 仓库和 `Publish npm package` 工作流配置 npm **Trusted Publishing**。它使用 GitHub 的短期 OIDC 身份验证；请勿将 npm token 或 `.npmrc` 凭据提交到仓库。

发布时先提交目标版本，然后创建并推送同版本的注释 tag：

```bash
npm version prerelease --preid beta
git push origin main --follow-tags

# beta 验证通过后：
npm version 0.2.0
git push origin main --follow-tags
```

npm 已发布版本不可覆盖。若工作流失败，请修复问题、创建新版本并为新版本打 tag；不要尝试重新发布同一版本。

## 当前状态

项目处于 v1 试运行阶段，适用于已有代码与测试基线的小型真实需求。首个完整交付的需求应成为白皮书案例，并经知识 Owner 审核后更新到 Git。
