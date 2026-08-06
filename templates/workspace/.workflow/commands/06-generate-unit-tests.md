# 08 生成单测

## 目标

基于已确认任务、技术方案、代码变更和 AI Review 结果，生成或补齐必要单测，并记录验证结果。

本节点属于质量检查节点。平台只定义单测标准和输出协议；具体补测、运行命令和修复由 Codex / Claude 在目标应用 worktree 中完成。

本节点默认只做单测。集成测试先生成计划，只有目标项目已经存在明确的集成测试框架、启动命令和依赖环境时才执行。

所有输出必须使用中文。只有代码符号、命令、文件路径、类名、方法名、分支名和固定协议术语保留原文。

## 输出要求

- 只补充和本次任务相关的测试。
- 优先覆盖本次 diff 触达的代码分支、边界条件、异常路径、兼容性风险和 Review 发现的问题。
- 优先复用目标项目现有测试框架、测试基类、mock 风格和断言方式。
- 测试计划要简洁，说明覆盖点、测试文件和执行命令。
- 测试结果必须区分“已执行通过”“已执行失败”“未执行”，禁止声称执行了实际未执行的验证。
- 如需改动生产代码才能测试，只允许做最小可解释改动，并写明原因。

## Skill 使用策略

- 如当前步骤已路由到可用的单元测试能力，优先按该能力的 `SKILL.md` 执行；不得假设某个特定 Skill 名称已安装。
- 如果当前不是 Java 项目，按目标项目现有测试框架执行。
- 如果缺少测试能力或环境，写入具体阻塞点，不写泛泛建议。

## 允许读取

- `AGENTS.md`
- `context/**`
- `prd/**`
- `design/**`
- `tasks/task-list.md`
- `tasks/process/task-confirmation.md`
- `tasks/process/task-progress.md`
- `review/process/change-log.md`
- `review/process/self-check.md`
- `review/quality-report.md`
- `review/evidence/risk-list.md`
- `apps/**` 下已确认应用代码、测试和 git diff

## 允许修改

- 目标应用中的测试文件。
- 为测试暴露必要接缝的最小生产代码改动，但必须写入 `review/evidence/unit-test-result.md`。
- `review/evidence/unit-test-plan.md`
- `review/evidence/unit-test-result.md`
- `.workflow/progress.md`
- `.workflow/progress.json`

## 禁止事项

- 禁止扩大业务实现范围。
- 禁止为了测试改动核心业务语义。
- 禁止删除或弱化已有测试。
- 禁止引入目标项目未使用的新测试框架，除非人工明确确认。
- 禁止在缺少环境的情况下声称已执行集成测试。

## 输出

写入：

- `review/evidence/unit-test-plan.md`
- `review/evidence/unit-test-result.md`

## `review/unit-test-plan.md` 必须章节

```md
# 单测计划

## 1. 覆盖目标

## 2. 测试文件

## 3. 执行命令

## 4. 暂不覆盖原因
```

## `review/evidence/unit-test-result.md` 必须章节

```md
# 单测结果

## 1. 新增或调整测试

## 2. 执行结果

## 3. 失败或未执行原因

## 4. 生产代码接缝改动

## 5. 剩余测试缺口
```

## 集成测试处理

如果项目已有集成测试能力，追加到 `review/evidence/unit-test-plan.md` 的“集成测试计划”小节并说明是否执行。

如果没有可识别入口，只写计划和阻塞原因，不新增未知框架。

