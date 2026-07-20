# PRD 资料包

本目录用于存放本次需求的全部产品资料，不再限定为单个 PRD 文件。

建议结构：

```text
prd/
  README.md              本说明
  main.md                主 PRD 或需求正文
  assets/                截图、流程图、页面标注
  templates/             Excel 模板、导入导出样例
  examples/              示例数据、异常样例、历史单据样例
  references/            外部文档摘录或业务补充说明
```

如果只有一个需求文档，建议命名为 `main.md`。

如果有导入模板、导出模板或示例 Excel，优先放入 `templates/`，AI 在产品需求分析和技术边界分析阶段需要读取这些文件来抽取字段、校验规则和映射关系。
