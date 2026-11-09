# Delivery Workflow Domain Context

## Work Run

Agent 围绕当前用户目标自主执行理解、设计、实现、Review、测试和修复的连续循环。需求变化和普通缺陷更新 Work Run 的目标，不创建新的固定流程实例。

## Risk Decision

高风险变更与自主执行之间的人工决策 Seam。只有数据库、资金语义、公共契约、删除、共享组件、外部写入或归属不明会触发；低风险变更不创建记录。

## Delivery Contract

正式交付必须同时具备单元测试报告、JaCoCo 字节码覆盖率报告和发布配置，并绑定相同代码指纹。

## Verification Evidence

由 Surefire/Failsafe 和 JaCoCo 原始报告生成的事实。Agent 不得用计划、估算或手写结论替代工具证据。

## Release Config

描述待发布应用、分支、提交、代码指纹、风险决策、配置、发布顺序、观测和回滚的机器可读清单。最终发布由人确认。

## Architecture Vocabulary

- Module：`risk-decision` 与 `delivery-artifacts` 是 V3 的两个核心模块。
- Interface：用户主要使用 `dw risk`、`dw delivery`、`dw done` 和控制台。
- Implementation：Git 快照、XML 解析、Markdown/YAML 生成和状态存储属于内部实现。
- Depth：少量命令封装完整风险与证据不变量，属于 Deep Interface。
- Seam：Risk Decision 是自主执行与人工授权的唯一条件式接缝。
- Adapter：`dw input import`、飞书和 Domain Harness 只负责把外部材料适配到 Workspace。
- Leverage：三份交付物同时服务 Review、发布核对、审计和后续平台接入。
- Locality：需求过程记忆留在 `workspace/`，正式证据集中在 `delivery/`，机器状态集中在 `.workflow/`。
