# AI 需求交付 Workspace

本 workspace 是由共享 `delivery-workflow` 模板生成的单需求执行区。

## 核心规则

- 开始任何交付流程前，必须先读取本文件。
- 按阶段执行 `.workflow/commands/` 下的命令文件。
- 执行前先阅读 `.workflow/commands/README.md`，确认当前命令所属的交付生命周期、正式产物和人工确认点。
- 禁止跳过人工确认点。
- 实施阶段明确批准前，禁止修改代码。
- 未经人工确认，禁止扩大应用范围。
- 本需求相关过程文件必须保存在当前 workspace 内。
- 进度文件由 `dw done` 统一维护，Agent 不直接编辑 `.workflow/progress.md` 和 `.workflow/progress.json`。
- 禁止把需求过程文件写回共享公共 AI 仓库。
- 开始工作前必须阅读 `context/demand-context.md`、`context/domain-summary.md` 与 `context/capabilities.md`。`domain-summary.md` 可能明确当前未挂载领域 Harness，这不是阻塞项。实施、Review、测试和交付阶段还必须先阅读 `context/current-context.md`（若存在），再读取其指向的已批准方案、测试基线和确认记录。只读取其中标记为“本步骤启用 / available”的 skills / rules；未挂载或 unavailable 的能力不是前置条件，按当前命令的降级流程继续。
- 挂载能力的只读链接位于 `context/skills/linked` 和 `context/rules/linked`；Skill 必须由用户显式安装后才会启用。不得向这些公共源写入需求过程文件；未安装的推荐 Skill 不得阻断当前阶段。
- 所有面向用户的输出和 workspace 文档必须使用中文。
- 输出保持简洁并聚焦当前阶段；不要添加泛泛免责声明、仪式化总结或对下一步没有帮助的宽泛兜底内容。
- 证据不足时，只记录具体缺失输入或阻塞问题；不要写模糊兜底段落。

## 目录说明

```text
context/          本需求共享知识快照
prd/              产品 PRD、附件、模板、样例、截图
design/           根目录仅放正式方案与测试基线；过程、确认、审批和模板分别在 process/、approvals/、templates/
tasks/            根目录仅放实施任务清单；确认和进度在 process/，审批在 approvals/
apps/             人工确认后的应用 worktree
review/           根目录放质量结论；过程记录在 process/，测试和追溯证据在 evidence/
delivery/         上线 checklist、交付总结和完成统计报告
archive/          知识更新提案、知识卡片和归档索引；外部推送计划在 process/
.workflow/        阶段命令模板和 workflow 本地元数据
```

## 进度回写

- 每个阶段开始前先读取 `.workflow/progress.md`。
- 当前阶段完成后执行 `dw done --workspace <path> --step <step-id> --summary "完成说明"`。
- 如果无法继续，执行 `dw done --workspace <path> --step <step-id> --status blocked --summary "具体阻塞原因"`。
- 产物会被校验，但不会自动把阶段标记为完成。

## ChangeSet 与 Candidate

- 产品口径变化、技术方案调整、缺陷修复、仅验证和 Hotfix 必须先创建 ChangeSet；不要覆盖旧批准或旧证据。
- 创建代码候选：`dw candidate create --workspace <path> [--change <change-id>]`。Candidate 固定 PRD、设计基线和应用代码快照。
- 代码 Review、单测、冒烟和 UAT 证据必须绑定同一个有效 Candidate。执行 Review、单测或冒烟步骤的 `dw done` 会自动绑定正式证据；Candidate 变化后必须创建新 Candidate 并重新验证。
- 需要从某节点重做时，使用 `dw reopen --from <step-id> --reason "原因" --workspace <path>`；它会保留旧审批记录并标记为已替代。
- 不要直接修改 `.workflow/progress.*`。状态提交应携带当前 revision；旧 revision 会被拒绝，网络重试使用同一 `--idempotency-key`。

## 平台定位

本平台是需求交付的 Harness / Leader 层：

- 定义标准节点、输入输出、人工确认点、质量门禁和归档协议。
- 调度 Codex / Claude / skills / rules / 本地工具等执行资源。
- 通过 workspace 文件承接交接、状态、产物和知识沉淀。
- 具体分析、方案生成、代码实现、单测、review 和调整，仍由 Codex / Claude 在目标项目上下文中完成。

## 交付生命周期与命令

```text
需求资料
  -> 研发实施
  -> 验证
  -> 交付结果
```

页面按上述生命周期组织信息；命令仍按输入输出执行，不得仅因页面分类而跳过前置条件或人工确认。完整映射见 `.workflow/commands/README.md`。

每个节点可以按输入输出单独运行，也可以被团队封装成更短的场景，例如：

- PRD -> 需求澄清。
- PRD -> 技术方案。
- 技术方案 -> 任务拆分。
- 任务 -> 代码实现。
- 代码变更 -> Review。
- 代码变更 -> 单测补齐。
- 验证结论 -> 上线 Checklist。
- 交付结果 -> 知识归档。
- 需求确认完成后，通过页面“确认完成并生成”或 `dw report complete --workspace <path>` 生成 `delivery/delivery-report.json`；该报告用于后续 Harness 使用效果统计，不包含代码或敏感信息。

## 必须人工确认点

以下阶段完成后必须暂停并等待人工确认：

- 需求澄清完成。
- 技术方案完成。
- 任务拆分完成。
- 上线 Checklist 存在阻塞项。
- 归档推送远端知识库前。

## 必须暂停条件

如果工作涉及或发现以下情况，必须立即暂停：

- 数据库结构变更。
- 金额、费用、报价、账单、结算、应付、清分逻辑。
- 跨应用 API 请求或响应变更。
- 删除既有行为。
- 共享组件变更。
- 技术方案与真实代码不一致。
- 需要修改未确认应用。
- 应用、表、MQ topic、job 或外部依赖归属不明确。

## 实施规则

- 修改文件前，说明任务编号和计划修改文件。
- 只实现已确认任务。
- 代码变更后更新 `review/process/change-log.md`。
- 自检后更新 `review/process/self-check.md`。
- Review 和总结必须基于 `git diff`。
