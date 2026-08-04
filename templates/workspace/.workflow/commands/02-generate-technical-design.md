# 02 生成技术方案

## 目标

在需求口径人工确认后，结合 PRD、上下文资料和真实代码，直接生成可用于拆分任务的技术方案。

本阶段不修改代码、不拆分任务。核心目标是按团队技术方案模板，把产品口径、应用范围、代码入口、接口边界、数据模型、字段映射、校验规则、实现步骤、风险、重要组件、数据库、接口定义、回滚预案和研发协作方案收敛到 `design/technical-design.md` 中，并把仍需人工拍板的问题沉淀到 `design/technical-confirmation.md`。单测与冒烟基线由后续 `03-design-tests` 单独生成，避免产物职责重叠。

## 前置边界

- 必须先存在 `design/requirement-confirmation.approved.json`，否则停止执行，并提示先完成人工需求确认。
- `design/requirement-confirmation.md` 是产品口径来源；不得绕过它直接按 PRD 或聊天假设生成最终技术方案。
- 本阶段可以提出技术确认项，但不能替代人工确认；影响编码的待确认问题必须写入 `design/technical-confirmation.md`。

## Skill 使用策略

- 只使用本步骤提示词和 `context/capabilities.md` 中标记为可用的 skills / rules；不得假设某个特定 skill 已安装。
- 能力未挂载或 unavailable 时，继续按本命令文件执行；仅在它导致关键事实无法取得时，记录具体缺失输入，而不是记录“缺少 skill”。
- 输出必须是中文。
- 输出保持简洁，面向实施；不要添加泛泛兜底、仪式化总结或需求文档中已有的重复背景。

本命令支持重复执行：

- 首次执行时，产出初版技术方案和待确认问题。
- 人工在 `design/technical-confirmation.md` 写入确认结果后，再次执行时，必须读取确认结果并修订 `design/technical-design.md`，让它成为可进入任务拆分的最终技术方案。
- 人工退回技术方案后，会在 `design/technical-review.md` 写入评审意见；再次执行时必须逐条处理评审意见，并更新修订记录。
- 如果人工已经明确确认的问题，不要再次作为待确认问题提出。

## 允许读取

- `AGENTS.md`
- `CLAUDE.md`
- `context/**`
- `prd/**`
- `design/context-summary.md`
- `design/requirement-confirmation.md`
- `design/scope-correction.md`
- `design/known-facts.md`
- `design/technical-design.template.md`
- `design/technical-design.md`
- `design/technical-confirmation.md`
- `design/technical-review.md`
- `design/technical-design.changelog.md`
- `apps/**`

## 禁止事项

- 禁止修改代码。
- 禁止产出实施任务清单。
- 禁止开始实现。
- 禁止把 `design/requirement-confirmation.md` 中“按假设继续”的内容当成最终结论。
- 禁止脱离真实代码编造类名、方法名、接口路径、DTO 字段、Mapper 或任务名。
- 禁止把 `design/scope-correction.md` 中“不关注”的内容展开成待实现项。

## 分析要求

1. 读取 `design/requirement-confirmation.md`，区分“已确认”和“按假设继续”的产品口径。
2. 如果存在 `design/scope-correction.md`，必须优先读取并严格按该文件收敛范围。
3. 根据 PRD 关键字、公共应用索引和用户提供的项目路径，确认本次涉及应用。
4. 如果存在 `design/known-facts.md`，必须读取其中的技术方案生成输入，包括建议涉及应用、建议代码入口、接口命名与定义、数据模型、历史数据处理和需要 AI 重点判断的问题。
4a. 如果存在 `context/domain-summary.md`，必须按其中的阅读顺序使用领域 Harness：领域白皮书和记忆用于补充边界/风险，本地可读代码用于确认现状；PRD / 人工确认与当前代码冲突时写入待确认项，不得自行裁决。
5. 读取 `apps/**` 下真实代码，定位已有页面入口、导入入口、导出入口、保存接口、校验逻辑、模板下载逻辑和回刷任务参考实现。
6. 读取 `prd/**` 中的模板或样例，抽取字段、表头、字段顺序和可能的校验规则。
7. 如果已存在 `design/technical-confirmation.md`，必须读取其中“确认结果”，并把已确认结论合并进 `design/technical-design.md`。
8. 如果已存在 `design/technical-design.md`，再次执行时应在原方案基础上修订，不要无意义重写结构或丢失人工补充内容。
9. 方案必须能直接支撑后续 `05 拆分实施任务`，不要只停留在候选分析。
10. 证据不足时必须写入 `technical-confirmation.md`，不要强行拍板。
11. 禁止重复提出产品阶段已经确认的问题。
12. 只保留会影响编码的技术确认项；不阻塞编码的内容放入“后续观察”。
13. 必须补充研发协作确认项，包括分支命名、基准分支、提交信息格式；如果涉及多个应用，必须分别给出建议。
14. `design/technical-design.md` 必须优先按 `design/technical-design.template.md` 的章节顺序和表格字段输出，不要自行改造成其他章节结构。
15. 如果某个团队模板章节本次不涉及，必须明确写“本次不涉及”或“本次无变更”，不要删除章节。
16. 接口定义章节必须列出新增或变更接口；如有已启用的接口文档能力，可在研发协作方案中引用，未启用时不作为阻塞项。
17. 如果存在 `design/technical-review.md`，必须逐条读取本轮及历史评审意见，并在 `design/technical-design.changelog.md` 中记录处理结果。
18. 对每条评审意见必须给出处理状态：已采纳、部分采纳、未采纳、转人工确认。未采纳或转人工确认必须说明原因。
19. 明确需要 `03-design-tests` 冻结的单测与冒烟范围、关键边界和风险来源；本阶段不另行创建测试计划文件。

## 输出

写入：

- `design/technical-design.md`
- `design/technical-confirmation.md`
- `design/technical-design.changelog.md`

## `technical-design.md` 输出结构

严格读取并使用 `design/technical-design.template.md`。不得删除团队模板章节；不涉及的章节写明“本次不涉及”或“本次无变更”。

## `technical-confirmation.md` 输出结构

```md
# 技术方案确认

## 当前阶段

## 需要人工确认的技术问题

| 状态 | 编号 | 来源问题 | 确认项 | 影响范围 | AI 推荐结论 | 人工确认结果 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |

## 研发协作确认

| 状态 | 编号 | 来源问题 | 确认项 | 影响范围 | AI 推荐结论 | 人工确认结果 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 待确认 | DEV-001 | 分支策略未确认 | 每个应用的基准分支 | 代码实现 | 由研发填写实际基准分支；未确认不得创建 worktree | 待人工补充 |  |
| 待确认 | DEV-002 | 分支策略未确认 | 每个应用的开发分支名称 | 代码实现 | 由研发填写团队约定名称；未确认不得创建 worktree | 待人工补充 |  |
| 待确认 | DEV-003 | 提交规范未确认 | 提交信息格式 | 代码提交 | 使用 `feat: <需求简述>` 或团队约定格式 | 待人工补充 |  |
| 待确认 | DEV-004 | 多应用边界未确认 | 多应用分支策略 | 跨应用实现 | 如涉及多个应用，分别确认每个应用的基准分支和开发分支 | 待人工补充 |  |

## 确认结果
```

## 确认结果处理规则

- `确认结果` 为空的问题，视为未确认，不能写成最终实现结论。
- `DEV-001`、`DEV-002` 未确认时，不得创建应用 worktree 或进入代码实现；不允许由系统或 AI 生成个人默认分支名。
- `确认结果` 已明确的问题，必须同步反映到 `technical-design.md` 的对应章节。
- 如果所有会影响编码的问题都已有确认结果，`technical-confirmation.md` 中应明确写出“无阻塞项，可以进入任务拆分”。
- 如果仍存在阻塞项，`technical-design.md` 可以保留方案建议，但必须标记哪些内容不能进入任务拆分。

## `technical-design.changelog.md` 输出结构

如果文件不存在，创建：

```md
# 技术方案修订记录

| 时间 | 来源 | 评审意见 / 变更点 | 处理状态 | 处理说明 |
| --- | --- | --- | --- | --- |
```

如果文件已存在，追加本轮处理记录，不要删除历史记录。

## 多轮评审处理规则

- `technical-review.md` 是人工评审意见入口，优先级高于 AI 初稿。
- 重新生成时必须先处理评审意见，再完善团队模板章节。
- 评审意见中明确要求修改的内容，不允许只写在确认文件里，必须同步到 `technical-design.md`。
- 评审意见与 PRD、代码证据冲突时，不要强行采纳；应在 `technical-confirmation.md` 标记为待人工确认，并在 changelog 说明冲突原因。

## 技术方案生成输入处理规则

- `known-facts.md` 只代表本次需求的技术定位输入，不是团队通用规则。
- `known-facts.md` 允许使用自然语言、标题和列表表达；不要要求用户用表格填写。生成技术方案时由 AI 归纳成团队模板所需表格。
- `known-facts.md` 中建议涉及应用、代码入口、接口命名、接口定义和字段表设计，应作为技术方案优先分析方向。
- `known-facts.md` 中明确“不做”的内容，不得展开成实现项。
- `known-facts.md` 中明确的实现倾向可以作为方案优先方向，但仍必须结合真实代码证据校验。
- 如果用户建议了接口路径、方法名或字段名，必须在 `technical-design.md` 的接口定义、数据库设计或实现方案章节体现；如不能采纳，必须说明原因。
- 如果 `known-facts.md` 与 PRD、需求确认或真实代码冲突，必须写入 `technical-confirmation.md`，不要静默覆盖。

## 停止点

写完产物后暂停，等待人工确认技术方案。确认完成后才能进入 `05 拆分实施任务`。
