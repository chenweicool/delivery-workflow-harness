# 交付完成报告 v1

`delivery/delivery-report.json` 是需求完成后生成的本地统计报告。一期只统计需求交付时长、负责人和需求来源；不包含代码、测试、质量结论或外部上报信息。

## 契约

```json
{
  "schemaVersion": "1.0",
  "reportId": "dvr_<UUID>",
  "generatedAt": "2026-08-06T10:30:00.000Z",
  "demand": {
    "startedAt": "2026-08-04T09:00:00.000Z",
    "completedAt": "2026-08-06T10:30:00.000Z",
    "owner": { "name": "张三", "id": "zhangsan" },
    "url": "https://example.internal/demand/123"
  },
  "extensions": {}
}
```

- `startedAt`：创建 Workspace 的时间。
- `completedAt`：用户确认需求完成并生成报告的时间。
- `generatedAt`：报告首次生成时间，与首次 `completedAt` 相同。
- `reportId`：报告的全局唯一标识，供后续 HTTP 或 Kafka 上报去重使用。
- `owner.id`：负责人域账号或工号；一期允许为空字符串。
- `extensions`：后续版本新增统计字段的唯一扩展入口；v1 必须为对象。

报告一旦生成即不覆盖，重复执行完成操作只返回原报告，保证后续上报可安全重试。完整机器校验规则见 `schemas/delivery-report.schema.json`。

若启用 Harness Client，报告生成后会自动尝试 HTTP 上报；配置、浏览器授权、重试和回执说明见 [Harness Client 使用指南](harness-client-guide.md)。上报状态不属于报告 JSON 本身，也不会改变已生成报告。
