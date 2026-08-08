# 命令与交付生命周期

页面按“概览、需求资料、研发实施、验证、交付结果”组织信息；命令仍以输入、输出和人工确认点驱动执行。页面分类不改变既有依赖顺序，也不允许跳过人工确认。

## 需求资料

| 命令 | 目标 | 正式产物 |
| --- | --- | --- |
| `00-import-and-parse-prd.md` | 导入并解析原始需求材料 | `prd/document.md`、附件快照 |
| `00-load-context.md` | 加载领域和应用上下文 | `design/process/context-summary.md` |
| `01-clarify-requirement.md` | 形成需求口径和待确认事项 | `design/process/requirement-confirmation.md` |

本需求执行配置位于页面“需求资料”内：交付视角、代码上下文加载开关和建议分支格式。实际基线/实施分支必须以研发确认记录为准。

## 研发实施

| 命令 | 目标 | 正式产物 |
| --- | --- | --- |
| `02-generate-technical-design.md` | 形成可实施技术方案 | `design/technical-design.md`、`design/process/technical-confirmation.md` |
| `03-design-tests.md` | 冻结单测设计基线 | `design/unit-test-design.md` |
| `05-split-tasks.md` | 拆分可确认的实施任务 | `tasks/task-list.md` |
| `06-implement-task.md` | 实施单个已确认任务 | `tasks/process/task-progress.md`、`review/process/change-log.md`、`review/process/self-check.md` |

技术方案和任务拆分完成后，必须分别等待人工确认，才可进入后续阶段。

## 验证

| 命令 | 目标 | 正式产物 |
| --- | --- | --- |
| `07-review-code.md` | 基于真实 diff 进行代码评审 | `review/quality-report.md`、`review/evidence/risk-list.md` |
| `06-generate-unit-tests.md` | 补齐必要单测并记录真实结果 | `review/evidence/unit-test-result.md` |
| `08-verify-tests.md` | 形成需求到实现、测试的追溯结论 | `review/evidence/unit-test-result.md`、`review/evidence/traceability-matrix.md` |
| `09-run-smoke.md` | 执行研发提测前提供的冒烟用例 | `review/evidence/smoke-test-case.md`、`review/evidence/smoke-test-result.md` |

页面中的确认状态只汇总必需证据与人工确认结果；不得将“未执行”或“计划执行”标记为通过。

## 交付结果

| 命令 | 目标 | 正式产物 |
| --- | --- | --- |
| `09-release-checklist.md` | 形成上线前检查和回退结论 | `delivery/release-checklist.md` |
| `08-delivery-summary.md` | 形成交付总结和知识改进建议 | `delivery/delivery-summary.md`、`archive/knowledge-update-proposal.md` |
| `10-archive-knowledge.md` | 形成可回看、可复用的本地归档 | `archive/index.md`、`archive/knowledge-card.md` |

需求确认完成后，使用页面“确认完成并生成”或执行 `dw report complete --workspace <path>` 写入 `delivery/delivery-report.json`。该动作会固定需求完成时间，重复执行不会覆盖已生成报告。

外部系统推送、发布执行或知识库写入均需单独取得授权；命令默认只生成本地证据和计划。仅当 `dw report complete --workspace <path>` 或 `dw report submit --workspace <path>` 返回 `submission: submitted` 且生成 receipt 时，才可表述“已推送远端智审平台”。
