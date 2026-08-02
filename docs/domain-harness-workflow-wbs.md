# Delivery Workflow + Domain Harness WBS

> 拆解日期：2026-08-02
>
> Alpha 目标：2026-08-05（周三晚）完成核心闭环；周四、周五晚补体验和领域知识样本
>
> 试用领域：negative
>
> 依据：[domain-harness-workflow-trial-technical-plan.md](./domain-harness-workflow-trial-technical-plan.md)

## 1. 推进策略

采用“双轨一闭环”：

```text
A 轨：Workflow 可用性
  先让组员能够创建需求、挂载领域和能力、进入 Codex/Claude 工作

B 轨：Domain Harness 能力建设
  同步形成一个最小可信领域知识包，不等待知识库全部完善

闭环：真实需求反哺
  试用中发现知识缺口 -> 形成提案 -> 人工审核 -> 更新领域知识
```

两条轨道不能串行：

- 如果先建设完整知识库再开放 Workflow，短期内没有真实反馈，知识结构容易脱离需求。
- 如果只做 Workflow，不提供可信领域上下文，工具只是一个流程页面，不能提高方案质量。
- 周三 Alpha 只要求能读取现有 negative 知识；周五 Knowledge Seed 再形成一个真实功能的纵向样本，不要求覆盖六个仓库。

### 资源前提：单人夜间模式

本计划按以下真实条件安排：

- 主要开发者只有一人。
- 只能晚上投入，默认每晚约 2～3 小时。
- 白天不安排必须实时跟进的开发任务。
- 领域负责人和 Pilot User 只提供异步材料或短时验收，不承担并行开发。

因此拆成三个交付层级：

```text
周三晚 Alpha
  能挂载、能生成可信方案、能冻结测试设计、能沿用现有流程继续开发和反验

周四晚 Usable
  页面和文件体验达到普通组员可试用

周五晚 Knowledge Seed
  negative 形成一个真实功能的最小可信知识样本
```

周三前暂停页面大改、通用插件协议、知识健康度和完整 catalog 建设。

## 2. 周三晚 Alpha Definition of Done

周三可以宣布“初版可用”，必须同时满足：

### 用户可用

- 用户启动 Workflow 后，不配置 Codex/Claude 路径即可创建需求。
- 创建需求时能选择或填写一个 Domain Harness 路径。
- 复用现有 Skills/Rules 路径挂载能力，不重做能力市场和推荐页面。
- Workspace 创建后，页面给出 `cd <workspace> && codex` 或 `claude` 使用方式。
- 现有页面能继续打开 Workspace、查看当前状态和人工确认；极简页面重构不作为周三前置。

### 方案可信

- 需求澄清同时读取 PRD、当前代码和 negative Domain Harness。
- 技术方案明确代码入口、应用范围、数据和外部依赖。
- 技术方案阶段同步生成单测设计和冒烟设计。
- 技术方案批准时冻结方案、单测和冒烟设计。

### 质量闭环可运行

- 开发后测试步骤能读取冻结用例和当前 diff。
- 能输出“PRD → 方案 → 用例 → 代码 → 结果”追溯矩阵。
- 冒烟支持 `planned/not-run/passed/failed/blocked` 状态和手工证据。
- 测试基线被修改时能够识别并要求 deviation 说明。

### 领域知识可用

- negative Domain Harness 现有目录保持不变。
- Workflow 能读取 manifest、白皮书、记忆、代码、Graphify、领域 Skills/Rules。
- 能基于现有 Domain Harness 内容完成上下文装配。
- 新增知识目录骨架和真实功能样本调整到周四、周五晚，不阻塞周三 Alpha。

## 3. 角色分工

角色可以由同一人兼任，但责任必须区分。

| 角色 | 责任 |
| --- | --- |
| Workflow Owner | Runtime、页面、Workspace 契约和向后兼容 |
| Domain Knowledge Owner | negative 领域知识审核、入口和表关系确认 |
| Capability Owner | 公司通用/领域 Skills、Rules 和版本管理 |
| Quality Owner | 单测设计标准、反验门禁和冒烟协议 |
| Pilot User | 以普通组员视角完成真实试用，不参与底层实现判断 |

关键审批责任：

- PRD 和需求口径：需求负责人。
- 技术方案和测试设计：技术负责人。
- 领域知识入库：Domain Knowledge Owner。
- Workflow 发布：Workflow Owner。

## 4. WBS 总览

| WP | 工作包 | 优先级 | 夜间槽位 | 依赖 | 交付点 |
| --- | --- | --- | --- | --- | --- |
| WP-00 | 冻结最小契约 | P0 | 周一前 30 分钟 | 无 | 周三 Alpha |
| WP-01 | 单领域 Harness 挂载 | P0 | 周一晚 | WP-00 | 周三 Alpha |
| WP-02 | 公司能力仓库挂载与锁定 | P0 | 复用现有能力，补锁定延后 | WP-00 | Alpha 复用 |
| WP-03 | Workspace 正式/过程文件分层 | P0 | 周二晚随模板调整 | WP-00 | 周三 Alpha |
| WP-04 | PRD + 代码 + 领域上下文组装 | P0 | 周一晚 | WP-01 | 周三 Alpha |
| WP-05 | 测试设计前置与基线冻结 | P0 | 周二晚 | WP-03/04 | 周三 Alpha |
| WP-06 | 开发后测试反验与冒烟口 | P0 | 周三晚 | WP-05 | 周三 Alpha |
| WP-07 | 极简页面主路径 | P1 | 周四晚 | WP-01/03 | 周四 Usable |
| WP-08 | 回归、试用包和快速指南 | P0 | 周三晚最小回归；周四补指南 | WP-04～06 | 分两次 |
| KB-01 | negative 知识目录增量骨架 | P1 | 周四晚 | WP-00 | 周四/五 |
| KB-02 | 现有知识源盘点和入口映射 | P0 | 周一晚随 WP-04 完成最小映射 | WP-01 | 周三 Alpha |
| KB-03 | 一个真实功能纵向知识样本 | P1 | 周五晚 | KB-01/02 | 周五 Seed |
| KB-04 | 领域知识初始化/整理 Skill | P1 | 后续 1～2 晚 | KB-03 | 周五后 |
| KB-05 | 知识质量和覆盖率门禁 | P1 | 后续 1～2 晚 | KB-03 | 周五后 |
| KB-06 | 代码/数据库/Apollo Provider | P2 | 迭代 | KB-04/05 | 后续 |
| PILOT-01 | 首位组员引导试用 | P0 | 周四或周五 1 小时 | WP-07/08 | Usable 验收 |
| PILOT-02 | 第二位组员无指导试用 | P1 | 下个可用晚间 | PILOT-01 修复 | 后续 |

说明：Alpha 尽量复用现有页面、Skill/Rule 挂载和测试步骤，只增加领域挂载、上下文、前置测试设计和反验语义；不在三晚内重写框架。

## 5. A 轨：Workflow 可用性工作包

### WP-00 冻结最小契约

目标：先稳定各模块之间的接口，避免三天内反复改字段。

交付物：

- `domain-mount-v1`：单领域挂载结构。
- `capability-lock-v1`：能力来源和版本锁。
- `design-baseline-v1`：方案、单测、冒烟 hash。
- `artifact-layout-v1`：正式文档与过程文件位置。

最小结构：

```json
{
  "domain": {
    "id": "negative",
    "root": "F:/code/harness-project/spm-harness-module-negative",
    "revision": "<git-revision>"
  },
  "capabilityRoots": [],
  "selectedCapabilities": []
}
```

验收：

- 新结构允许缺省，旧 Workspace 仍可读取。
- 不引入通用插件进程协议。
- 明确 `whitepaperContext` 到 `domainContext` 的兼容策略。

### WP-01 单领域 Harness 挂载

目标：让 Workspace 真正识别现有 negative Harness，而不是只认识 whitepaperRoot。

任务：

- 校验 `.module-manifest.yaml`。
- 读取模块 id、Git revision 和绑定仓库。
- 读取现有产品白皮书、记忆、Graphify、Skills、Rules 和 `codes/` 状态。
- 生成 `context/domain-lock.json`。
- 生成供 Agent 阅读的 `context/domain-summary.md`。
- 阻止同一 Workspace 添加第二个领域。

验收：

- 挂载不修改 Domain Harness。
- Domain Harness 暂时不可访问时，已生成快照仍可使用。
- 页面能显示领域名称、版本和基础健康状态。

### WP-02 公司能力仓库挂载与锁定

目标：公司内部能力独立于 Workflow 开源代码，可以按需求挂载。

任务：

- Alpha 复用现有本地 Skill/Rule 路径配置和步骤路由。
- Alpha 至少在 Workspace 记录本次选中的来源路径。
- 周四补充 Git remote、revision、capability id 和版本锁。
- 周四补充同 id 多来源冲突检查和 `context/capabilities.lock.json`。

周三只支持本地 Git checkout，不做自动 clone/pull，也不做远端 marketplace。

验收：

- 周三：`sqs-spec` 可以在需求/方案阶段启用。
- negative 领域 Skill 可以来自 Domain Harness 或公司能力仓库。
- 周四：能力 revision 可复现，Review 阶段不会意外加载实现阶段 Skill。

### WP-03 Workspace 正式/过程文件分层

目标：普通用户只感知必要技术文档。

正式文档：

```text
prd/document.md
design/requirement-spec.md
design/technical-design.md
design/unit-test-design.md
design/smoke-test-design.md
tasks/implementation-plan.md
review/quality-report.md
delivery/delivery-summary.md
```

过程材料：

```text
design/process/
tasks/process/
review/process/
.workflow/
```

任务：

- 更新模板和新 Workspace 默认输出路径。
- 页面正式产物列表过滤 `process/` 和 `.workflow/`。
- 高级入口允许查看过程材料。
- 旧路径提供读取兼容或一次性迁移映射。

验收：

- 新 Workspace 根部没有大量中间文件。
- Agent 仍然可以读取完整过程证据。
- 旧 Workspace 不因路径改变无法打开。

### WP-04 PRD + 代码 + 领域上下文组装

目标：需求澄清和技术方案不只依赖白皮书或模型推断。

上下文职责：

```text
PRD：目标行为
当前代码：当前行为、真实入口和限制
Domain Harness：领域背景、历史、应用边界和风险
Discovery：待确认线索
```

任务：

- 将 Domain Context 注入 `00-load-context`、需求澄清和技术方案阶段。
- 明确要求读取选中应用当前代码。
- 输出冲突、缺口和待确认项。
- 不把自动发现结果标成已确认事实。
- 控制上下文大小，优先索引再按需读取正文。

验收：

- 技术方案能指出真实代码入口。
- PRD 与代码冲突时进入人工确认，而不是自动裁决。
- Domain Harness 的现有白皮书和记忆被实际引用。

### WP-05 测试设计前置与基线冻结

目标：技术方案批准前就形成独立测试预期。

新增步骤：

```text
02-generate-technical-design
  -> 03-design-tests
  -> manual-technical
```

任务：

- `03-design-tests` 生成单测和冒烟设计。
- 用例必须关联需求条目、代码目标、输入、预期和风险。
- 技术确认页面同时预览三份文档。
- 批准时写入 `.workflow/baselines/*.lock.json`。
- baseline 记录 hash、批准人、批准时间。

验收：

- 缺少单测或冒烟设计不能批准技术方案。
- 开发阶段不强制同步写测试，但不能修改 baseline。
- 测试设计在代码实现前完成。

### WP-06 开发后测试反验与冒烟口

目标：开发后用冻结预期独立检查实现，而不是让实现 Agent 自己证明正确。

新增步骤：

```text
07-review-code
  -> 08-verify-tests
  -> 09-run-smoke
```

任务：

- `08-verify-tests` 读取 baseline、PRD、技术方案和 diff。
- 生成或补齐测试代码并执行。
- 输出追溯矩阵和失败归因。
- baseline 变化要求 deviation 审批。
- `09-run-smoke` 定义 `manual/command/http/mcp` runner。
- 周三只实现 manual 状态和证据录入。

验收：

- 能识别未覆盖 PRD 条目。
- 能识别 diff 中方案未设计的新行为。
- 能区分实现缺陷、方案缺陷、PRD 歧义和用例缺陷。
- 未执行冒烟时明确显示 `not-run`，不能伪装为通过。

### WP-07 极简页面主路径

目标：页面成为需求驾驶舱，而不是配置后台。

新建需求仅保留：

1. 名称和 PRD。
2. 一个 Domain Harness。
3. 推荐 Skills/Rules 确认。

需求详情只保留：

- 当前阶段。
- 下一步。
- 正式产物。
- 人工确认。
- 阻塞问题。
- “在 Codex/Claude 中继续”的命令。

高级区域：

- capability lock。
- 领域 revision。
- process 文件。
- run 日志。
- executor session。

验收：

- 新用户不进入全局配置页也能创建需求。
- 页面不要求配置 Codex/Claude。
- 用户无需理解内部 step id。

### WP-08 回归、试用包和快速指南

目标：周三交付可重复使用的初版，而不是开发机演示。

任务：

- 增加单领域挂载回归测试。
- 增加 capability lock 测试。
- 增加 baseline/deviation 测试。
- 增加旧 Workspace 兼容测试。
- 准备一页快速使用说明。
- 准备 negative 示例需求和脱敏 PRD。

验收：

- `npm run check` 通过。
- 核心回归测试通过。
- 新机器按快速指南可以启动。

## 6. B 轨：Domain Harness 能力建设工作包

### KB-01 negative 知识目录增量骨架

目标：保留全部现有目录，只新增清晰技术知识分层。

新增：

```text
catalog/       已审核的技术索引和关系
discovery/     自动发现的候选结果
quality/       知识质量规则和报告
connectors/    数据库、Apollo、Graphify 等能力声明
```

任务：

- 更新 `.module-manifest.yaml` 新入口。
- 标明 `docs/domain/` 为外部同步、只读产品知识。
- 标明 `catalog/` 为人工审核的技术索引。
- 标明 `discovery/` 不得直接作为确定事实。

验收：

- 不删除、不迁移、不重命名现有内容。
- 不影响现有同步任务。
- Workflow 可以在没有新内容时兼容读取。

### KB-02 现有知识源盘点和入口映射

目标：先让已有知识可被检索和引用，不急着重新生成全部内容。

盘点：

- `docs/domain/` 产品白皮书。
- `docs/memory/` 需求和系统影响记忆。
- 六个绑定代码仓和 `project-info.md`。
- `graphify-out/graph.json`。
- negative Analyst/Operator/Reviewer Skills。
- Agent 和 Engineering Rules。

输出：

- 知识源清单。
- 每个来源的 owner、更新方式、可信级别和读取场景。
- 缺失项列表。

验收：

- Agent 能明确知道先读什么、何时回读代码。
- 产品同步内容与人工技术知识不会混写。

### KB-03 一个真实功能纵向知识样本

目标：不用六个仓库全覆盖，先证明领域知识能帮助一个真实需求。

建议选择“负激励账单查询或导出”作为样本，最少形成：

```text
一个功能
  -> 涉及应用
  -> 页面/API/Job 入口
  -> 关键 Service/Mapper
  -> 关键表
  -> Feign/MQ/任务关系
  -> 风险
  -> 回归与冒烟入口
```

要求：

- 每个技术关系都有代码路径、symbol 或人工确认作为证据。
- 自动扫描内容先进入 `discovery/`。
- 人工确认后才进入 `catalog/`。
- 不复制大段源码或白皮书正文。

验收：

- 使用该样本后，技术方案能更快定位入口和影响面。
- Pilot User 不需要从六个仓库重新盲搜。

### KB-04 领域知识初始化/整理 Skill

目标：把一次性的人工知识整理过程变成可复用能力。

Skill 负责：

- 盘点已有材料。
- 引导输入已知表、应用和关键入口。
- 调用代码/Graphify/数据库发现能力。
- 整理 discovered 结果。
- 识别知识缺口。
- 生成 catalog 变更提案。

脚本负责：

- 创建新增目录。
- 校验 manifest 和 schema。
- 合并经批准的 change set。
- 计算覆盖率、revision 和 hash。

验收：

- 第二个领域初始化时不需要重新发明流程。
- Skill 不直接覆盖已审核 catalog。

### KB-05 知识质量和覆盖率门禁

目标：领域知识不仅“有文件”，还要知道是否可信和过期。

最小检查：

- manifest 引用存在。
- 绑定应用可定位。
- catalog 入口的代码文件和 symbol 存在。
- 表关系有证据。
- `verifiedAt` 未超过 freshness policy。
- 自动发现未伪装成 verified。

验收：

- 输出 `passed/warning/blocked`。
- 质量问题不阻塞历史 Workspace 读取，但会影响新需求是否可把它当确定事实。

### KB-06 外部 Provider

后续顺序：

1. Java 代码入口发现。
2. 数据库表结构和表到 Mapper/Entity 反查。
3. Apollo 配置查询。
4. MQ/XXL-JOB 元数据。
5. HTTP/MCP 冒烟执行。

所有 Provider 只输出统一 discovery result，不直接写 catalog。

## 7. 单人夜间关键路径

### 8 月 3 日晚：领域挂载和上下文

建议控制在 2～3 小时：

1. 用 30 分钟确认 WP-00 字段，不扩展通用 schema。
2. 实现 WP-01：读取 negative manifest、revision 和主要入口。
3. 实现 WP-04 最小版本：将 PRD、当前代码目录和 Domain Harness 摘要注入现有 handoff。
4. 顺手完成 KB-02 的最小知识源映射，不创建完整 catalog。
5. 跑现有关键回归。

当晚验收：现有页面或 CLI 能创建/打开绑定 negative 的 Workspace，Agent 能读到 PRD、代码路径和领域知识入口。

停止条件：如果领域挂载还未跑通，不开始页面调整和知识目录建设。

### 8 月 4 日晚：方案、单测和冒烟设计

建议控制在 2～3 小时：

1. 不新增复杂 Agent 编排，扩展现有技术方案步骤输出。
2. 生成 `technical-design.md`、`unit-test-design.md` 和 `smoke-test-design.md`。
3. 调整正式文档/`process/` 路径，新 Workspace 先使用新结构。
4. 技术确认时记录三个文档 hash；完整 baseline 管理不够时间时先用一个 JSON 文件实现。
5. 更新现有 `sqs-spec` 挂载/提示契约，不在本项目复制公司 Skill。

当晚验收：一个真实 PRD 能在开发前形成可评审方案、单测设计和冒烟设计，并一次性确认。

停止条件：如果测试设计没有真实关联 PRD 和代码入口，不继续做 UI 美化。

### 8 月 5 日晚：开发后反验 Alpha

建议控制在 2～3 小时：

1. 复用现有 `06-generate-unit-tests`，先改造成读取冻结测试设计的反验步骤，不急于修改 step id。
2. 输出最小追溯矩阵和失败归因。
3. 在现有产物或确认页面增加冒烟状态录入，不新建通用 Runner。
4. 执行 syntax check、关键回归和一次本地端到端 smoke。
5. 打包 Alpha，并写 5～10 行最短使用说明。

当晚验收：自己能够完成“创建 → 方案与测试设计 → 冻结 → 模拟开发完成 → 测试反验”的核心闭环。

### 8 月 6 日晚：普通组员可用性

1. 只修影响上手的页面和目录问题。
2. 隐藏过程文件，突出下一步和正式产物。
3. 补 capability revision lock。
4. 准备首位 Pilot User 使用。

当晚验收：组员无需理解 executor 配置和内部 step id。

### 8 月 7 日晚：领域知识 Seed

1. 完成 KB-01 增量目录骨架。
2. 完成 KB-03 一个真实功能纵向知识样本。
3. 用真实需求检查领域知识是否减少重复找代码。
4. 记录 KB-04 初始化/整理 Skill 的真实输入输出，不急着全部实现。

当晚验收：negative 至少有一个可复用、带代码证据的领域技术样本。

## 8. 关键依赖与砍项顺序

关键路径：

```text
WP-00
  -> WP-01
  -> WP-04
  -> WP-05
  -> WP-06
  -> WP-08 最小回归
  -> 周三 Alpha

周三 Alpha
  -> WP-07 / capability lock
  -> PILOT-01
  -> KB-01 / KB-03
```

时间不足时按以下顺序砍项：

1. 先砍知识健康度可视化。
2. 再砍知识更新提案扩展。
3. 再砍周三页面改版，复用现有页面和 CLI。
4. 再砍完整 capability lock，暂时只记录来源路径。
5. 再砍旧 Workspace 自动目录迁移，仅让新 Workspace 使用新结构。
6. 再砍第二位无指导试用。

不能砍：

- 单领域约束。
- PRD、代码、领域知识三方上下文。
- 测试设计前置和冻结。
- 开发后反验入口。
- 新 Workspace 的正式文档/过程文件基本分层。
- 不配置 Codex/Claude 的直接使用路径。

## 9. 试用反馈指标

### 使用效率

- 从启动到创建 Workspace 的时间。
- 从创建 Workspace 到开始需求澄清的时间。
- 用户填写的配置项数量。
- 用户是否需要开发者现场解释目录或步骤。

### 方案质量

- 领域知识是否帮助定位代码入口。
- 技术方案待确认问题数量和类型。
- 单测是否覆盖主要 PRD 条目。
- 开发后是否发现方案遗漏或 PRD 歧义。

### 产品复杂度

- 用户是否进入高级配置区。
- 用户是否直接打开大量过程文件。
- 页面上无法理解的按钮或术语。
- Codex/Claude 切换是否影响流程恢复。

### 知识价值

- 本次需求发现了多少稳定领域知识。
- 哪些知识来自白皮书、代码、人工确认或工具发现。
- 哪些知识可以进入 catalog。
- 下一个相似需求是否减少重复搜索。

## 10. 周三后的优先顺序

周三试用后，不立即扩页面功能。先根据试用结果推进：

1. 修复影响上手和方案质量的问题。
2. 完成 KB-04 领域知识初始化/整理 Skill。
3. 完成 KB-05 知识质量门禁。
4. 扩展知识更新 change set。
5. 再接代码、数据库、Apollo 和冒烟 Provider。

最终判断标准不是功能数量，而是：

> Workflow 是否让普通组员更快形成可信方案；Domain Harness 是否让下一次需求少做重复调查；冻结测试是否能在开发后发现真实偏差。
