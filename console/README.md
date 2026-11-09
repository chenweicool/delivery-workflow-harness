# Delivery Workflow V3 Console

Node.js 本地控制台，用于创建 V3 Workspace、查看自主 Work Run、风险决策、三份正式交付物和最终人工发布确认。

```powershell
npm run start
```

默认地址为 `http://127.0.0.1:3040`。

控制台遵循以下边界：

- 普通需求变动和缺陷不创建额外固定阶段。
- 高风险通过 Risk Decision 条件式暂停。
- 单测和覆盖率必须来自 Surefire/Failsafe 与 JaCoCo XML。
- Skill 只有用户显式安装并启用后才进入 Workspace。
- 最终发布确认只记录授权，不自动执行真实发布。
