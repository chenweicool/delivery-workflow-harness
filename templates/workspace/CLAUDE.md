# Claude Code 交付指令

先读取 `AGENTS.md`，再执行 `.workflow/commands/execute-delivery.md`。

- 围绕用户目标自主推进，不按需求、方案、任务、Review、单测、冒烟拆成固定门禁。
- 普通需求变动和缺陷在当前 Work Run 内修改、验证和收敛。
- 命中 `AGENTS.md` 的高风险触发项时，先执行 `dw risk report` 并暂停。
- 只使用用户显式安装且启用的 Skill。
- 三份正式交付物必须来自真实工具证据；代码变化后重新执行 `dw delivery collect`。
- `dw delivery validate` 返回 ready 后才能完成 `execute-delivery`。
- 发布由人确认，禁止自动执行外部写入或生产发布。
