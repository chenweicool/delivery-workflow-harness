# Delivery Workflow V3

Delivery Workflow 是一个目录原生、模型无关的 AI 软件交付 Harness。V3 不再把需求澄清、技术方案、任务拆分、Review、单测、冒烟和归档固定成串行门禁，而是让现代 Agent 在一个 Work Run 内自主循环，Workflow 只约束高风险决策、真实验证证据和最终发布。

## 核心模型

```text
需求材料 + 当前代码 + 可选领域上下文
  -> 自主 Work Run（理解 / 实现 / Review / 测试 / 修复，可反复循环）
  -> 单元测试报告 + JaCoCo 字节码覆盖率报告 + 发布配置
  -> 人工发布确认
```

需求变动、普通缺陷和代码返工留在当前 Work Run 内，不需要重开需求、方案或任务步骤。过程文档可按复杂度创建在 `workspace/`，但不是门禁。

## 安装与运行

```bash
npm install -g delivery-workflow-harness
dw start
```

无需安装也可运行：

```bash
npx delivery-workflow-harness start
```

本地控制台默认访问 `http://127.0.0.1:3040`。

## 快速开始

```bash
dw init policy-engine-change \
  --owner 张三 \
  --demand-url https://example.internal/demand/123 \
  --context "目标、范围和关键约束"

cd <workspace>
dw input import <需求文件> --workspace .
dw next --workspace .
dw handoff --workspace . --step execute-delivery
```

Agent 在应用仓库中运行真实单测和 JaCoCo 后：

```bash
dw delivery collect --workspace .
dw delivery validate --workspace .
dw done --workspace . --step execute-delivery --summary "三份交付物已生成并校验"
```

随后在控制台核对三份正式交付物并完成人工发布确认，也可显式执行：

```bash
dw release approve --note "测试、覆盖率、发布配置和风险均已确认" --workspace .
```

## 风险触发，而不是固定门禁

只有以下变更需要在实施前暂停并由人决策：

- `database`：数据库结构、迁移、不可逆数据写入。
- `financial`：金额、费用、报价、账单、结算、应付、清分语义。
- `api-contract`：跨应用或公共 API 契约。
- `deletion`：删除既有行为、数据或兼容路径。
- `shared-component`：共享组件或多应用公共能力。
- `external-write`：生产、远端平台或外部系统写操作。
- `ownership-unknown`：应用、表、MQ、Job 或外部依赖归属不明。

```bash
dw risk report \
  --type financial \
  --scope "账单算费公式" \
  --impact "可能改变账单金额" \
  --rollback "回退提交并重跑受影响账期" \
  --workspace .

dw risk list --workspace .
dw risk approve R-001 --note "影响范围和回滚方案已确认" --workspace .
```

低风险修改无需风险记录。风险批准后继续同一个 Work Run；不重开流程。

## 三份正式交付物

```text
delivery/unit-test-report.md     Surefire/Failsafe XML 的真实汇总
delivery/coverage-report.md      JaCoCo XML 的字节码（INSTRUCTION）覆盖率
delivery/release-config.yaml     应用、分支、提交、代码指纹、配置、观测和回滚
```

三份文件绑定同一个代码指纹。任何应用代码变化都会让 `dw delivery validate` 失败，必须重新收集证据。单测存在失败/错误、缺少 JaCoCo XML 或存在未批准风险时，也不能完成交付节点。

## Skill 边界

团队 Profile、Domain Harness 或能力目录可以推荐 Skill，但不会默认安装或启用。只有用户显式执行下面的命令后，Skill 才会进入当前 Workspace：

```bash
dw skill install <local-skill-path> --workspace .
dw skill enable <skill-id> --workspace .
```

未安装的 Skill 不得阻塞交付。

## Workspace 结构

```text
input/             原始需求、附件和规范化后的 request.md
context/           本需求与可选领域上下文快照
apps/              可选应用 worktree
workspace/         可选过程记忆、中文技术方案和 Review 笔记
delivery/          三份正式交付物
.workflow/         机器状态、风险决策和最终发布确认
```

## 本地开发与发布

```bash
npm run check
npm run test:regression
npm pack --dry-run
```

版本与 tag 保持一致后推送：

```bash
git add .
git commit -m "refactor: delivery workflow v3"
git tag -a v0.3.0 -m "Delivery Workflow v0.3.0"
git push origin main
git push origin v0.3.0
```

仓库的发布工作流会基于 tag 执行检查并发布 npm 包。npm 已发布版本不可覆盖；失败时修复后发布新版本。

更多操作见 [快速开始](docs/quick-start.md)，架构决策见 [ADR-0001](docs/adr/0001-outcome-driven-workflow-v3.md)。
