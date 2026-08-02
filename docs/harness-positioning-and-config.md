# Delivery Workflow Harness 定位与配置模型

## 一句话定位

Delivery Workflow 是团队交付 Harness，不是 AI IDE。

- AI IDE / Codex / Claude Code 负责编码现场：边聊边改、定位代码、多轮调整。
- Delivery Workflow 负责交付控制：阶段边界、检查点、状态账本、人工确认和知识沉淀。

## 边界原则

- 不复刻 Windsurf / Cursor / Codex 的聊天编码体验。
- 不把每轮 AI 对话都沉淀为正式文件。
- 文件只承载跨阶段复用、人工确认、团队沉淀所需的检查点。
- 过程日志、prompt 和多轮调整记录默认隐藏在 `.workflow/runs/`。

## 三层配置模型

### 1. 团队默认配置

团队维护一个公共 git 仓库，只存相对路径和逻辑应用名。

```text
team-ai-config/
  profiles/default.json
  apps/app-index.json
  rules/
  skills/
  knowledge/
```

### 2. 本机接入配置

每个人只配置自己的根目录映射。

```json
{
  "teamConfigRoot": "D:\\code\\team-ai-config",
  "repoRoot": "D:\\code\\work-project",
  "teamProfile": "default"
}
```

### 3. 需求 Workspace 快照

新建 workspace 时，系统把团队相对配置解析为本机可执行路径，写入 `.workflow/workspace.json`。

```json
{
  "profile": {
    "name": "default",
    "inherited": true
  },
  "skills": [
    "D:\\code\\team-ai-config\\skills\\api-doc-generation"
  ],
  "apps": [
    {
      "name": "yl-jms-spm-core-export-api",
      "sourcePath": "D:\\code\\work-project\\yl-jms-spm-core-export-api",
      "worktreePath": "apps/yl-jms-spm-core-export-api"
    }
  ]
}
```

## 推广目标

- 首次用户只需要配置 `teamConfigRoot` 和 `repoRoot`。
- 新需求默认继承团队 profile。
- 需求级页面只让用户选择涉及应用和补充说明。
- 高级 skills / rules 手工追加入口默认折叠。

## 2026-07-21 产品壳调整决策

本轮原型调整后，Delivery Workflow Console 的产品壳按 Harness 职责重新组织，不再把页面做成普通后台配置平台。

左侧主导航保留五个职责入口：

| 入口 | 职责 |
| --- | --- |
| 启动配置 | 检查项目目录、执行器、知识库、业务上下文、外部文档是否具备启动条件。 |
| 上下文装配 | 管理 PRD、需求材料、知识库来源、应用索引和本次补充材料，形成 CLI handoff 输入。 |
| 执行器管理 | 管理 Codex、Claude、IDE 和后续可插拔 CLI，保持低接入成本。 |
| 交付编排 | 承载阶段推进、当前动作、CLI handoff 和回收。 |
| 产物验收 | 展示产物、运行记录、验收状态和后续回流证据。 |

项目目录不再作为主导航项。它是当前需求上下文，固定放在左侧底部，只承担选择、切换和打开当前 workspace 的职责。

启动配置主面板采用 readiness dashboard：

- 项目目录
- 执行器
- 知识库
- 业务上下文
- 外部文档

每个启动条件都需要展示 `已就绪 / 待处理` 状态、当前配置摘要和下一步动作。用户进入页面后应先知道“这个 Harness 能不能开始组织交付”，再进入具体流程。

配置中心不再作为长滚动表单，而是按配置域拆分：

- 启动：项目目录和基础运行路径。
- 执行器：Codex、Claude、IDE。
- 知识库：团队能力、领域白皮书、应用索引和后续索引能力。
- 业务上下文：业务代码仓库、候选应用和实现范围。
- 外部文档：飞书、Lark 和其他文档源。

## 下一步：需求级知识库

当前判断：知识库不应只作为全局配置。全局配置可以提供默认知识源，但真正参与交付的知识库应该跟随每个需求 workspace 走。

下一步优先支持需求级知识库配置：

- 在单个需求 workspace 中配置知识库 Git 地址。
- 支持从 Git 地址拉取或更新本次需求知识源。
- 将命中的知识源记录为 workspace 快照，而不是直接依赖全局最新状态。
- 在 `上下文装配` 面板展示本次需求实际使用的知识源、索引状态和命中摘要。
- 在生成 handoff 时，按阶段选择相关知识注入给 CLI。
- 交付结束后，将可复用内容写入 `delivery/knowledge-improvement.md`，由人工确认后再回流公共知识库。

推荐先按一个真实需求完整跑通：

1. 创建需求 workspace。
2. 配置本次需求知识库 Git 地址。
3. 导入 PRD 和补充材料。
4. 装配上下文并生成技术方案。
5. 交给 CLI 执行一段真实流程。
6. 回收产物和知识改进建议。

跑完一条完整需求后，再决定知识库能力是继续保持 workspace 级配置，还是抽象成团队默认 + 需求覆盖的双层模型。
