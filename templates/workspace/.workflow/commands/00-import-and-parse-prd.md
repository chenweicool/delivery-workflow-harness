# 00 导入并解析 PRD

## 目标

将用户提供的原始 PRD 材料解析为一份 AI 后续阶段可稳定读取的 Markdown 文档。

## Skill 使用策略

- 如果已启用 Word PRD 转 Markdown、文档抽取或飞书文档解析相关 skill，必须优先使用。
- 使用 `feishu-word-to-md` / `prd-word-to-md` 类 skill 时，输出根目录必须指定为 workspace 根目录，让 skill 自行生成 `prd/document.md`、`prd/assets/`、`prd/tables/`、`prd/metadata/` 等目录。
- 如果当前只记录了飞书或外部文档链接，且本机无法直接读取链接内容，需要在输出中明确标记“待人工导出或授权读取”。
- 输出必须是中文。
- 输出保持简洁，只保留 PRD 原文事实、无法解析内容和低置信度内容；不要额外写泛泛总结或免责声明。

## 允许读取

- `AGENTS.md`
- `CLAUDE.md`
- `prd/**`
- `context/skills/linked/**`
- `context/rules/linked/**`

## 禁止事项

- 禁止读取 `apps/**`。
- 禁止修改代码。
- 禁止生成需求澄清、技术方案或任务清单。
- 禁止把无法解析的内容包装成确定结论。

## 输出

主 Markdown 写入 `prd/document.md`。

相关资源按解析 skill 的约定写入：

- `prd/original/`
- `prd/assets/`
- `prd/references/`
- `prd/templates/`
- `prd/tables/`
- `prd/metadata/`

## 输出结构

```md
# PRD 解析结果

## 1. 来源材料

## 2. 原始需求摘要

## 3. 页面 / 功能点

## 4. 字段、表格和枚举

## 5. 业务流程

## 6. 验收标准原文

## 7. 图片、附件和无法直接解析内容

## 8. 低置信度内容
```

如果存在无法读取的 Word 表格、图片、附件或外部链接，必须写入第 7、8 节，供 01 需求澄清继续追问。

不要额外创建 `prd/parsed/`、`prd/markdown/` 等目录。
