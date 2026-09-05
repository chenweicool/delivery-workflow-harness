# Claude Code 交付指令

本 workspace 遵循共享 AI 需求交付流程。`AGENTS.md` 是主要 workspace 规则文件。

平台定位是 Harness / Leader 层：定义标准节点、输入输出、确认点、质量门禁和归档协议；具体执行由 Claude Code / Codex 在目标项目上下文中完成。

## 启动要求

任何分析或实现开始前：

1. 读取 `AGENTS.md`。
2. 读取 `.workflow/commands/README.md`，确认当前命令所属的交付生命周期、正式产物和人工确认点。
3. 执行 `.workflow/commands/` 中的当前阶段命令。不要假设所有节点必须线性执行，先以 `.workflow/progress.md` 和当前命令文件为准。
4. 严格遵循当前阶段命令。
5. 阶段完成或阻塞时执行 `dw done` 回写状态；不要直接编辑 `.workflow/progress.md` 和 `.workflow/progress.json`。

## 边界

- 实施任务确认前，禁止修改代码。
- 禁止自动执行 worktree 设置，除非当前阶段明确要求。
- 禁止只根据关键词假设应用范围。
- 禁止把需求过程文件写入共享公共 AI 仓库。
- 开始工作前读取 `context/demand-context.md`、`context/domain-summary.md` 与 `context/capabilities.md`；`domain-summary.md` 可能明确当前未挂载领域 Harness，这不是阻塞项。实施、Review、测试和交付阶段还必须读取 `context/current-context.md`（若存在）及其指向的已批准产物。后者是当前需求能力快照。只读取当前步骤标记为 `available` 的能力，未挂载能力按命令文件的降级流程处理，不得阻断阶段。
- Skill 为目录时先阅读其中的 `SKILL.md`，Rule 为文件时先阅读规则正文；公共源只读，链接位于 `context/skills/linked` 和 `context/rules/linked` 下。
- 产品口径变化、方案调整和缺陷修复先创建 ChangeSet；Review、单测和冒烟完成前必须有有效 Candidate，且证据由 `dw done` 绑定到该 Candidate。
- 不要直接修改 `.workflow/progress.*`。状态提交应携带当前 revision；旧 revision 会被拒绝，网络重试使用同一 `--idempotency-key`。

## 输出纪律

- 阶段产物必须写入命令文件指定路径。
- 阶段状态必须通过 `dw done` 写入。
- 未解决问题必须记录，不要猜测。
- 依赖代码验证的假设必须标记为待代码确认。
- 到达 `AGENTS.md` 中的强制确认点时，必须暂停等待人工 review。
- 上线 Checklist 存在阻塞项、归档推送远端知识库前，必须暂停等待人工确认。
- 所有面向用户输出和 workspace 文档必须使用中文。
- 结论保持简洁，直接服务当前阶段。
- 除非命令输出结构要求，禁止添加泛泛免责声明、宽泛兜底内容或重复总结。
