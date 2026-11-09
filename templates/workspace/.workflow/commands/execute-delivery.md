# 自主完成需求

## 目标

完成用户当前需求，并让实现、测试证据和发布配置绑定到同一代码指纹。

## 执行方式

1. 从 `input/`、`context/`、`.workflow/workspace.json` 和当前代码恢复目标。
2. 根据复杂度自主决定是否在 `workspace/` 记录分析或中文技术方案；不强制生成过程文档。
3. 实现最小完整改动，Review 当前 diff，运行最相关测试；发现失败继续修复。
4. 需求变动或缺陷反馈直接更新本轮目标并重复第 2～3 步。
5. 命中 `AGENTS.md` 的高风险触发项时，在实施该风险变更前上报并暂停。
6. 在每个应用生成 Surefire/Failsafe XML 和 JaCoCo XML。
7. 执行 `dw delivery collect` 和 `dw delivery validate`。
8. validate 为 ready 后执行 `dw done --step execute-delivery`，进入人工发布确认。

## 禁止

- 不得为满足流程而创建空的需求确认、技术方案、任务清单、Review、冒烟或归档文件。
- 不得把计划执行、无法执行或人工估算写成测试通过或覆盖率结果。
- 不得自动启用未由用户安装的 Skill。
- 不得自动发布或写入外部系统。
