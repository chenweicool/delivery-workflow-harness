# Delivery Workflow 控制平面重构方案

> 日期：2026-08-03
>
> 状态：架构基线，作为后续 CLI、页面和连接器改造依据。

## 1. 产品定位

Delivery Workflow 是一个**目录原生、模型无关、证据驱动**的软件交付控制平面。

它不做 AI IDE、不接管用户与 AI 的对话、不要求配置 Codex / Claude / IDEA 路径。它负责把一次需求组织为可追溯的交付状态机：输入、阶段产物、质量门禁、人工确认、例外和知识更新提案。

```text
Domain Harness + 团队策略
          │
          ▼
   需求 Workspace（唯一交付现场）
          │
   用户以 Codex / Claude / 任意 IDE 在目录中工作
          │
          ▼
  证据回写 + Gate 校验 + 人工确认 + 下一阶段
```

## 2. 架构原则

1. **目录优先**：Workspace 中的版本化文件是事实；页面是查看、补充和确认入口，不是唯一操作入口。
2. **模型无关**：Codex、Claude 和后续模型都是执行端。Harness 提供中性协议，不能把特定 CLI 配置写成前置条件。
3. **单一领域**：一个 Workspace 只挂载一个 Domain Harness；跨领域需求拆分后分别执行。
4. **证据优先**：Gate 只根据已回写的文件、命令结果、快照版本和人工意见转移状态，不能根据聊天文字自动通过。
5. **最小交互**：默认界面只展示当前需求下一步、缺失证据和人工动作；高阶配置不进入主路径。
6. **连接器隔离**：外部系统读取通过统一连接器获取并冻结为 Workspace 快照；Agent 默认读取快照，不无限制直连外部系统。
7. **破坏式重构**：不迁移旧 Workspace，不保留旧页面主路径；新 `.workflow` 契约是唯一事实源。

## 3. 事实源与职责边界

| 信息 | 权威性 | 责任方 | 使用方式 |
| --- | --- | --- | --- |
| PRD / 人工需求确认 | 目标行为第一事实源 | 需求负责人 | 决定验收口径与范围 |
| 当前代码与运行证据 | 当前行为第一事实源 | 研发 | 决定真实入口和技术约束 |
| Domain Harness | 领域背景、历史风险、代码索引、领域能力 | Domain Owner | 补足上下文，不覆盖 PRD 或代码 |
| 补充材料 | 本次临时参考 | 需求参与者 | 只作为可追溯证据 |
| Quality Policy | 阶段准入规则 | 团队 / Quality Owner | 定义 Gate、所需证据和审批角色 |

冲突必须进入待确认产物；Workflow 不替代人做领域或产品裁决。

## 4. 目标目录契约

```text
<workspace>/
  prd/                         # 本次需求材料
  context/                     # 冻结上下文快照
    domain-summary.md
    external-materials.md
  design/                      # 正式方案与确认结论
  tasks/                       # 正式任务与执行记录
  review/                      # Review、测试、冒烟与交付证据
  archive/                     # 知识更新提案
  .workflow/                   # 机器状态，不作为日常用户输入区
    workspace.json
    workflow.json
    quality-policy.lock.json
    gates.json
    connectors.lock.json
    progress.json
```

`AGENTS.md` 与 `CLAUDE.md` 保持为模型进入目录后的中性工作说明：允许 AI 与用户多轮澄清，但必须把确认、阻塞和结果写回上述文件。

## 5. CLI 主路径

CLI 是主入口，页面必须与其同一契约，而不是另做一套状态。

```bash
# 创建并装配最小输入
dw init <demand-name> --domain <domain-harness-path>
dw prd import <file-or-directory> --workspace <path>
dw context add <source> --workspace <path>

# 工作流与质量
dw status --workspace <path>
dw next --workspace <path>
dw gate check --workspace <path>
dw gate approve <gate-id> --workspace <path> --note "..."
dw gate reject <gate-id> --workspace <path> --note "..."
dw evidence list --workspace <path>

# 可选兼容层，不进入默认教程
dw handoff ...
dw open ...
```

命令失败必须给出缺失证据和下一步，不要求用户进入页面补隐式配置。

## 6. 质量门禁模型

质量策略由团队或领域提供默认值，初始化时锁定版本到 Workspace；需求只写证据和例外，不让普通用户从页面编辑 Gate 规则。

建议配置文件：`.workflow/quality-policy.yaml`（来源可为团队策略仓，锁定后写入 `.workflow/quality-policy.lock.json`）。

```yaml
version: 1
gates:
  requirement-confirmed:
    requires:
      - prd/**
      - design/requirement-confirmation.md
    approval: product-or-demand-owner
  design-ready:
    requires:
      - design/technical-design.md
      - review/unit-test-plan.md
      - review/smoke-test-plan.md
    approval: tech-owner
  delivery-verified:
    requires:
      - review/unit-test-result.md
      - review/traceability-matrix.md
      - review/smoke-test-result.md
    approval: quality-or-tech-owner
```

Gate 状态只允许：`pending`、`blocked`、`ready-for-approval`、`approved`、`rejected`、`exception-approved`。例外必须有审批人、原因、影响和过期时间。

### 测试质量闭环

1. 技术方案阶段必须产出并冻结 `unit-test-plan` 与 `smoke-test-plan`。
2. 开发完成后按冻结计划产出测试结果和追溯矩阵。
3. 测试计划变更必须记录 deviation，不能静默覆盖。
4. Gate 以“PRD → 方案 → 用例 → 代码 → 结果”的证据链，而非“测试文件存在”作为放行依据。

## 7. 统一连接器模型

“外部文档”不是一块独立知识库，也不是页面上的复杂配置。它是可选的本次需求补充材料来源。

```text
页面 / CLI：选择补充材料
       │
       ▼
Connector Contract：inspect / fetch / snapshot / describe
       ├─ local-file（内置）
       ├─ feishu（MCP 或 API 适配器）
       ├─ internal-document（MCP 适配器）
       ├─ database-readonly（后续）
       └─ apollo-readonly（后续）
       │
       ▼
context/external-materials.md + .workflow/connectors.lock.json
```

MCP 是连接器的一种承载方式，不是用户需要理解的产品概念。所有连接器默认只读；凭据仅存本机安全配置，Workspace 只保存来源、版本、拉取时间和脱敏快照。

## 8. 页面信息架构

### 8.1 默认需求初始化向导

```text
1. 绑定领域 Harness（必填）
2. 导入 PRD（必填）
3. 补充材料（可选：本地 / 飞书 / 内部文档）
4. 生成上下文包 → 进入需求澄清
```

不显示“知识库来源”“业务上下文”“执行器配置”等重叠概念。

### 8.2 运行中的 Workspace

页面只保留三类视图：

1. **下一步**：当前阶段、缺失输入、阻塞原因和推荐命令。
2. **证据与 Gate**：Gate 状态、证据清单、人工通过/退回/例外动作。
3. **产物**：正式文档和过程证据预览。

全局设置收敛为：运行环境、团队能力、连接器。Codex/Claude/IDEA 的路径配置进入“兼容工具”，默认隐藏。

## 9. 重构实施路径

### M1：契约优先（下一步）

- 新增 Quality Policy、Gate 状态、证据检查 CLI。
- 新 Gate 直接替代旧 checkpoint；旧 Workspace 不在本次重构的支持范围内。
- 增加 `prd import`、`context add` 等目录优先命令。

### M2：主页面收敛

- 用三步初始化向导替换当前上下文卡片。
- 增加 Gate 看板；隐藏执行器管理、IDEA 和复杂全局知识表单。
- 页面调用 CLI 同一服务契约。

### M3：连接器扩展

- 先提供 local-file 与既有飞书能力的统一快照协议。
- 再接入内部文档 MCP；DB/Apollo 只读连接器单独审批后加入。

### M4：移除执行器中心设计

- 移除页面中的 Codex / Claude / IDEA 路径、执行器管理和启动入口。
- Workspace 只提供模型中性的 `AGENTS.md` / `CLAUDE.md` 与阶段命令文件。
- 用户在目录中自行使用任意模型或 IDE；Workflow 不再创建或管理模型会话。

## 10. 首轮验收标准

1. 新成员仅用 `dw init --domain`、导入 PRD、进入目录运行自己已有的 Codex 或 Claude，即可开始需求澄清。
2. 不配置任何执行器或 IDEA 路径，不影响主流程。
3. 页面 30 秒内能说明“当前阶段、还缺什么、谁需要确认、下一步做什么”。
4. 技术方案 Gate 无测试设计不得放行；交付 Gate 无测试/追溯/冒烟证据不得放行。
5. 外部材料以连接器快照进入 Workspace，可查看来源与版本；Agent 不因挂载而拥有无限外部访问权限。
