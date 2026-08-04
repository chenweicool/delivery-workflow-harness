# 09 冒烟验证

## 目标

按冻结的 `design/smoke-test-design.md` 记录冒烟执行证据。初版仅支持人工执行结果；后续可扩展 command/http/mcp runner。

## 输出

写入 `review/smoke-test-result.md`。每个场景必须记录 `passed`、`failed`、`not-run` 或 `blocked` 之一，以及执行人、时间和证据位置。`planned` 或 `not-run` 不能写成通过。
