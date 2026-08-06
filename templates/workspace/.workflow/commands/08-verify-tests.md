# 08 测试反验

## 目标

依据冻结的单测设计、当前 diff、PRD、技术方案和 Review 结果，补齐或执行必要测试，并输出可追溯的反验结论。

## 前置检查

- 先检查 `.workflow/baselines/` 三份 lock；若设计文档 hash 改变，停止并在结果中标记 `deviation-required`，不得静默使用新设计。
- 只验证已批准任务和当前需求范围内 diff。

## 允许修改

- 目标项目已有测试文件；若为可测性必须修改生产代码，只能做最小接缝并记录原因。
- `review/evidence/unit-test-result.md`、`review/evidence/traceability-matrix.md` 与进度文件。

## 输出

- `review/evidence/unit-test-result.md`：测试文件、命令、真实执行结果、失败/未执行原因、剩余缺口。
- `review/evidence/traceability-matrix.md`：每条 PRD/需求项对应方案、冻结用例、代码证据、执行结果与缺口；必须显式标识未覆盖需求和 diff 中未设计的新行为。
