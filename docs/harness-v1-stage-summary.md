# Harness v1 阶段总结

> 状态：已完成最小闭环联调，进入“可靠性、安全性与可运营性”优化阶段。  
> 更新日期：2026-08-07

## 1. 本阶段目标

在不向开源 Delivery Workflow 内置任何公司地址、账号、Client Secret 或共享 Token 的前提下，形成最小交付统计闭环：

```text
需求创建 → 生成交付报告 JSON → 用户浏览器授权 → 自动/手动上报 → 智审平台列表查看与跳转需求链接
```

一期统计口径仅覆盖：需求开始时间、负责人、需求完成时间、需求链接；报告结构预留扩展空间，后续再逐步增加研发过程、质量和效率指标。

## 2. 当前已交付能力

### 2.1 Delivery Workflow

- 创建 Workspace 时采集需求链接、负责人和负责人 ID，并写入需求配置。
- 在需求完成时生成不可变、幂等的 `delivery/delivery-report.json`。
- 报告 schema 为 `1.0`，包含 `reportId`、`generatedAt`、`demand` 和 `extensions`。
- 支持自动上报与手动重试：
  - `dw report complete --workspace <path>`
  - `dw report submit --workspace <path>`
- 每次上报结果写入 `.workflow/harness/receipts/`，失败不会影响本地报告。
- 提供 CLI 配置与状态命令：`dw harness configure/login/status/logout`。
- Console 增加“工作台设置 → Harness Client”：配置接收地址、查看授权状态、浏览器授权、退出本机授权、上报当前报告。

### 2.2 浏览器授权与 Token

- 使用 PKCE 浏览器授权，不分发团队共享上报 Token。
- 用户先登录智审平台，再授权本机 Workflow；平台签发仅用于交付报告上报的短期令牌。
- Workflow 只保存本机令牌，Console 和状态接口均不返回令牌明文。
- 支持令牌失效识别、重新登录和本机登出。
- 已处理 Vue Hash 路由授权参数位置，以及 Windows 浏览器拉起不稳定的问题；当前由 Console 浏览器页面直接打开授权页，服务端负责本机回调和令牌交换。

### 2.3 智审平台 Harness Server

- 新增“Harness 交付”侧边栏入口和交付报告列表。
- 平台接收 `POST /api/v1/harness/delivery-reports`，按 `reportId + payloadHash` 幂等。
- 支持浏览器 PKCE 上报令牌与兼容的机器 Token 通道。
- 保存上报人、上报通道、原始 JSON、Hash、需求起止时间、负责人、需求链接及接收时间。
- 列表中“需求链接”已渲染为“打开需求”链接。

## 3. 联调结果

| 验证项 | 结果 |
| --- | --- |
| 智审平台 UAT 部署与建表 | 已完成 |
| Workflow → 平台浏览器授权 | 已成功回调到本机 `127.0.0.1` |
| Token 交换与本机保存 | 已确认，状态为 `authorized` |
| Bearer Token JSON 上报 | 已成功，服务端返回 `accepted=true` |
| 平台交付列表展示 | 已验证 |
| 飞书真实需求链接跳转 | 已确认打通 |

UAT 中已写入两条联调模拟记录，应在后续补充“测试数据标记/清理”能力后统一处理：

- `dvr_98e2be87-7e89-42db-bcba-393622637f25`：PKCE 上报烟测。
- `dvr_1e1c1f97-f1aa-4e28-945e-1e8276e39eb7`：真实需求链接跳转验证。

## 4. 当前数据契约

```json
{
  "schemaVersion": "1.0",
  "reportId": "dvr_<uuid>",
  "generatedAt": "2026-08-07T00:00:00.000Z",
  "demand": {
    "startedAt": "2026-08-01T00:00:00.000Z",
    "completedAt": "2026-08-07T00:00:00.000Z",
    "owner": { "name": "负责人", "id": "可选" },
    "url": "https://需求链接"
  },
  "extensions": {}
}
```

扩展原则：保持 v1 核心字段稳定；新增内容优先放入 `extensions`，成熟后再通过新的 `schemaVersion` 固化。

## 5. 已知限制与优化项

### P0：上线前应优先完成

1. **把本地授权流程修复推送并发布。**
   - 当前 Workflow 已推送的基础能力提交为 `14048eb`。
   - 浏览器 Hash 路由、Windows 启动兼容和浏览器直开授权页的后续修复目前仅在本地工作区，需完成回归后单独提交推送。
2. **生产环境启用 HTTPS。** 当前 UAT 使用 HTTP，令牌虽不展示但仍不适合生产网络传输。
3. **凭据存储升级。** v1 将上报令牌保存在本机应用状态中；应改为 Windows Credential Manager / macOS Keychain / Linux Secret Service。
4. **授权会话体验。** 增加“取消当前授权”“打开授权链接/复制授权链接”兜底入口，以及明确的超时、关闭窗口和交换失败提示。
5. **部署脚本修正。** `/data/yl-jms-spm-knowledge` 下前后端是独立 Git 仓库，`cli.sh update` 应分别对后端、前端执行 `git pull --ff-only`；并解决服务器 Git Deploy Key/凭证问题。

### P1：平台可运营性

1. 交付报告详情页：查看完整 JSON、回执、上报人和审计信息。
2. 列表筛选与统计：负责人、时间范围、应用/团队、上报通道、成功率、交付耗时分布。
3. 测试数据治理：显式 `environment/test` 标记、管理员删除/归档、联调数据不进入正式统计。
4. 上报可靠性：本地 outbox、指数退避、网络恢复后自动重试、失败告警与可观测指标。
5. Token 生命周期：撤销、刷新、用户切换账号、平台端 Client 注册与回调地址白名单。

### P2：报告内容演进

1. `extensions` 中增加应用、仓库、分支、PR/MR、发布环境与版本。
2. 增加需求澄清、技术方案、代码评审、测试、发布检查等阶段证据索引。
3. 增加效率和质量指标：人机协作耗时、返工次数、缺陷、测试结果、门禁结论。
4. 由“单条交付报告”演进为可追溯的需求交付画像，同时避免采集源码、密钥和不必要的个人信息。

## 6. 推荐下一步

1. 将 Workflow 本地授权流程修复提交、推送，并用全新安装的 Workflow 做一次回归。
2. 按 [Workflow 报告治理与下一阶段](./workflow-report-governance-and-next-stage.md) 固化核心 JSON 契约，明确 Workflow 是报告生产者、Harness Client 是对接 Adapter。
3. UAT `cli.sh` 双仓库拉取与部署流程暂不在当前阶段调整。
4. Token 凭据库和更多授权兜底暂不在当前阶段扩展，维持现有可用闭环。
