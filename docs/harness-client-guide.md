# Harness Client 使用指南（v1）

Harness Client 是 Delivery Workflow 的可选连接器。开源 Workflow 默认不绑定任何内部平台；只有显式配置后才会在报告完成时自动上报。

## 三个能力

### Console 页面入口

在 Workflow Console 打开“工作台设置 → Harness Client”，可完成与 CLI 相同的配置、浏览器授权、授权状态查看和当前 Workspace 的手动上报。页面只展示授权状态和到期时间，不展示或返回访问令牌。

### 1. 配置平台

```powershell
dw harness configure `
  --server-url http://127.0.0.1:8080/api/v1/harness/delivery-reports `
  --authorize-url http://127.0.0.1:5173/#/harness/authorize
```

- `server-url` 是报告接收 API。
- `authorize-url` 是平台前端授权页。生产环境前后端同域时可省略，Workflow 会按 `server-url` 的域名推导。
- `client-id` 默认为公开标识 `delivery-workflow-desktop`，不包含 Client Secret。
- 可用 `dw harness status` 检查配置和授权状态；状态命令不输出访问令牌。

### 2. 浏览器登录授权

```powershell
dw harness login
```

Workflow 会启动本机临时回调端口，拉起平台浏览器授权页。用户登录平台并点击“授权并返回 Workflow”后，Workflow 使用 PKCE 交换一个仅用于报告上报的短期令牌。

令牌失效或需要切换账号时：

```powershell
dw harness logout
dw harness login
```

### 3. 完成报告后自动上报

```powershell
dw report complete --workspace <workspace路径>
```

该命令会先创建不可变的 `delivery/delivery-report.json`，再尝试自动上报。上报失败不会覆盖或删除本地报告；结果写入：

```text
.workflow/harness/receipts/<reportId>.json
```

也可以只重试上报：

```powershell
dw report submit --workspace <workspace路径>
```

## 状态与处理

| 状态 | 含义 | 操作 |
| --- | --- | --- |
| `not-configured` | 未配置平台 | 执行 `dw harness configure`。 |
| `authorization-required` | 未登录或授权已过期 | 执行 `dw harness login`，再 `dw report submit`。 |
| `submitted` | 已接收；`duplicate=true` 也表示幂等成功 | 无需处理。 |
| `failed` | 网络、服务端校验或机器 Token 异常 | 查看回执文件后重试。 |

## CI/机器模式

CI 不适合浏览器授权时可配置 `--auth-mode token`，通过环境变量提供 `HARNESS_INGEST_TOKEN`。该模式是兼容通道；个人使用默认采用浏览器授权，不分发共享 Token。

## 安全边界

- 不在开源仓库内置公司地址、用户账号或 Client Secret。
- 不要把 `X-Harness-Token`、Personal Access Token 或浏览器上报令牌写入命令行、仓库文件或聊天记录。
- 当前 v1 的本机令牌保存尚未接入操作系统凭据库，适合受控内测；扩大使用前需要完成凭据库、刷新令牌与撤销机制。
