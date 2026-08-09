# 贡献指南

## 范围

本仓库只包含通用的 Delivery Workflow Harness。请勿将公司白皮书、真实应用索引、凭据、生产链接和客户需求产物提交到贡献内容中。

## 提交 Pull Request 前

1. 保持行为变更聚焦，并记录所有流程契约变更。
2. 运行本地检查：

   ```bash
   npm run check
   npm run test:regression
   npm pack --dry-run
   ```

3. 不要提交 `.npmrc`、token、生成的本地 Workspace 或包含敏感信息的终端日志。

## Pull Request 要求

- 说明对用户流程的影响。
- 为运行时行为变更补充或更新回归覆盖。
- 白皮书和团队能力示例必须使用虚构数据。
