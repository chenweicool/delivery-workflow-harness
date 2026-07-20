# 08 交付总结

## 目标

总结本次交付结果，并提出可复用的公共知识改进建议。

所有输出必须使用中文。只有代码符号、命令、文件路径、类名、方法名、分支名和固定协议术语保留原文。

## 输出要求

- 内容保持简洁，只写本次交付真实发生的变更、验证和风险。
- 不要写泛泛兜底、无意义免责声明或未执行验证的结论。
- 公共知识改进建议必须具体到模板、规则、业务术语、应用索引或 skill，不要写空泛建议。

## Skill 使用策略

- 如可用，优先参考 `code-review` 描述残余风险；涉及接口文档变更或生成时参考 `api-doc-generation`；存在测试缺口时参考 `java-unit-test`。
- 如果 skill 可用，用它让交付总结和知识改进建议更具体。
- 如果 skill 不可用，继续按本命令文件执行，并在 `delivery/knowledge-improvement.md` 中记录缺失能力。

## 允许读取

- `AGENTS.md`
- `context/**`
- `prd/**`
- `design/**`
- `tasks/**`
- `review/**`
- `apps/**` 下已确认应用 diff

## 禁止事项

- 禁止修改共享公共仓库文件。
- 禁止在公共知识建议中包含敏感需求细节。
- 禁止声称执行了实际未执行的验证。

## 输出

写入：

- `delivery/delivery-summary.md`
- `delivery/knowledge-improvement.md`

## `delivery/delivery-summary.md` 必须章节

```md
# 交付总结

## 1. 需求概述

## 2. 已实施任务

## 3. 变更应用

## 4. 验证情况

## 5. 发布说明

## 6. 剩余风险
```

## `delivery/knowledge-improvement.md` 必须章节

```md
# 公共知识改进建议

## 1. 模板改进

## 2. 规则改进

## 3. 业务术语改进

## 4. 应用索引改进

## 5. Skill 改进
```
