# Delivery Workflow Harness 定位与配置模型

## 一句话定位

Delivery Workflow 是团队交付 Harness，不是 AI IDE。

- AI IDE / Codex / Claude Code 负责编码现场：边聊边改、定位代码、多轮调整。
- Delivery Workflow 负责交付控制：阶段边界、检查点、状态账本、人工确认和知识沉淀。

## 边界原则

- 不复刻 Windsurf / Cursor / Codex 的聊天编码体验。
- 不把每轮 AI 对话都沉淀为正式文件。
- 文件只承载跨阶段复用、人工确认、团队沉淀所需的检查点。
- 过程日志、prompt 和多轮调整记录默认隐藏在 `.workflow/runs/`。

## 三层配置模型

### 1. 团队默认配置

团队维护一个公共 git 仓库，只存相对路径和逻辑应用名。

```text
team-ai-config/
  profiles/default.json
  apps/app-index.json
  rules/
  skills/
  knowledge/
```

### 2. 本机接入配置

每个人只配置自己的根目录映射。

```json
{
  "teamConfigRoot": "D:\\code\\team-ai-config",
  "repoRoot": "D:\\code\\work-project",
  "teamProfile": "default"
}
```

### 3. 需求 Workspace 快照

新建 workspace 时，系统把团队相对配置解析为本机可执行路径，写入 `.workflow/workspace.json`。

```json
{
  "profile": {
    "name": "default",
    "inherited": true
  },
  "skills": [
    "D:\\code\\team-ai-config\\skills\\api-doc-generation"
  ],
  "apps": [
    {
      "name": "yl-jms-spm-core-export-api",
      "sourcePath": "D:\\code\\work-project\\yl-jms-spm-core-export-api",
      "worktreePath": "apps/yl-jms-spm-core-export-api"
    }
  ]
}
```

## 推广目标

- 首次用户只需要配置 `teamConfigRoot` 和 `repoRoot`。
- 新需求默认继承团队 profile。
- 需求级页面只让用户选择涉及应用和补充说明。
- 高级 skills / rules 手工追加入口默认折叠。
