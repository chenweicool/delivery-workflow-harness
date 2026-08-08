# 09 冒烟验证

## 目标

按研发在提测前提供的 `review/evidence/smoke-test-case.md` 记录冒烟执行证据。该文件缺失时必须明确阻塞“缺少研发提供的冒烟用例”，不得自行设计、补写或把未执行标记为通过。初版仅支持人工执行结果；后续可扩展 command/http/mcp runner。

## 输出

读取 `review/evidence/smoke-test-case.md`，写入 `review/evidence/smoke-test-result.md`。每个研发提供的场景必须记录 `passed`、`failed`、`not-run` 或 `blocked` 之一，以及执行人、时间和证据位置。`planned` 或 `not-run` 不能写成通过。
