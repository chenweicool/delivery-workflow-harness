# 局部修复（快捷 / 受控）

本命令不属于主线的“下一步”。它用于用户已明确授权的局部缺陷修复，主线确认、进度、审批和 Candidate 均保持原状。

## 何时使用

- 快捷修复：既有行为的局部缺陷，范围清晰，且不涉及数据库、金额/账单/结算、跨应用 API、删除行为、共享组件或归属不明。
- 受控修复：触发上述任一风险，但用户已明确授权本次范围；必须记录最小影响和验证方式。
- 新功能、产品口径变化、技术方案调整、范围扩大：不要使用本命令，使用 ChangeSet 和主线流程。

## 开始前

1. 读取 `AGENTS.md`、`context/demand-context.md` 和当前代码。
2. 明确引用用户本次的授权原话、修复范围、目标应用与计划修改文件。
3. 创建记录：

```powershell
# 无高风险触发项
dw patch start --mode quick --scope "目标类/方法与修复边界" --reason "缺陷现象" --authorization "用户明确授权原话" --workspace <path>

# 有高风险触发项
dw patch start --mode controlled --scope "目标类/方法与修复边界" --reason "缺陷现象" --authorization "用户明确授权原话" --risk financial --impact "不改变既有金额口径；覆盖 xx 场景回归" --workspace <path>
```

未创建有效修复记录，不得以“用户说直接实施”为由绕过主线确认点。

## 实施规则

- 只修改记录 scope 内的文件；发现范围扩大、风险触发项新增或归属不明时立即停止，重新创建或升级为受控修复。
- 快捷修复不得触及高风险触发项；不要用模糊描述规避风险判断。
- 不要求修改主线任务清单、`task-progress.md`、`change-log.md` 或 `self-check.md`。
- 使用真实命令执行最小且相关的测试；无法执行时记录具体原因，不能写成通过。

## 完成与正式验证

```powershell
dw patch complete <patch-id> --files "src/..." --test "mvn -Dtest=... test：通过" --summary "修复内容与剩余风险" --workspace <path>
```

代码稳定且需要 Review、单测、冒烟或 UAT 时：

```powershell
dw patch promote <patch-id> --workspace <path>
dw candidate create --change <change-id> --workspace <path>
```

随后按正式验证步骤执行；Review、单测、冒烟和 UAT 证据仍必须绑定同一个有效 Candidate。
