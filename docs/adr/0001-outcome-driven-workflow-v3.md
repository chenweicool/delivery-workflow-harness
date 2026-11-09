# ADR-0001：采用结果驱动的 Delivery Workflow V3

- 状态：Accepted
- 日期：2026-11-09

## 背景

V2 把需求澄清、技术方案、测试设计、任务拆分、实现、Review、单测、冒烟、发布和归档做成固定串行步骤，并叠加 ChangeSet、Patch、Candidate。实际使用中，简单代码修改和需求反馈会引起流程反复，Agent 花费大量精力维护过程文件和恢复门禁，而不是收敛实现。

## 决策

V3 只保留三个生命周期节点：Workspace 准备、自主 Work Run、人工发布确认。

- Agent 在 Work Run 内自主循环理解、实现、Review、测试和修复。
- 需求变动和普通缺陷不重开流程。
- 只有高风险触发项进入 Risk Decision。
- 正式 Delivery Contract 只有单元测试报告、JaCoCo 字节码覆盖率报告和发布配置。
- 三份交付物绑定同一代码指纹，并由真实工具报告生成。
- Skill 默认不安装、不启用，只有用户显式安装后可用。
- 最终发布始终由人确认。
- V3 不迁移 V2 Workspace，也不为旧命令保留兼容层。

## 影响

正向影响：Interface 更深、固定节点更少、状态局部性更好，现代 Agent 能根据任务复杂度自主选择过程，而风险与发布责任仍可审计。

代价：旧 Workspace 不能直接继续；团队必须把真正需要强制控制的事项表达为风险触发项或交付证据，不再依靠大量模板文件产生安全感。

## 删除测试

如果移除 Risk Decision，会丢失高风险人工授权边界；如果移除 Delivery Contract，会丢失真实测试、覆盖率和发布指纹。因此两者是 load-bearing。需求确认、技术方案、任务拆分、Candidate 和 Patch 可以删除而不破坏这两个不变量，所以不再作为核心 Module。
