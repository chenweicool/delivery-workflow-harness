# Delivery Workflow Console

一个只依赖 Node.js 的本地需求交付控制台，用来页面化管理 `delivery-workflow`。

## 启动

源码开发时可以直接运行：

```powershell
cd C:\code\delivery-workflow\console
node server.js
```

默认地址：

```text
http://localhost:3040
```

可通过环境变量修改端口：

```powershell
$env:PORT=3050
node server.js
```

团队用户后续通过 npm/CLI 启动同一个本地控制台：

```powershell
npx @company/delivery-workflow start
```

或全局安装后：

```powershell
npm i -g @company/delivery-workflow
delivery-workflow start
```

CLI 启动会把本机配置写到用户目录，源码启动仍使用 `console/.data`，两种方式可以共存。

## CLI

```powershell
delivery-workflow setup --team-config-root D:\code\team-ai-config --repo-root D:\code\work-project --profile spm-default
delivery-workflow doctor
delivery-workflow start
```

- `setup`：保存本机路径映射和默认团队 profile。
- `doctor`：检查 Codex、Claude、IDEA、team-config、repoRoot、team profile。
- `start`：启动本地 Web Console，默认打开 `http://127.0.0.1:3040`，端口占用时自动尝试后续端口。

## 当前能力

- 创建标准 delivery workflow workspace。
- 上传或复制本机 PRD 文件到 `prd/`。
- 记录本地应用目录、飞书文档来源和备注到 `.workflow/workspace.json`。
- 以 Unit / Step 方式展示可组合流程。
- 根据脚手架命令文件生成 Codex / Claude Code 执行提示词。
- 预览阶段产物 Markdown。

## 设计原则

- 源码开发不需要 `npm install`。
- npm 只负责分发和启动本地 console，团队 rules / skills / app-index 继续由 git 仓库维护。
- 不引入前端框架。
- 大单元可组合，单元内部步骤固定。
- 页面读取脚手架命令模板，不复制一份 workflow 规则。
- 当前先作为本地控制台，后续可以继续接飞书读取、模型调用和执行日志。
