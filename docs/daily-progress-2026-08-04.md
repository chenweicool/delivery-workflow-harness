# 2026-08-04 进度说明：Domain Workspace v2

## 今日结论

Workflow 已从“技术方案后补测”调整为“开发前设计并冻结测试、开发后独立反验”的 Domain Workspace v2。当前已通过模拟领域 Harness 的 API 回归和 CLI smoke，并已使用 policy-platform 的真实 PRD、领域 Harness、`master` 代码和专用开发分支完成一次研发交付闭环；真实数据库 / 账期冒烟按研发决定暂缓。

本版本明确不提供旧 Workspace、旧路径或 `whitepaperContext` 的兼容与迁移。

## 已完成

- 新流程增加 `03-design-tests`、`08-verify-tests`、`09-run-smoke`。
- 技术确认同时审核技术方案、单测设计和冒烟设计；批准后生成三份 `.workflow/baselines/*.lock.json`。
- 设计文档 hash 变化可被识别为 `deviation-required`。
- 质量 Gate 使用测试设计、冻结基线、单测结果、追溯矩阵和冒烟结果作为证据。
- 新建 Workspace 生成 v2 workflow definition；质量摘要和知识更新提案改为以 Domain Harness 为中心。
- 更新 API 回归和 CLI smoke，验证 baseline 冻结、校验和新质量 Gate。
- 使用真实需求完成“导入 PRD → 上下文装配 → 技术方案与测试冻结 → 实施 → 独立 Review → 测试反验 → 交付 Checklist”的闭环，生成追溯矩阵和手工冒烟阻塞记录。
- 补充面向普通研发的 [快速使用说明](quick-start.md)，明确从控制台交接到 Codex / Claude Code、回写交付证据和返回页面确认的路径。

## 已验证

```text
npm run test:regression
  - whitepaper catalog check（遗留独立工具）
  - API regression（包含 Domain Workspace v2 baseline）
  - CLI smoke
```

## 尚未完成 / 不得误判为完成

- 未执行真实数据库 DDL、真实 SR 数据、真实账期的端到端冒烟。
- policy-platform 已有 `catalog/` 与功能纵向样本；`discovery/`、`quality/`、`connectors/` 仍只有目录骨架，尚未接入 Provider 或质量门禁。
- 首位普通研发的无指导试用尚未执行；页面已完成最小主路径收敛，后续仅根据试用反馈优化。

## 下一步

1. 恢复测试环境后执行 policy-platform 的 DDL 与 9 个手工冒烟场景。
2. 以 policy-platform 样本归纳“盘点、发现、审核入库和变更提案”的最小 Skill 契约，再推广到其他领域模块。
3. 组织首位普通组员按快速指南无指导试用，并根据反馈优化页面与命令。
