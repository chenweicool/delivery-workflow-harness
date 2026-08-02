# Delivery Workflow + Domain Harness 可落地技术方案

> 方案日期：2026-08-02
>
> 初版目标：2026-08-05（周三）完成可运行初版，并开始小组内真实需求试用
>
> 参考领域：`F:\code\harness-project\spm-harness-module-negative`
> 执行拆解：[domain-harness-workflow-wbs.md](./domain-harness-workflow-wbs.md)

## 1. 结论先行

Delivery Workflow 的产品定位调整为：

> 一个以需求 Workspace 为交付载体、以 Domain Harness 为领域上下文、以 Skills/Rules 为可插拔能力、以文件和人工检查点为协议的本地需求交付工作台。

周三初版采用以下产品决策：

1. 用户下载并启动 Delivery Workflow 后，即可在页面或命令行创建需求目录。
2. 不要求用户在 Workflow 中配置 Codex 或 Claude Code。
3. Workflow 生成自描述 Workspace；用户进入目录后直接运行自己已有的 `codex` 或 `claude`。
4. 一个需求只挂载一个领域 Harness；跨领域需求必须拆分。
5. 现有领域 Harness 目录只增不减，不迁移、不重命名已有内容。
6. `docs/domain/` 继续由既有定时任务同步产品白皮书，Workflow 禁止写入。
7. Workflow 只控制 Harness 整体流程，不内置公司 Skills、Rules 或领域业务知识。
8. 公司通用 Skills/Rules 从公共 Git 或公司 Skills 仓库挂载；领域 Skills/Rules 从当前 Domain Harness 挂载。
9. 领域 Harness 是需求澄清和技术方案的重要依据，但 PRD 是需求目标第一事实源，当前代码是技术现状第一证据源。
10. 技术方案阶段必须同步设计单元测试用例和冒烟用例；开发完成后，用冻结的前置用例反验 PRD、方案和代码。
11. 需求结束后只生成知识更新提案，人工确认后再更新领域 Harness。
12. 页面默认只暴露完成需求所需的最少操作；执行器、MCP、远端归档等进入高级能力。

本方案不以“覆盖所有应用和工具”为下周目标。试用版只要求跑通一条真实垂直链路：

```text
创建需求
  -> 挂载 negative Domain Harness
  -> 导入 PRD
  -> 加载产品和技术上下文
  -> 需求澄清
  -> 技术方案 + 单测设计 + 冒烟设计
  -> 人工确认
  -> 任务拆分与实施
  -> Review
  -> 按前置测试设计反验代码与需求
  -> 可选冒烟执行
  -> 交付总结
  -> 领域知识更新提案
```

## 2. 当前约束

### 2.1 不可改变的约束

- `spm-harness-module-negative` 已经初始化并投入团队使用。
- 现有 `.harness/`、`docs/`、`rules/`、`skills/`、`codes/`、`graphify-out/` 全部保留。
- `docs/domain/` 是产品白皮书同步目标，不改变同步路径和语义。
- `.module-manifest.yaml` 继续作为模块入口，可向后兼容地新增字段。
- 一个需求对应一个领域，领域不清时先澄清，跨领域时拆需求。
- 业务代码可以继续放在 Domain Harness 的 `codes/` 下。
- Workflow 不自动提交、推送或合并领域知识库。
- Workflow 开源仓库只保留通用流程、契约、页面和示例；公司内部能力不提交到开源仓库。
- 需求 Workspace 一级产物目录只展示正式交付文档；机器状态和中间过程材料必须下沉。

### 2.2 当前已有能力

Delivery Workflow 已经具备：

- `dw init <demand-name>` 创建 Workspace。
- Workspace 内的 `AGENTS.md`、`CLAUDE.md` 和 `.workflow/commands/`。
- PRD、需求澄清、技术设计、任务拆分、实现、Review、单测、发布和归档阶段。
- 人工确认点与进度文件。
- Skills、Rules、Knowledge 的路径挂载。
- 功能索引、应用索引和白皮书版本快照。
- 质量证据汇总和知识更新提案。
- 可选的 Codex/Claude handoff 和本地控制台。

Domain Harness 已经具备：

- 产品白皮书和技术概览。
- 领域绑定应用及本地 `codes/` 工作区。
- Analyst、Operator、Reviewer 角色 Skills。
- 工程规则和 Agent 规则。
- 需求记忆和系统影响记忆。
- Graphify 图谱。

### 2.3 当前核心缺口

目前缺少的不是更多流程节点，而是五个稳定契约：

1. Workflow 如何识别并挂载一个 Domain Harness。
2. Domain Harness 如何暴露产品、应用、代码入口、数据和 Skills。
3. Workflow 如何把这些能力组装成一次需求的冻结上下文。
4. 需求完成后，如何生成可审核的领域知识变更。
5. 如何把技术方案阶段冻结的测试设计变成开发后的独立质量门禁。

### 2.4 职责边界

| 组件 | 必须负责 | 明确不负责 |
| --- | --- | --- |
| Delivery Workflow | 阶段、状态、输入输出、人工确认、能力挂载、质量门禁、归档提案 | 公司业务知识、领域判断、AI 对话、具体代码实现 |
| Domain Harness | 产品白皮书、领域技术知识、绑定代码、现有领域 Skills/Rules、历史记忆 | 控制每个需求的阶段状态 |
| 公司能力仓库 | 通用以及领域专用 Skills、Rules、模板和工具 | 保存具体需求状态或产品白皮书 |
| Demand Workspace | 当前 PRD、冻结上下文、正式方案、代码 worktree、测试与交付证据 | 成为新的长期知识库 |
| Codex / Claude | 在 Workspace 中分析、设计、编码、测试和 Review | 决定 Workflow 状态或绕过人工确认 |

Workflow 的核心是控制面，不是知识仓库，也不是执行器。Domain Harness 和公司能力仓库是可挂载的数据面与能力面。

## 3. 用户产品形态

### 3.1 第一次使用

```powershell
npx delivery-workflow-harness start
```

打开本地页面后，用户只需要配置一个默认 Workspace 根目录。领域 Harness 不要求提前设置为全局配置，可以在创建需求时选择。公司能力仓库也可以在页面按 Git 工作目录挂载，但不是 Workflow 开源包的一部分。

可选的全局配置包括：

- 默认 Workspace 根目录。
- 最近使用的 Domain Harness。
- 默认团队能力库。
- 公司公共 Skills/Rules Git 工作目录。

Codex、Claude、MCP、GitLab Token、数据库连接等不进入首次使用必填项。

### 3.2 每个需求的最短路径

命令行：

```powershell
dw init "负激励账单导出优化"
```

页面：

1. 输入需求名称。
2. 选择一个领域 Harness。
3. 导入 PRD。
4. 查看系统从 PRD、Domain Harness、当前代码和公司能力仓库匹配出的功能、候选应用和推荐能力。
5. 确认并创建 Workspace。

创建完成后显示：

```powershell
cd F:\delivery-workspaces\负激励账单导出优化
codex
```

或：

```powershell
cd F:\delivery-workspaces\负激励账单导出优化
claude
```

Workflow 不需要知道用户最终选择哪一个执行器。只要执行器能够读取当前目录文件，就可以按相同交付协议工作。

### 3.3 页面默认只显示四个阶段

底层现有步骤可以保留，但用户界面合并为四个阶段：

1. 澄清与方案。
2. 实施。
3. 验证。
4. 交付与沉淀。

每个阶段只显示：

- 当前目标。
- 下一步操作。
- 必须查看的产物。
- 是否等待人工确认。
- 当前使用的领域知识和 Skills。

工作流图、executor session、能力路由详情、run 日志、MCP 状态默认折叠到“高级信息”。

### 3.4 Workspace 文件降噪

一级目录和各业务目录根部只放正式交付物。过程状态、草稿、检查清单和 Agent 交接文件不能平铺给用户。

```text
workspace/
  AGENTS.md
  CLAUDE.md

  prd/
    document.md                       # 正式 PRD

  design/
    requirement-spec.md               # 确认后的需求规格
    technical-design.md               # 正式技术方案
    unit-test-design.md                # 开发前冻结的单测设计
    smoke-test-design.md               # 冒烟设计与执行入口
    process/                           # 需求/方案阶段过程材料
      context-summary.md
      requirement-confirmation.md
      technical-confirmation.md
      review-comments.md

  tasks/
    implementation-plan.md             # 正式实施计划
    process/                           # 任务执行过程材料

  review/
    quality-report.md                  # 正式质量结论
    process/                           # diff、自检、测试原始结果

  delivery/
    delivery-summary.md

  archive/
    knowledge-change-set.json

  context/                             # Workflow 组装的只读上下文
  apps/                                # 业务代码 worktree
  .workflow/                           # 机器状态、命令、锁和运行记录
```

原则：

- `design/` 根目录代表可以评审和长期保留的技术文档。
- `design/process/` 保存澄清、确认、评审等过程材料。
- `.workflow/` 只服务机器，不要求普通用户理解。
- 页面默认只展示正式交付物，过程材料通过“查看过程”按需展开。

## 4. 总体架构

```text
Delivery Workflow
  ├─ CLI / Local Console
  ├─ Workspace Assembler
  ├─ Workflow Kernel
  ├─ Domain Harness Adapter
  ├─ Capability Registry & Router
  ├─ Context Snapshot Builder
  ├─ Quality Gate Runner
  └─ Knowledge Proposal Builder

Company Capability Repositories
  ├─ 通用需求澄清/技术方案 Skills
  ├─ 通用开发/Review/测试 Skills
  ├─ 领域专用 Skills/Rules
  ├─ 工程 Rules
  └─ 模板与确定性脚本

Domain Harness: negative
  ├─ 现有产品白皮书、规则、Skills、代码、Graphify
  ├─ 新增可信技术目录 catalog/
  ├─ 新增自动发现结果 discovery/
  ├─ 新增知识质量规则 quality/
  └─ 新增外部能力声明 connectors/

Demand Workspace
  ├─ 自描述执行规则 AGENTS.md / CLAUDE.md
  ├─ 当前步骤命令 .workflow/commands/
  ├─ 单领域上下文快照 context/
  ├─ 按步骤挂载的 Skills / Rules
  ├─ 业务代码 worktree apps/
  ├─ 正式需求/设计/测试/交付文档
  └─ 下沉的过程材料、质量证据、知识更新提案

Codex / Claude
  └─ 进入 Demand Workspace 后按文件协议执行
```

### 4.1 Workflow Kernel

Kernel 只负责稳定交付机制：

- Workspace 生命周期。
- 阶段状态和人工检查点。
- 产物输入输出契约。
- Capability 的发现和路由。
- 上下文快照。
- 质量结果聚合。
- 知识更新提案。

Kernel 不负责：

- negative 领域的业务判断。
- Java/Spring 的具体代码解析。
- 数据库或 Apollo 的访问实现。
- Codex 或 Claude 的对话管理。
- 自动合并知识库。
- 发布或维护公司内部 Skills/Rules。
- 判断 PRD 与代码冲突时哪一方应被静默覆盖。

### 4.2 Domain Harness Adapter

试用版先支持一种 adapter：现有 `.module-manifest.yaml` 格式。

职责：

- 验证选择的目录是不是有效 Domain Harness。
- 读取模块名称和 Git revision。
- 读取产品白皮书入口。
- 读取绑定应用。
- 读取模块 Skills 和 Rules。
- 读取新增技术目录。
- 输出统一的 Domain Context。

后续若出现其他 Harness 目录形态，只新增 adapter，不修改 Workflow Kernel。

Domain Harness Adapter 必须尽可能完整地提供领域资料，不只读取一份白皮书。试用版至少加载：

- `docs/domain/` 产品白皮书。
- `.module-manifest.yaml` 绑定应用和入口。
- `codes/` 下当前代码状态。
- `skills/` 领域 Skills。
- `rules/` 领域 Rules。
- `docs/memory/` 已有系统影响记忆。
- `graphify-out/graph.json`（存在时作为辅助索引）。
- 新增 `catalog/`（存在时）。

### 4.3 Executor-agnostic Workspace

Workspace 是 Codex、Claude 之间的兼容层：

- `AGENTS.md`：仓库级持久规则和导航。
- `CLAUDE.md`：Claude Code 入口，继续引用相同主规则。
- `.workflow/commands/current.md` 或当前阶段命令：本轮工作目标。
- `context/capabilities.json`：当前步骤允许使用的能力。
- `context/skills/linked/`：Skill 的链接或副本。
- `context/rules/linked/`：Rule 的链接或副本。
- `.workflow/progress.json`：机器可读状态。

不依赖某个执行器原生识别任意 Skill 目录。Workspace 指令会明确告诉执行器按需读取已挂载的 `SKILL.md`。

Codex 官方也将重复工作流定位为 Skills，将仓库中的持久指导放在项目级指令中；因此“自描述 Workspace + 可复用 Skill”比“Workflow 保存个人 Codex 配置”更适合作为团队默认路径。

### 4.4 事实源优先级和冲突处理

技术方案不能只相信白皮书，也不能让当前代码反向否定明确的新需求。统一优先级如下：

```text
用户最新明确确认
  > PRD 明确要求（目标行为）
  > 当前代码与运行证据（现状行为）
  > Domain Harness 已审核知识（领域背景和已知关系）
  > 自动发现结果（待确认线索）
```

不同事实源承担不同职责：

- PRD 决定“要做成什么”。
- 当前代码决定“现在是什么、从哪里改、真实约束是什么”。
- Domain Harness 决定“这个领域通常如何工作、还应检查哪些入口和风险”。
- 自动发现只负责补漏。

发生冲突时不能自行选择一个覆盖另一个，必须写入 `design/process/requirement-confirmation.md`，由用户确认后才能批准技术方案。

## 5. Domain Harness 增量分层

现有目录全部保留，仅新增：

```text
spm-harness-module-negative/
  catalog/
    functions.yaml
    applications.yaml
    entrypoints.yaml
    data-assets.yaml
    interfaces.yaml
    jobs.yaml
    events.yaml
    configurations.yaml

  discovery/
    code/
    database/
    apollo/
    graph/
    review-status.yaml

  quality/
    catalog-rules.yaml
    freshness-policy.yaml
    coverage-baseline.yaml
    reports/

  connectors/
    database.yaml
    apollo.yaml
    graphify.yaml
```

### 5.1 三层知识边界

| 层次 | 目录 | 含义 | 写入者 |
| --- | --- | --- | --- |
| 产品事实 | `docs/domain/` | 定时同步的产品白皮书 | 既有同步任务 |
| 可信技术知识 | `catalog/` | 已审核的代码、数据和集成关系 | 人工审核后的合并工具 |
| 自动发现候选 | `discovery/` | 扫描器、Graphify、MCP 的原始或归一结果 | Provider |

需求 Workspace 只读取上述三层，并在 `context/` 中生成本次需求快照。

### 5.2 Manifest 只增加兼容字段

```yaml
schema_version: 2

entrypoints:
  # 保留全部原字段
  tech_whitepaper: docs/domain/TechWhitepaper.md
  catalog: catalog
  discovery: discovery
  quality: quality
  connectors: connectors

domain_context:
  product_paths:
    - docs/domain
  catalog_paths:
    - catalog
  skill_paths:
    - skills/negative-analyst
    - skills/negative-operator
    - skills/negative-reviewer
  rule_paths:
    - rules/agent-rules.md
    - rules/engineering-rules.md
```

旧字段仍然有效。没有新目录的旧模块仍能以 `schema_version: 1` 兼容模式挂载。

## 6. 多 Skill 交付闭环

多个 Skills 是合理形态，但需要区分两层。

### 6.1 通用阶段 Skills

由团队能力库维护，可跨领域复用：

| Skill | 职责 | 主要输出 |
| --- | --- | --- |
| `requirement-clarifier` | PRD 理解、问题收口、验收标准 | 需求确认 |
| `technical-designer` | 基于 PRD、当前代码和领域上下文形成技术方案 | 技术方案 |
| `test-case-designer` | 在开发前设计并冻结单测/冒烟用例 | 单测设计、冒烟设计 |
| `implementation-planner` | 拆解可执行任务 | 任务清单 |
| `code-implementer` | 按单任务实现并自检 | 代码和变更记录 |
| `code-reviewer` | 独立 Review 和风险识别 | Review 结论 |
| `test-verifier` | 开发后按冻结用例反验 PRD、方案和代码 | 测试证据、追溯矩阵 |
| `smoke-runner` | 通过人工、命令、接口或 MCP 执行冒烟 | 冒烟证据 |
| `knowledge-curator` | 判断长期知识变化 | 知识变更提案 |

现有 `sqs-spec` 可以作为 `requirement-clarifier + technical-designer + test-case-designer` 的初版实现，不要求周三前拆分；但必须补齐单测和冒烟设计输出契约。

### 6.2 领域 Skills

现有领域 Skills 可以继续由 Domain Harness 维护；新的领域 Skills/Rules 也可以统一放入公司能力仓库，通过稳定 capability id 挂载：

- `negative-analyst`：解释 negative 产品和技术上下文，识别影响面。
- `negative-operator`：约束 negative 领域实施规则。
- `negative-reviewer`：补充 negative 特有风险检查。

最终组合方式：

```text
当前阶段通用 Skill
  + 当前领域角色 Skill
  + 当前步骤 Rules
  + 当前需求 Context Snapshot
  = 当前 Agent 的执行上下文
```

不能让领域 Skill 复制完整通用流程，也不能把 negative 业务知识写进通用 Skill。

通用及领域专用 Skills/Rules 都可以从公司公共 Git 或公司 Skills 仓库挂载。Workflow 开源仓库只保存协议和示例，不发布公司实现；Domain Harness 中现有 Skills/Rules 继续兼容，不要求迁移。

如果同一个 capability id 同时出现在 Domain Harness 和公司能力仓库，Workspace 必须展示来源和版本并让用户确认，不能静默覆盖。

### 6.3 Skill 只编排判断，不持有运行状态

Skill 负责：

- 阅读顺序。
- 判断策略。
- 结构化提问。
- 证据要求。
- 调用哪些脚本或 Provider。
- 输出内容标准。

Workflow Runtime 负责：

- 当前步骤。
- 是否完成。
- 输入输出路径。
- 人工确认结果。
- 已启用能力。
- 质量门禁结果。

## 7. Capability 插件契约

当前 capability schema 已经声明 `skill`、`qualityGate`、`archiveTarget` 等类型，但运行时主要实现了 Skill/Rule 路径挂载和路由。试用后需要逐步形成真正的运行时插件接口。

建议增加：

```text
domainSource
contextResolver
discoveryProvider
contextEnricher
qualityGate
archiveContributor
archiveTarget
executor
notification
```

### 7.1 统一 Capability Manifest

```yaml
id: negative-java-entrypoint-discovery
type: discoveryProvider
name: Java 代码入口发现
version: 1.0.0
appliesToSteps:
  - 00-load-context
inputs:
  - domain-harness
  - selected-applications
  - known-tables
outputs:
  - discovery-result-v1
runner:
  type: command
  command: node
  args:
    - scripts/discover-java-entrypoints.js
permissions:
  filesystem: read
  network: none
```

### 7.2 统一 Provider 输出

```json
{
  "schemaVersion": 1,
  "provider": "negative-java-entrypoint-discovery",
  "providerVersion": "1.0.0",
  "status": "success",
  "observedAt": "2026-08-04T10:00:00Z",
  "entities": [],
  "relations": [],
  "evidence": [],
  "warnings": [],
  "unresolved": []
}
```

底层可以是本地脚本、Graphify 或 MCP，但 Workflow 只读取统一结果。

### 7.3 试用版能力边界

下周不实现通用插件进程管理器。先支持三种简单能力：

1. 文件能力：Skill、Rule、Template、Knowledge。
2. 内置能力：功能匹配、上下文快照、质量汇总、知识提案。
3. 命令能力：由用户或 Skill 执行脚本，把结果写入约定文件。

MCP 统一调用和第三方插件运行器放在试用之后。

## 8. 单领域挂载和上下文解析

### 8.1 Workspace 配置

新增 `domain` 单数对象，不设计 `domains` 数组：

```json
{
  "demandName": "负激励账单导出优化",
  "domain": {
    "id": "negative",
    "root": "F:/code/harness-project/spm-harness-module-negative",
    "revision": "abc123",
    "manifestVersion": 2
  },
  "selectedFunctionIds": [],
  "selectedApplicationIds": [],
  "skills": [],
  "rules": []
}
```

如果用户尝试选择第二个领域，页面提示拆分需求，不提供继续按钮。

### 8.2 上下文解析顺序

```text
PRD
  -> 产品白皮书匹配
  -> 功能候选
  -> 应用候选
  -> catalog 技术入口
  -> 表/API/Job/MQ/Apollo 关系
  -> discovery 未审核候选
  -> 缺口和待确认问题
  -> 人工确认范围
```

`discovery/` 中的内容只能以“待确认发现”进入方案，不能作为已确认事实。

### 8.3 Workspace 快照

```text
context/
  domain-lock.json
  domain-summary.md
  product-context.md
  technical-context.md
  selected-functions.json
  selected-applications.json
  selected-entrypoints.json
  selected-data-assets.json
  unresolved-context.md
  capabilities.json
  skills/linked/
  rules/linked/
```

`domain-lock.json` 至少记录：

- Domain Harness 路径。
- Git remote 和 revision。
- manifest 版本。
- 使用的知识文件及 hash。
- 上下文生成时间。
- 选中的功能、应用和能力。

运行中的需求不会因为 Domain Harness 后续变化而静默改变。用户可以主动刷新，并先查看 diff。

## 9. 需求澄清和技术方案门禁

### 9.1 需求澄清必须回答

- 业务目标和成功标准是什么。
- 本次明确做什么、不做什么。
- 需求是否确实属于当前领域。
- 是否需要拆分跨领域子需求。
- 涉及哪些业务角色和使用场景。
- 正常、边界和异常行为是什么。
- 验收数据和验收方式是什么。
- 哪些问题会影响接口、数据、权限、金额或发布。

### 9.2 技术方案必须回答

- 选中了哪些应用，为什么。
- 代码入口是什么，证据在哪里。
- 涉及哪些接口、表、缓存、ES、MQ、Job、Apollo 配置。
- 调用链和数据链如何变化。
- 兼容、幂等、事务、性能、安全风险是什么。
- 灰度、回滚、监控和数据修复方案是什么。
- 每个技术结论属于 `verified` 还是 `discovered`。
- 哪些地方必须由用户确认。
- 哪些行为需要单元测试证明，测试落在哪个模块、类和边界。
- 哪些核心链路需要冒烟验证，未来通过什么接口、命令或 MCP 执行。

### 9.3 单测设计前置和冻结

单测设计是技术方案的一部分，不是开发完成后临时补写。生成技术方案时，Agent 必须同时基于 PRD、当前代码和 Domain Harness 生成：

- `design/unit-test-design.md`。
- `design/smoke-test-design.md`。

现有 `06-generate-unit-tests` 同时承担“想用例”和“写/跑测试”，职责需要拆开：

```text
02-generate-technical-design
  -> 03-design-tests               # 开发前，只设计用例
  -> manual-technical              # 一次确认方案、单测、冒烟
  -> 05-split-tasks
  -> 06-implement-task             # 可只关注编码
  -> 07-review-code
  -> 08-verify-tests               # 开发后，生成/补齐测试并执行反验
  -> 09-run-smoke                  # 初版允许手工状态，后续接 Provider
```

为兼容旧 Workspace，原 `06-generate-unit-tests` 可以在读取旧 workflow 时映射到 `08-verify-tests`，新 Workspace 直接生成新步骤定义。

单测用例至少包含：

```text
用例 ID
  -> PRD/需求条目
  -> 目标应用和代码入口
  -> 前置数据与 Mock
  -> 输入
  -> 期望输出/状态变化/副作用
  -> 正常、边界或异常分类
  -> 风险标签
  -> 建议测试类和测试方法
```

技术方案人工确认时，同时冻结测试设计：

```text
.workflow/baselines/
  technical-design.lock.json
  unit-test-design.lock.json
  smoke-test-design.lock.json
```

锁文件记录文档 hash、确认人和确认时间。开发阶段不要求实现 Agent 同步编写或维护单测，可以先聚焦已批准的编码任务；但不能静默修改冻结测试基线。编码完成后再进入独立测试反验阶段，由 `test-verifier` 生成或补齐测试代码并执行。

开发完成后由独立 `test-verifier`：

1. 读取原始 PRD、已批准技术方案和冻结测试设计。
2. 读取当前代码 diff。
3. 生成或补齐测试代码。
4. 执行测试并记录真实结果。
5. 输出“PRD → 方案 → 前置用例 → 代码 diff → 测试结果”追溯矩阵。
6. 判断失败属于实现缺陷、方案缺陷、PRD 歧义还是测试设计缺陷。

如果开发后确实需要修改测试基线，必须生成 deviation 记录并人工确认，禁止为了让现有实现通过而直接改期望值。

### 9.4 冒烟能力扩展口

`design/smoke-test-design.md` 在周三初版必须存在，但执行方式允许逐步扩展：

```yaml
scenarios:
  - id: smoke-negative-export
    requirementRefs:
      - REQ-003
    runner:
      type: manual   # manual | command | http | mcp
    target: negative-export
    request: {}
    assertions: []
```

统一 Smoke Runner 输入输出后，后续可以替换为：

- 指定 HTTP 接口调用。
- 本地或测试环境脚本。
- Postman/Newman 等命令。
- 公司测试平台接口。
- MCP Tool。

周三初版只要求保存结构化冒烟设计、展示 `planned/not-run/passed/failed/blocked` 状态，并保留手工结果入口，不实现真实 MCP。

### 9.5 简化原则

页面不展示上述长清单，只显示三类结果：

- 已确认。
- 待确认。
- 阻塞。

正式内容写入 `design/requirement-spec.md`、`design/technical-design.md`、`design/unit-test-design.md` 和 `design/smoke-test-design.md`；确认、评审和中间摘要下沉到 `design/process/`。

## 10. 质量门禁和知识闭环

### 10.1 交付质量门禁

- 需求确认已批准。
- 技术方案已批准。
- 单测设计和冒烟设计已随技术方案冻结。
- 实施任务已批准。
- 代码 diff 与任务清单可追溯。
- Review 无未处理的 P0/P1。
- 测试命令和结果有证据。
- 冻结单测用例与实现后结果已经形成追溯矩阵。
- 测试基线如有变更，存在已批准 deviation。
- 数据、接口和配置风险有结论。
- 上线和回滚项完整。

### 10.2 上下文质量门禁

试用版先实现五条：

1. 已确认一个领域。
2. 已确认至少一个功能点。
3. 每个选中应用都有用途说明。
4. 数据库相关需求列出受影响表或明确说明不涉及。
5. 所有未验证的代码/数据关系进入待确认项。

### 10.3 开发后反验门禁

开发完成后，以下任一情况阻塞交付：

- PRD 高优先级条目没有对应前置单测或冒烟场景。
- 冻结单测用例未执行且没有具体阻塞原因。
- 用例失败但未归因到实现、方案、PRD 或用例本身。
- 为适应现有实现修改测试期望，却没有 deviation 审批。
- 代码 diff 出现技术方案和测试设计均未覆盖的新行为。
- 高风险场景只有 Agent 文字结论，没有测试或人工验证证据。

反验不是只判断代码是否通过测试，还要反向发现：

- PRD 是否存在无法验收的表达。
- 技术方案是否遗漏真实代码约束。
- 实现是否偏离已批准方案。
- 原测试设计是否错误或不完整。

### 10.4 知识更新提案

需求结束生成：

```text
archive/
  knowledge-change-set.json
  knowledge-patch.md
  evidence/
    code-diff-summary.md
    test-summary.md
    database-impact.md
    interface-impact.md
```

`knowledge-change-set.json` 可以提出：

- 更新 `catalog/functions.yaml`。
- 新增代码入口。
- 更新表的读写应用。
- 新增接口、Job、MQ 或 Apollo 关系。
- 更新 `docs/memory/memory.md`。
- 新增 `docs/memory/summary/` 需求摘要。

明确禁止提出自动修改 `docs/domain/`。

## 11. 页面调整建议

### 11.1 首页

首页保留三个主要动作：

- 新建需求。
- 打开需求。
- 最近需求。

全局配置状态不再占据主视觉。

### 11.2 新建需求向导

只分三步：

1. 需求：名称、PRD。
2. 领域：选择 Harness，展示领域说明和健康状态。
3. 能力：展示自动推荐的 Skills/Rules，默认接受即可创建。

应用范围不要求创建时立即完整确认，可以在“澄清与方案”阶段通过领域上下文推荐后确认。

### 11.3 需求详情

顶部固定显示：

```text
需求名称 | negative 领域 | 当前阶段 | 下一步操作
```

主区域显示：

- 当前阶段说明。
- “在 Codex 中继续”和“在 Claude 中继续”的命令文本；不要求提前配置路径。
- 当前产物预览。
- 人工确认按钮。
- 阻塞问题。

右侧或折叠区显示：

- 领域知识版本。
- 已挂载 Skills/Rules。
- 候选应用。
- 代码和数据上下文。
- 高级运行信息。

## 12. 周三初版范围

### 12.1 P0 必须完成

- 选择现有 `spm-harness-module-negative` 作为单领域 Harness。
- 最大限度读取现有 `.module-manifest.yaml`、`docs/domain/`、`docs/memory/`、`skills/`、`rules/`、`graphify-out/`、`codes/` 和绑定应用。
- 在 Domain Harness 中增量建立 `catalog/`、`discovery/`、`quality/`、`connectors/` 骨架和 manifest 入口，不改动任何已有目录。
- Workspace 保存 `domain` 和 `domain-lock.json`。
- 页面创建需求时选择领域目录。
- 页面允许挂载公司公共 Git/Skills 仓库中的通用 Skills 和 Rules。
- Workspace 按当前阶段组装领域 Skills/Rules 与公司通用 Skills/Rules。
- 在 Workspace 直接运行 Codex 或 Claude，无需 Workflow executor 配置。
- 跑通需求澄清、技术方案、单测设计、冒烟设计及人工确认。
- 技术方案确认时冻结方案、单测和冒烟设计。
- 开发后能按冻结单测设计输出反验结果和追溯矩阵。
- 冒烟预留 `manual/command/http/mcp` runner 契约，初版支持手工状态录入。
- 一级目录只展示正式技术文档，过程文件下沉到 `process/` 或 `.workflow/`。
- `dw doctor --workspace` 能检查领域挂载和基础依赖。

### 12.2 P1 尽量完成

- 生成知识更新提案。
- Domain Harness 新增 `catalog/` 最小样本。
- 增加上下文五项检查和完整交付质量汇总。
- 页面显示领域知识健康度和待确认发现。

### 12.3 周三前明确不做

- 通用 MCP 插件运行器。
- 自动访问生产数据库。
- Apollo 实时查询。
- 自动更新或合并 Domain Harness。
- 多领域 Workspace。
- 自动安装 Codex 或 Claude。
- 自动管理 Codex/Claude 会话。
- 完整覆盖 negative 的六个仓库。
- 重构现有 Domain Harness 目录。
- 通用 Capability 进程沙箱。
- 自动执行 HTTP/MCP 冒烟。

## 13. 2026-08-03 ～ 2026-08-05 压缩实施计划

本节只表达目标顺序，不代表白天持续投入。实际执行采用单人夜间模式：周三晚交付核心 Alpha，周四晚补普通组员体验，周五晚补 negative 最小知识样本；以 [domain-harness-workflow-wbs.md](./domain-harness-workflow-wbs.md) 为准。

### 8 月 3 日：打通单领域 Workspace

- 冻结 `domain` Workspace schema。
- 实现 Domain Harness 目录选择和校验。
- 读取 `.module-manifest.yaml`。
- 生成 `context/domain-lock.json`。
- 读取现有白皮书、记忆、代码目录、Graphify、领域 Skills/Rules。
- 支持挂载公司公共 Skills/Rules 目录。
- 将正式文档和过程材料按新目录约定分层。
- 准备 negative 领域真实试用需求和 PRD。

验收：命令或页面可以创建绑定 negative 的自描述 Workspace，并能直接运行 Codex/Claude。

### 8 月 4 日：需求、方案和测试设计闭环

- 按“PRD 目标 + 当前代码现状 + Domain Harness 背景”组装上下文。
- 接入现有 `sqs-spec` 和 negative 领域 Skills。
- 生成正式需求规格、技术方案、单测设计和冒烟设计。
- 技术方案确认时生成三个 baseline lock。
- 改造质量步骤，开发后读取冻结测试设计并输出追溯矩阵。

验收：同一 Workspace 在 Codex/Claude 中能完成需求澄清和技术方案，并在开发前得到可执行的测试设计。

### 8 月 5 日：极简页面、门禁和试用发布

- 新建需求三步向导。
- 需求详情聚合为四阶段。
- 突出下一步、产物和人工确认。
- executor 配置移到高级区域，默认不需要。
- 页面默认隐藏过程文件，只展示正式技术文档。
- 增加单测反验质量状态和手工冒烟结果入口。
- 补齐回归测试，发布可试用版本。

验收：未参与开发的组员在 15 分钟内创建需求，选择领域和能力，并进入 Codex/Claude 完成第一阶段。

8 月 6 日以后进入试用修复和知识目录增强，不再作为初版交付前置条件。

## 14. 试用验收标准

### 上手性

- 新用户不配置 executor 即可创建 Workspace。
- 从启动页面到获得可执行 Workspace 不超过 10 分钟。
- 用户只需理解“需求、领域、当前阶段、下一步”四个概念。
- 用户可以自行选择 Codex 或 Claude。

### 正确性

- Workspace 只能绑定一个领域。
- 能记录领域 Git revision。
- 能读取现有产品白皮书但不会修改它。
- 当前阶段只暴露对应 Skills/Rules。
- 技术方案确认时同时冻结单测和冒烟设计。
- 开发后能用冻结用例反验 PRD、方案和代码。
- 人工确认点不能被跳过。
- 知识更新只生成提案。

### 可恢复性

- 关闭页面或 AI 工具后，重新打开 Workspace 能从进度文件恢复。
- Codex 和 Claude 之间切换不依赖聊天记录。
- Domain Harness 临时不可用时，已生成的需求快照仍可读取。

### 可扩展性

- 新增领域主要通过 manifest 和目录内容完成。
- 新增 Skill 不要求修改 Workflow 核心流程。
- 后续数据库、Apollo、Graphify 可以通过标准 Provider 结果接入。

## 15. 技术实施顺序

建议严格按以下顺序修改当前代码：

1. 新增 Domain Harness reader，不先改现有 whitepaper reader。
2. Workspace schema 新增单数 `domain`，保留 `whitepaperContext` 兼容字段。
3. 创建 `domain-lock.json` 和 `domain-summary.md`。
4. 将现有 whitepaper 功能匹配适配为 Domain Context 的一部分。
5. 将公司能力仓库和领域 Skills/Rules 合并到当前 capability routing。
6. 调整正式文档与过程材料目录。
7. 在技术方案阶段增加单测/冒烟设计和 baseline lock。
8. 将开发后测试步骤改为读取冻结基线的反验门禁。
9. 简化新建需求和需求详情页面。
10. 最后再扩展上下文质量和 knowledge archive proposal。

避免先做：

- 大规模重写 workflow step engine。
- 一次性引入插件沙箱。
- 统一改名所有 whitepaper 字段。
- 自动扫描所有代码仓。
- 把已有 Domain Harness 迁入 team-config。

## 16. 需要立即形成的开发任务

### Runtime

- `domain-harness.js`：manifest 读取、校验、revision 和统一上下文。
- `domain-context.js`：组装产品、技术、Skills、Rules 和应用信息。
- `domain-lock.js`：生成和刷新快照锁。
- `context-quality.js`：上下文五项检查。
- `design-baseline.js`：冻结技术方案、单测和冒烟设计。
- `test-traceability.js`：生成 PRD、方案、用例、diff 和结果追溯矩阵。

### Workspace

- 扩展 `.workflow/workspace.json`。
- 新增 `context/domain-lock.json`。
- 新增 `context/domain-summary.md`。
- 新增 `context/capabilities.json`。
- 正式设计文档保留在 `design/` 根目录，过程材料迁入 `design/process/`。
- 新增 `.workflow/baselines/`。

### Console/API

- 领域目录检查 API。
- Workspace 挂载领域 API。
- 领域摘要和健康状态展示。
- 新建需求三步向导。
- 需求详情四阶段视图。
- 默认只展示正式产物。
- 单测反验状态和手工冒烟结果入口。

### Archive

- 扩展 `knowledge-update-proposal.json`。
- 增加 `knowledge-change-set.json`。
- 增加 `docs/domain/` 禁止写入校验。

### Tests

- 旧 Workspace 无 `domain` 时保持兼容。
- 无新增目录的旧 Domain Harness 可以挂载。
- Domain Harness revision 正确记录。
- 第二领域不能被添加。
- Skills/Rules 路由不越过当前步骤。
- 技术方案批准前无法冻结测试基线。
- 冻结用例被修改后必须触发 deviation。
- 反验追溯矩阵能识别未覆盖 PRD 条目和新增代码行为。
- 归档不会写入领域目录。

## 17. 风险与控制

| 风险 | 控制措施 |
| --- | --- |
| 三天内范围失控 | P0 只完成单领域挂载、设计前置测试和文件闭环 |
| 页面继续复杂 | 默认页面只保留四阶段和下一步操作 |
| Skill 过大 | 试用时复用，试用后按稳定输入输出拆分 |
| 产品白皮书被误写 | Runtime 对 `docs/domain/` 设置归档目标黑名单 |
| 自动发现被当成事实 | discovery 内容必须标记未确认 |
| Codex/Claude 行为差异 | 用 Workspace 文件协议，而非依赖聊天会话 |
| 领域知识过期 | revision、hash、verifiedAt 和 freshness gate |
| 旧配置被破坏 | 新增字段并保持 whitepaperContext 兼容 |
| 开发后篡改测试适配实现 | 冻结测试设计 hash，变更必须走 deviation 审批 |
| 过程文件淹没用户 | 正式文档留根目录，过程材料下沉并默认隐藏 |

## 18. 后续演进

试用完成后按反馈推进：

1. 建立 `catalog/` 的最小正式 schema。
2. 建立 Domain Harness 初始化 Skill。
3. 建立 Java 入口发现 Provider。
4. 实现 command/http Smoke Runner。
5. 接数据库只读 MCP，从已知表向上反查代码入口。
6. 接 Apollo、MQ、XXL-JOB 元数据。
7. 实现 MCP Smoke Runner。
8. 建立统一 Capability Runner。
9. 建立知识变更审核和安全应用工具。
10. 形成更多领域 Harness，但不改变单需求单领域约束。

## 19. 业界能力取舍

本方案只吸收通用思想，不直接引入重型平台：

- 借鉴 Backstage 的实体和关系目录思路，管理应用、API、资源和依赖，但不在下周部署 Backstage。
- 借鉴 OpenLineage 的 Dataset、Job 和 Run 分离思路，将稳定数据关系保存在 Harness，把实时状态留给后续 Provider。
- 借鉴 OpenAPI 的稳定操作标识，将 HTTP 方法、路径和 operationId 作为接口入口证据。
- 使用 Skills 保存可重复工作流，使用仓库指令保存长期项目规则，使用 MCP 提供实时外部上下文。

参考：

- Backstage Catalog Entity Format: https://github.com/backstage/backstage/blob/master/docs/features/software-catalog/descriptor-format.md
- OpenLineage: https://openlineage.io/
- OpenLineage Specification: https://github.com/OpenLineage/OpenLineage/blob/main/spec/OpenLineage.md
- OpenAPI Paths and Operations: https://swagger.io/docs/specification/v3_0/paths-and-operations/
- OpenAI Codex Use Cases: https://developers.openai.com/codex/use-cases

## 20. 最终产品判断

Delivery Workflow 不应该成为另一个 AI IDE，也不应该成为需要大量本机配置的团队平台。

它的核心价值是：

```text
把一个需求变成自描述 Workspace
  + 挂载一个领域知识库
  + 从公司仓库和领域 Harness 组合当前阶段所需 Skills/Rules
  + 通过文件完成 Agent 交接
  + 通过人工检查点保证边界
  + 在开发前冻结单测和冒烟设计
  + 在开发后用冻结用例反验 PRD、方案和代码
  + 通过质量证据完成交付
  + 通过审核提案反哺领域知识
```

只要这个闭环简单可靠，Codex、Claude、Graphify、数据库 MCP、Apollo MCP 都可以作为后续可替换能力接入，而不会反过来决定 Workflow 的产品形态。
