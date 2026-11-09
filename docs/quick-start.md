# Delivery Workflow V3 快速开始

## 1. 创建 Workspace

```bash
dw init <需求名> --owner <负责人> --demand-url <需求链接> --context "补充背景和约束"
```

Domain Harness 是可选增强项：

```bash
dw init <需求名> --domain <本地目录或 Git 地址> --owner <负责人> --demand-url <需求链接>
```

## 2. 导入需求材料

```bash
dw input import <文件或目录> --workspace <workspace-path>
```

Markdown、纯文本和 DOCX 会规范化到 `input/request.md`，原件保存在 `input/source/`。简单修改可以只使用创建时的 `context/demand-context.md`。

## 3. 启动自主交付

```bash
cd <workspace-path>
dw next --workspace .
dw handoff --workspace . --step execute-delivery
```

Agent 可以在同一 Work Run 内多次修改、Review、测试和修复。需求变动和普通缺陷不需要重开流程。

## 4. 必要时上报风险

```bash
dw risk report --type <type> --scope <范围> --impact <影响> --rollback <回滚> --workspace .
dw risk approve R-001 --note "已确认" --workspace .
```

风险类型：`database`、`financial`、`api-contract`、`deletion`、`shared-component`、`external-write`、`ownership-unknown`。

## 5. 生成真实交付证据

在每个 Java 应用内运行项目自己的测试和 JaCoCo 命令，确保产生：

- `target/surefire-reports/TEST-*.xml` 或 `target/failsafe-reports/TEST-*.xml`
- `target/site/jacoco/jacoco.xml` 或 `target/site/jacoco-aggregate/jacoco.xml`

然后执行：

```bash
dw delivery collect --workspace .
dw delivery validate --workspace .
```

V3 不接受手写测试数或覆盖率。代码有任何变化都要重新 collect。

## 6. 完成 Work Run

```bash
dw done --workspace . --step execute-delivery --summary "三份交付物已生成并校验"
```

最后在控制台核对三份交付物并完成人工发布确认。也可执行 `dw release approve --note "确认说明" --workspace .`；该命令只记录人工确认，不执行真实发布。

## 7. Skill

Skill 默认不安装、不启用。需要时由用户显式安装：

```bash
dw skill install <local-skill-path> --workspace .
dw skill list --workspace .
```
