# 2026-08-03 进度说明：需求交付 Harness 初版

## 今日结论

已完成可试用的初版主路径：Workflow 作为目录原生、模型无关、证据驱动的交付控制面；领域 Harness 作为只读需求背景；用户在 Workspace 目录中直接使用已有的 Codex、Claude 或 IDE。

本轮不再将 Workflow 定位为模型会话、IDE 或执行器管理工具。

## 已完成

### 1. 领域 Harness 挂载

- `dw init <需求名> --domain <领域目录>` 已要求绑定一个领域 Harness。
- 一个 Workspace 只能绑定一个领域；跨领域需求应拆分。
- 挂载过程不会修改领域目录，特别是不修改 `docs/domain/` 下由定时任务同步的白皮书。
- 初始化会冻结领域快照：
  - `context/domain-summary.md`
  - `.workflow/domain.lock.json`

### 2. 需求 Workspace 与质量门禁

- Workspace 是单需求的唯一交付现场，PRD、方案、测试、Review 与交付证据均回写到该目录。
- 已实现三道 Gate：
  - `requirement-confirmed`：PRD 与需求确认。
  - `design-ready`：技术方案、单测方案、冒烟方案。
  - `delivery-verified`：Review、风险、单测结果、可追溯矩阵、冒烟结果。
- 技术设计阶段必须先产出并冻结单测/冒烟方案；交付阶段按方案反向验证结果。
- 可通过 `dw gate check|approve|reject|exception` 执行检查和人工决策。

### 3. Skills / Rules 能力挂载

- 领域 Harness 的 skills 与 rules 自动进入当前 Workspace 的领域配置。
- 新增团队级全局 Skills / Rules 配置，支持填写本机同步的公共 Git、skills 仓库或规则文件路径；不保存凭据。
- 页面展示“当前需求生效能力”，将全局、领域、需求级能力区分后汇总。
- 初始化、重新绑定领域以及保存全局配置后，会生成可审计快照：
  - `context/capabilities.md`
  - `.workflow/capabilities.lock.json`
  - `context/skills/linked/`、`context/rules/linked/` 中的只读链接或副本。
- `AGENTS.md` 与 `CLAUDE.md` 已要求模型进入目录后先阅读领域和能力快照。

### 4. 控制台信息架构

控制台不再要求填写 Codex、Claude、IDEA 路径。当前页面结构为：

```text
左侧工作台
  - 当前 Workspace
  - 项目目录（打开已有需求）
  - 全局配置（默认项目目录、公共 Skills / Rules）

右侧需求面板
  - 下一步动作
  - 领域 Harness（只读）
  - 当前需求生效能力
  - PRD / 补充材料入口
  - 质量 Gate 与人工确认
  - 正式产物
```

补充材料连接器保留产品入口，但尚未实现飞书、内部文档、数据库、Apollo 的统一接入。

## 已验证

本地服务地址：`http://127.0.0.1:3047/`

以下检查均已通过：

```text
npm run check
npm run test:regression
  - whitepaper catalog check
  - API regression
  - smoke test
```

本次相关提交：

```text
be013f5 refactor: make workflow a model-agnostic control plane
6fdd2fa feat: expose workspace capabilities in control plane
```

## 当前可试用方式

```powershell
# 1. 启动页面（已启动时直接打开 http://127.0.0.1:3047/）
dw start --port 3047

# 2. 初始化单需求 Workspace，领域为必填
dw init negative-bill-export --domain F:\code\harness-project\spm-harness-module-negative

# 3. 导入 PRD
dw prd import <PRD文件或目录> --workspace <Workspace目录>

# 4. 进入目录，用已有模型或 IDE 工作
cd <Workspace目录>

# 5. 检查质量门禁
dw gate check --workspace <Workspace目录>
```

页面使用者可在左侧“全局配置”设置默认项目目录和公共能力，在“项目目录”打开已有 Workspace。

## 明日优先级

1. 实现统一补充材料连接器的最小闭环：先本地文件快照，再复用现有飞书读取能力；定义 `inspect / fetch / snapshot / describe` 契约。
2. 清理遗留的执行器、会话和旧控制台代码路径，避免其继续影响新控制面认知与维护成本。
3. 补齐领域代码入口索引、数据库表/MQ/Job/配置项索引的数据契约；先定义字段与来源，再接数据库/Apollo 只读连接器。
4. 用一个真实领域需求进行试用，检查 PRD → 方案（含测试设计）→ Gate → 交付证据的完整闭环。

## 已知边界

- 外部资料连接器目前只是页面占位，尚未接入飞书、内部文档、数据库或 Apollo。
- 全局 Skills / Rules 以本地已同步路径挂载；远程 Git 拉取、凭据管理和企业权限由后续连接器/安全配置层解决。
- 领域 Harness 目前可读取白皮书、领域记忆、声明的代码入口、skills 与 rules；数据库表、配置和运行拓扑索引尚未形成统一模型。
- 旧执行器相关源码仍存在于仓库中，但不再是默认页面和 CLI 主路径；需在下一轮进行物理收敛。
