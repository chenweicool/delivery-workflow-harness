# Delivery Workflow 快速开始

这份文档用于新同学本地试用 Delivery Workflow。

## 1. 启动控制台

使用已发布的 npm 包：

```bash
npx delivery-workflow-harness start
```

也可以全局安装后使用短命令：

```bash
npm i -g delivery-workflow-harness
dw start
```

`dw start` 默认以后台服务方式启动本地控制台。终端关闭后，服务仍会继续运行。

随时重新打开页面：

```bash
dw open
```

查看服务状态：

```bash
dw status
```

停止或重启：

```bash
dw stop
dw restart
```

查看日志：

```bash
dw logs
```

如果是在源码目录中验证：

```bash
cd delivery-workflow
node bin/delivery-workflow.js start --no-open
node bin/delivery-workflow.js status
node bin/delivery-workflow.js open
```

如果要在本机源码中验证 `dw` 短命令：

```bash
cd delivery-workflow
npm link
dw status
```

## 2. 首次配置

打开控制台后，只需要配置常用路径：

- 本地 AI 工具：Codex 和 / 或 Claude Code
- 工作区默认目录
- 团队能力库目录
- 白皮书 Git 目录：包含领域白皮书、功能 Index、应用 Index 和案例
- 业务代码根目录
- 可选的默认 skills 目录

`app-index.json`、扩展集成 JSON 等高级项可以先不配置。

## 3. 创建或打开工作区

在页面中：

1. 创建一个需求工作区。
2. 从左侧工作区列表进入该工作区。
3. 点击“补充材料与上下文”。
4. 添加 PRD 文件或文档链接；飞书链接需要先“读取到本地”，产出可读的 `prd/document.md`。
5. 输入功能关键词，从白皮书候选项中确认主功能点；未匹配时应作为知识缺口记录，不应假装已有白皮书覆盖。
6. 从应用 Index 中选择候选应用；优先使用本地代码。仅在本地不存在且已明确确认时，拉取配置的远程 Git 缓存。
7. 用自然语言补充本次范围、风险、验收关注点和暂不处理内容。

这些输入会保存到工作区，后续会作为角色 Agent 的上下文。

## 4. 交给角色 Agent

页面面向用户展示的是角色 Agent，而不是简单的 Codex / Claude 按钮：

- 需求分析 Agent
- 技术方案 Agent
- 编码实现 Agent
- Review Agent
- 测试 Agent
- 归档 Agent

Codex / Claude Code 是这些 Agent 背后的执行器。

点击“交给 Agent”后，Delivery Workflow 会生成：

```text
.workflow/handoff/current.md
```

然后打开或恢复 Codex / Claude Code，并把当前工作区、阶段、上下文、约束和必须产出的文件一起交给 AI。

## 5. 从 AI 回到页面

用户可以在 Codex / Claude Code 中多轮沟通，但 Agent 完成时必须产出结构化文件，并执行：

```bash
dw done --workspace <workspace-path> --step <step-id> --summary "ready for review"
dw open --workspace <workspace-path> --step <return-step-id>
```

页面会检测完成标记，并展示需要人工验收的产物。

核心原则：

```text
聊天结论不是交付证据。
Agent 写回的结构化文件才是交付证据。
```

## 6. 常用命令

服务生命周期：

```bash
dw start
dw stop
dw restart
dw status
dw logs
dw open
```

工作区和流程：

```bash
dw init <demand-name>
dw status --workspace <path>
dw next --workspace <path>
dw handoff --workspace <path> --step <step-id>
dw done --workspace <path> --step <step-id> --summary "ready for review"
dw function match <keyword>
dw context resolve --workspace <path> --function <function-id>
dw app fetch --workspace <path> --app <application-id>
dw archive propose --workspace <path>
```

诊断和配置：

```bash
dw doctor
dw config
```

## 7. 当前边界

Delivery Workflow 是需求组织者和交付 Harness，不替代 Codex / Claude Code。

它负责定义：

- 当前应该由哪个 Agent 工作
- Agent 接收哪些上下文
- Agent 必须产出哪些文件
- 哪些节点需要人工确认
- 页面如何进入下一个阶段

## 8. 白皮书、质量与归档

白皮书不是让用户逐项选择 skills 的配置页。用户负责提供 PRD、确认功能点、选择涉及应用和补充本次背景；系统根据白皮书自动带入风险、关联应用和推荐能力，并在每次交接时写入快照。

质量阶段应至少回写：

```text
review/quality-report.md
review/evidence/unit-test-plan.md
review/evidence/unit-test-result.md
review/evidence/risk-list.md
.workflow/quality-summary.json
```

归档阶段生成案例卡和知识更新提案：

```text
archive/knowledge-card.md
archive/knowledge-update-proposal.json
archive/knowledge-patch.md
```

知识负责人审核提案后，在白皮书 Git 仓库中自行创建分支、提交和合并请求。工具不会自动提交或合并白皮书。

## 9. 后续计划

待完善能力：

- Git 集成：展示分支、worktree、diff 摘要、变更文件和提交就绪状态。
- Agent 执行器配置：不同角色 Agent 可以绑定不同 Codex / Claude Code 配置。
- 带上下文跳转：打开 Codex / Claude Code 时带上当前工作区、Agent、步骤、候选应用和必须产出的文件。
- 团队应用索引 schema：统一维护应用元数据，避免直接扫描业务代码根目录。
- 扩展集成 schema：运维平台、个人平台 token、数据库元数据、发布平台、归档目标、质量服务等。
