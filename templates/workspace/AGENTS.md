# Delivery Workflow V3

本 Workspace 采用“结果驱动、风险触发”的交付模型。Agent 负责围绕用户目标自主完成理解、设计、实现、Review、测试和修复，不得把固定阶段或过程文档当成工作的前置条件。

## 开始工作

1. 读取 `context/demand-context.md`、`input/request.md`（若存在）、`.workflow/workspace.json` 和必要的当前代码。
2. 读取 `.workflow/commands/execute-delivery.md`，在一个 Work Run 内持续推进到可交付。
3. 用户反馈、需求变动和普通缺陷直接进入当前 Work Run；修改后重新执行相关测试，不重开需求、方案或任务流程。
4. 只有命中“风险决策边界”时暂停。

## 风险决策边界

以下变更在实施前必须执行 `dw risk report`，写明范围、影响和回滚方案，并等待人工批准：

- `database`：数据库结构、迁移、不可逆数据写入。
- `financial`：金额、费用、报价、账单、结算、应付、清分语义。
- `api-contract`：跨应用或公共 API 契约兼容性。
- `deletion`：删除既有行为、数据或兼容路径。
- `shared-component`：共享组件或多应用公共能力。
- `external-write`：生产、远端平台或外部系统写操作。
- `ownership-unknown`：应用、表、MQ、Job 或外部依赖归属不明。

低风险修改无需创建风险记录，也无需人工逐步确认。

## Skill 与 Rule

- Skill 只有在用户执行 `dw skill install` 后才算安装，并且只有 enabled 的 Skill 才可使用。
- Harness、团队 Profile 或领域材料中的推荐 Skill 默认不安装、不启用，也不得阻塞交付。
- Rule 可以作为约束读取，但不能把 V3 重新扩展成固定阶段流水线。

## 目录

```text
input/             需求原件、附件和规范化后的 request.md
context/           本次需求与可选领域上下文快照
apps/              可选应用 worktree
workspace/         Agent 按复杂度创建的临时分析、中文技术方案或 Review 笔记
delivery/          三份正式交付物
.workflow/         机器状态、风险决策和最终发布确认
```

过程文件是工作记忆，不是门禁。复杂需求可使用中文文件名，例如 `workspace/技术方案.md`；简单修改可以不创建任何过程文件。

## 正式交付契约

最终必须形成且只强制要求：

1. `delivery/unit-test-report.md`：真实 Surefire/Failsafe XML 汇总。
2. `delivery/coverage-report.md`：真实 JaCoCo XML 字节码覆盖率汇总。
3. `delivery/release-config.yaml`：应用、分支、提交、代码指纹、配置、观测和回滚。

运行应用测试和 JaCoCo 后执行：

```bash
dw delivery collect --workspace <path>
dw delivery validate --workspace <path>
```

禁止手写或伪造测试数、覆盖率和“通过”结论。代码变化后必须重新生成交付物。

validate 返回 ready 后，执行：

```bash
dw done --workspace <path> --step execute-delivery --summary "三份交付物已生成并校验"
```

最终发布始终需要人工确认；Workflow 不自动发布、不自动写远端系统。
