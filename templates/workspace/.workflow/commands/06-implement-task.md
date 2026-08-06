# 06 单任务实现

## 目标

结合 `tasks/task-list.md` 和 `tasks/process/task-confirmation.md`，只实现一个已确认任务。

## 必要用户输入

用户必须提供任务编号，例如 `T001`。

## 输出要求

- 输出给用户的总结必须是中文。
- 写入 workspace 的 `tasks/**`、`review/**` 内容必须是中文。
- 代码符号、命令、文件路径、类名、方法名、分支名和固定协议术语保留原文。
- 总结保持简洁，只说明改了什么、验证了什么、剩余什么风险。
- 不要添加泛泛兜底、无意义免责声明或与当前任务无关的建议。

## 允许读取

- `AGENTS.md`
- `context/**`
- `prd/**`
- `design/**`
- `tasks/task-list.md`
- `tasks/process/task-confirmation.md`
- `tasks/process/task-progress.md`
- `apps/**` 下已确认应用代码
- `.workflow/workspace.json` 中记录的源应用路径

## 允许修改

- `apps/**` 下已确认应用 worktree 中与选中任务必要相关的文件。
- `tasks/process/task-progress.md`
- `review/process/change-log.md`
- `review/process/self-check.md`
- `.workflow/evidence/capability-degradation.md`

## 禁止事项

- 禁止实现选中任务之外的内容。
- 禁止修改未确认应用。
- 禁止直接修改 `.workflow/workspace.json` 中记录的源应用目录。
- 禁止做与选中任务无关的大范围重构。
- 禁止删除既有行为，除非已明确确认。

## 必须流程

1. 先读取 `tasks/process/task-confirmation.md`，确认当前人工确认批次中选中的任务。
2. 校验选中任务是否明确列入“允许 AI 实施”，且任务明细中标记为 `允许 AI 实施`。
3. 如果任务被暂缓、退回、缺失、编号不明确或仍需人工确认，必须停止，不得修改代码。
4. 读取 `tasks/task-list.md`，以其中的范围、文件、验收标准和依赖作为实施细节来源。
5. 如果 `tasks/task-list.md` 与人工确认结果冲突，必须停止并等待人工确认。
6. 先读取 `context/capabilities.md`，只使用当前步骤标记为 `available` 的能力。任务声明的推荐 skill 未挂载时，不得默认暂停：按任务类型执行降级流程（例如 Java 单测复用项目现有测试模式并运行 Maven，文档解析直接读取可访问材料，代码审查使用命令内置检查清单），并在 `.workflow/evidence/capability-degradation.md` 记录缺失能力、替代方式和未覆盖范围。仅当缺少的能力导致关键业务事实无法获得时，才停止并列出具体缺失事实。
7. 接口文档类任务推荐读取 `design/technical-design.md`、`prd/**`、Controller、Request / Response DTO、枚举、统一返回体和分页对象，再输出正式接口文档或接口变更文档。
8. 确保每个涉及应用在 `apps/<app-name>` 下有本需求专用 git worktree。
9. 如果 `apps/<app-name>` 不存在，按 `.workflow/workspace.json` 中应用配置创建。
10. worktree 创建后，禁止编辑源应用路径；所有代码改动必须发生在 `apps/<app-name>` 下。
11. 读取或创建 `tasks/process/task-progress.md`，在改代码前将选中任务标记为 `实施中`。
12. 修改文件前先说明计划改动文件。
13. 只实现选中任务。
14. 条件允许时运行聚焦验证。
15. 在应用 worktree 下查看 `git diff`。
16. 更新 `review/process/change-log.md`。
17. 更新 `review/process/self-check.md`。
18. 更新 `tasks/process/task-progress.md`，记录最终任务状态、变更文件、验证结果、剩余风险和下一建议任务。

## Worktree 规则

- Worktree 根目录：`apps/<app-name>`。
- 源仓库路径：读取 `.workflow/workspace.json` 中的 `apps[].sourcePath`。
- Worktree 路径：读取 `apps[].worktreePath`；默认使用 `apps/<app-name>`。
- 分支名：读取 `apps[].featureBranch`。
- 基准分支：读取 `apps[].baseBranch`；必须是研发确认的明确值，不允许回退到源仓库当前分支。
- 开发分支：读取 `apps[].featureBranch`；`apps[].suggestedFeatureBranch` 仅是候选命名，必须经研发确认后才可写入开发分支字段。
- 应用类型和 skills：读取 `apps[].type` 和 `apps[].skills`。
- 如果分支已存在于其他 worktree，必须停止并报告已存在路径，不得复用无关代码。
- 可通过 `git -C <source-repo> worktree add -b <feature-branch> <workspace>/<worktree-path> <base-branch>` 创建 worktree。

## `tasks/process/task-progress.md` 必须章节

```md
# 任务执行进度

## 当前批次

- 已确认可实施任务：
- 已完成任务：
- 当前任务：
- 下一建议任务：

## 任务状态

| 任务 | 状态 | 结果摘要 | 验证 | 风险 |
| --- | --- | --- | --- | --- |
```

## `review/process/change-log.md` 必须章节

```md
# 变更记录

## 任务

## 变更文件

## 行为变化

## 验证

## 剩余风险
```

## `review/process/self-check.md` 必须章节

```md
# 自检

## 范围检查

## 规则检查

## 风险检查

## 测试检查

## Diff 摘要
```
