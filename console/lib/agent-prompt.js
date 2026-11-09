function createAgentPromptRuntime(deps) {
  const {
    normalizeUserPath,
    readWorkflowDefinition,
    ensureWorkflowProgressFiles,
    readWorkflowProgress,
    workflowStepPosition,
    readWorkspaceConfig,
    agentContractForStep,
    localConsoleUrl,
    WORKFLOW_PROGRESS_FILE,
    HANDOFF_DONE_FILE,
  } = deps;

  async function buildQualityGateContext() {
    return '';
  }

  async function buildAgentCollaborationPrompt(workspacePathValue, stepId, taskId, targetAgent, options = {}) {
    const workspacePath = normalizeUserPath(workspacePathValue);
    const agent = targetAgent === 'claude' ? 'Claude Code' : 'Codex';
    const workflow = await readWorkflowDefinition(workspacePath);
    await ensureWorkflowProgressFiles(workspacePath, workflow);
    const progress = await readWorkflowProgress(workspacePath, workflow);
    const definition = workflow.steps[stepId];
    if (!definition) throw new Error(`未知步骤：${stepId}`);
    if (stepId !== 'execute-delivery') throw new Error(`步骤 ${stepId} 不是 Agent 自主交付节点`);
    const stepPosition = workflowStepPosition(workflow, stepId);
    const config = await readWorkspaceConfig(workspacePath);
    const contract = agentContractForStep(stepId);
    const enabledCapabilities = (config.capabilities || []).filter((item) => item && item.installed === true && item.enabled === true);
    const capabilityLines = enabledCapabilities.length
      ? enabledCapabilities.map((item) => `- ${item.type}: ${item.name || item.id}（${item.path || '无路径'}）`).join('\n')
      : '- 当前没有用户显式安装并启用的 Skill；不要自动启用 Harness 或全局推荐 Skill。';
    const appLines = (config.apps || []).map((app) => `- ${app.name}: ${app.worktreePath || app.sourcePath}`).join('\n') || '- 尚未配置应用；先根据 Workspace 配置或请用户补充代码范围。';
    const doneCommand = `dw done --workspace "${workspacePath}" --step execute-delivery --summary "三份交付物已生成并校验"`;
    const blockedCommand = `dw done --workspace "${workspacePath}" --step execute-delivery --status blocked --summary "等待风险决策或外部输入"`;
    const returnUrl = `${localConsoleUrl(options.port)}/?workspace=${encodeURIComponent(workspacePath)}&step=manual-release`;
    const doneJsonExample = JSON.stringify({ stepId, status: 'done', outputs: definition.outputs, summary: '三份交付物已生成并校验' }, null, 2);
    return [
      `# ${agent} 自主交付指令`, '',
      '你负责一个完整的 Work Run。目标是完成用户需求，而不是逐个填写流程模板。可以在同一循环中理解需求、查看代码、修改实现、Review、运行测试并根据结果继续修复。', '',
      '## 当前目标', '',
      `- Workspace: ${workspacePath}`,
      `- Step: ${stepPosition.current}/${stepPosition.total} ${stepId} / ${definition.title}`,
      `- Workflow: V${workflow.version}`,
      `- Status revision: ${progress.revision || 0}`,
      taskId ? `- 用户工作项: ${taskId}` : '',
      `- 进度文件: ${WORKFLOW_PROGRESS_FILE}`, '',
      '## 最小读取顺序', '',
      '1. 读取 `AGENTS.md`、`context/demand-context.md`、`input/request.md`（若存在）和 `.workflow/workspace.json`。',
      '2. 按需求只读取必要的领域材料、规则、代码和测试，不要求先生成需求分析、技术方案或任务拆分文件。',
      '3. 已安装 Skill 只有在下方明确为 enabled 时才可使用；未安装能力不能成为阻塞。',
      '4. 修改后自主 Review，执行最相关的测试；失败就继续修复，避免为每轮修改重开流程。', '',
      '## 风险决策边界', '',
      '低风险代码修改由你自主完成。命中以下任一项时，在修改对应高风险内容前执行 `dw risk report` 并暂停：', '',
      '- `database`：数据库结构、迁移或不可逆数据写入。',
      '- `financial`：金额、费用、报价、账单、结算、应付或清分语义。',
      '- `api-contract`：跨应用请求/响应或公共 API 兼容性。',
      '- `deletion`：删除既有行为、数据或兼容路径。',
      '- `shared-component`：共享组件或多应用公共能力。',
      '- `external-write`：对生产、远端平台或外部系统执行写操作。',
      '- `ownership-unknown`：应用、表、MQ、Job 或外部依赖归属不明。', '',
      '上报示例：', '',
      '`dw risk report --type financial --scope "算费公式" --impact "可能改变账单金额" --rollback "回退提交并重跑受影响账期" --workspace "<workspace>"`', '',
      `上报后执行：\`${blockedCommand}\`。待人工 approve 后继续；reject 表示当前方案不可实施，应调整方案后重新上报。`, '',
      '## 正式交付契约', '',
      '最终只要求三份正式交付物：', '',
      '- `delivery/unit-test-report.md`：从 Surefire/Failsafe XML 汇总真实单测结果。',
      '- `delivery/coverage-report.md`：从 JaCoCo XML 汇总字节码（INSTRUCTION）覆盖率。',
      '- `delivery/release-config.yaml`：记录应用、分支、提交、代码指纹、风险决策、发布配置、观测和回滚。', '',
      '需求分析、中文技术方案、任务清单、Review 笔记都可按复杂度放入 `workspace/`，但不是强制门禁，也不是正式交付物。复杂需求建议用中文文件名，例如 `workspace/技术方案.md`。', '',
      '先在各应用内运行真实测试和 JaCoCo，再执行：', '',
      `- \`dw delivery collect --workspace "${workspacePath}"\``,
      `- \`dw delivery validate --workspace "${workspacePath}"\``, '',
      '禁止手写或伪造测试数、覆盖率和通过结论。代码变化后必须重新 collect。', '',
      '## 当前应用', '', appLines, '',
      '## 用户显式启用的能力', '', capabilityLines, '',
      '## 完成', '',
      `只有 validate 返回 ready 时，执行：\`${doneCommand}\`。`,
      `随后打开：\`${returnUrl}\`，由人完成最终发布确认。`,
      `如果 CLI 不可用，降级完成标记路径为 \`${HANDOFF_DONE_FILE}\`：`, '',
      '```json', doneJsonExample, '```', '',
      contract ? `Agent 契约：${contract.role}` : '',
    ].filter(Boolean).join('\n');
  }

  return { buildQualityGateContext, buildAgentCollaborationPrompt };
}

module.exports = { createAgentPromptRuntime };
