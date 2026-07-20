function createAgentPromptRuntime(deps) {
  const {
    normalizeUserPath,
    readWorkflowDefinition,
    ensureWorkflowProgressFiles,
    assertTaskAllowedForImplementation,
    workflowStepPosition,
    workflowStepSequence,
    readWorkspaceConfig,
    shouldExposeAppContextForStep,
    readToolsConfig,
    linkConfiguredCapabilities,
    routeCapabilitiesForStep,
    capabilityDisplayName,
    agentContractForStep,
    localConsoleUrl,
    getImplementationTargets,
    collectDiffSummary,
    readWorkspaceTextFileIfExists,
    truncateText,
    WORKFLOW_PROGRESS_FILE,
    HANDOFF_DONE_FILE,
  } = deps;

  async function buildQualityGateContext(workspacePath, stepId, config) {
    if (!['07-review-code', '06-generate-unit-tests'].includes(stepId)) {
      return '';
    }
    const targets = await getImplementationTargets(workspacePath, config);
    const diff = await collectDiffSummary(targets.map((app) => ({
      ...app,
      worktreePath: app.exists ? app.worktreePath : app.sourcePath,
    }))).catch((error) => `无法读取 diff：${error.message}`);
    const files = [
      ['需求确认', 'design/requirement-confirmation.md'],
      ['技术方案', 'design/technical-design.md'],
      ['技术确认', 'design/technical-confirmation.md'],
      ['任务清单', 'tasks/task-list.md'],
      ['任务确认', 'tasks/task-confirmation.md'],
      ['本次交付说明', 'design/known-facts.md'],
      ['变更记录', 'review/change-log.md'],
      ['实现自检', 'review/self-check.md'],
    ];
    if (stepId === '06-generate-unit-tests') {
      files.push(['AI Review', 'review/ai-review.md']);
      files.push(['风险清单', 'review/risk-list.md']);
    }
    const sections = [];
    for (const [label, relativePath] of files) {
      const content = await readWorkspaceTextFileIfExists(workspacePath, relativePath);
      if (content.trim()) {
        sections.push(`### ${label}：${relativePath}\n\n${truncateText(content, 6000)}`);
      }
    }
    const qualityRules = stepId === '07-review-code'
      ? [
          '- 使用独立 Review Agent 视角，不要沿用实现 Agent 的自我结论。',
          '- 发现问题优先，按 P0/P1/P2/P3 输出；没有阻塞问题也必须写剩余测试缺口。',
          '- 重点检查需求覆盖、边界条件、兼容性、数据一致性、权限/资金/结算风险和回归风险。',
          '- 禁止修改代码，只输出评审结论和风险清单。',
        ]
      : [
          '- 单测必须优先覆盖本次 diff 触达的分支、边界条件、异常路径和 Review 发现的风险。',
          '- 优先复用项目现有测试框架、基类、mock 风格、断言方式和命名规范。',
          '- 能执行就记录真实命令和结果；不能执行必须写具体阻塞原因。',
          '- 如必须为可测性调整生产代码，只允许最小接缝改动并写入 `review/unit-test-result.md`。',
          '- 集成测试只生成计划；只有检测到项目已有集成测试入口时才执行。',
        ];
    const whitepaper = config.whitepaperContext || {};
    const whitepaperRisks = whitepaper.riskTags && whitepaper.riskTags.length
      ? [
        `- 功能点: ${whitepaper.primaryFunction ? `${whitepaper.primaryFunction.name} (${whitepaper.primaryFunction.id})` : '未确认'}`,
        `- 白皮书风险: ${whitepaper.riskTags.join('、')}`,
        whitepaper.whitepaperRefs && whitepaper.whitepaperRefs.length ? `- 依据: ${whitepaper.whitepaperRefs.join('、')}` : '',
      ].filter(Boolean).join('\n')
      : '- 本次未配置白皮书风险标签。';
    return [
      '## 质量门禁上下文包',
      '',
      '本段由 Delivery Workflow 自动打包，用于把本次需求背景显式加入质量门禁。',
      '',
      '### 质量执行规则',
      '',
      qualityRules.join('\n'),
      '',
      '### 白皮书风险约束',
      '',
      whitepaperRisks,
      '',
      '### 代码变更摘要',
      '',
      diff || '暂无 diff 或无法读取 diff',
      '',
      sections.join('\n\n'),
    ].filter(Boolean).join('\n');
  }

  async function buildAgentCollaborationPrompt(workspacePathValue, stepId, taskId, targetAgent, options = {}) {
    const workspacePath = normalizeUserPath(workspacePathValue);
    const agent = targetAgent === 'claude' ? 'Claude Code' : 'Codex';
    const workflow = await readWorkflowDefinition(workspacePath);
    await ensureWorkflowProgressFiles(workspacePath, workflow);
    const definition = workflow.steps[stepId];
    if (!definition) {
      throw new Error(`未知步骤：${stepId}`);
    }
    if (stepId === '06-implement-task') {
      await assertTaskAllowedForImplementation(workspacePath, taskId);
    }
    const stepPosition = workflowStepPosition(workflow, stepId);
    const sequence = workflowStepSequence(workflow);
    const currentIndex = sequence.findIndex((step) => step.id === stepId);
    const nextStep = currentIndex >= 0 ? sequence[currentIndex + 1] : null;
    const returnStepId = nextStep && workflow.steps[nextStep.id] && workflow.steps[nextStep.id].kind === 'manual'
      ? nextStep.id
      : stepId;
    const config = await readWorkspaceConfig(workspacePath);
    const promptConfig = shouldExposeAppContextForStep(stepId, config)
      ? config
      : { ...config, appPaths: [], apps: [] };
    const tools = await readToolsConfig();
    const capabilities = await linkConfiguredCapabilities(workspacePath, tools, config);
    const routedCapabilities = await routeCapabilitiesForStep(workspacePath, stepId, capabilities, workflow);
    const appLines = (promptConfig.appPaths || [])
      .map((item) => `- ${item.name}: ${item.path}`)
      .join('\n');
    const knowledgeLines = (promptConfig.knowledge || [])
      .map((item) => `- ${item.name}: ${item.path}`)
      .join('\n');
    const whitepaper = promptConfig.whitepaperContext || {};
    const whitepaperLines = whitepaper.primaryFunction ? [
      `- 已确认功能点: ${whitepaper.primaryFunction.name} (${whitepaper.primaryFunction.id})`,
      whitepaper.root ? `- 白皮书仓库: ${whitepaper.root}` : '',
      whitepaper.revision ? `- 白皮书版本: ${whitepaper.revision}` : '',
      whitepaper.whitepaperRefs && whitepaper.whitepaperRefs.length
        ? `- 必读白皮书: ${whitepaper.whitepaperRefs.join('、')}`
        : '',
      whitepaper.riskTags && whitepaper.riskTags.length
        ? `- 领域风险: ${whitepaper.riskTags.join('、')}`
        : '',
      routedCapabilities.selection && routedCapabilities.selection.enabledIds && routedCapabilities.selection.enabledIds.length
        ? `- 本步骤自动启用能力: ${routedCapabilities.selection.enabledIds.join('、')}`
        : '',
      routedCapabilities.selection && routedCapabilities.selection.missingIds && routedCapabilities.selection.missingIds.length
        ? `- 未安装的推荐能力: ${routedCapabilities.selection.missingIds.join('、')}`
        : '',
      '- 本次快照: `context/whitepaper-context.md`',
    ].filter(Boolean).join('\n') : '';
    const outputLines = (definition.outputs || [])
      .map((item) => `- ${typeof item === 'string' ? item : item.path}`)
      .join('\n');
    const enabledSkills = (routedCapabilities.enabled && routedCapabilities.enabled.skills) || [];
    const enabledRules = (routedCapabilities.enabled && routedCapabilities.enabled.rules) || [];
    const capabilityLines = [
      enabledSkills.length ? `- Skills: ${enabledSkills.map(capabilityDisplayName).join('；')}` : '',
      enabledRules.length ? `- Rules: ${enabledRules.map(capabilityDisplayName).join('；')}` : '',
      routedCapabilities.enabled && routedCapabilities.enabled.notes ? '- Notes: see `.workflow/workspace.json` and team configuration notes.' : '',
    ].filter(Boolean).join('\n');
    const qualityGateContext = await buildQualityGateContext(workspacePath, stepId, config);
    const returnUrl = `${localConsoleUrl(options.port)}/?workspace=${encodeURIComponent(workspacePath)}&step=${encodeURIComponent(returnStepId)}`;
    const doneJsonExample = JSON.stringify({
      stepId,
      taskId: taskId || '',
      status: 'ready-for-review',
      returnStepId,
      outputs: (definition.outputs || []).map((item) => (typeof item === 'string' ? item : item.path)),
      summary: '简要说明本轮完成内容、用户纠偏点和剩余风险。',
      nextUrl: returnUrl,
    }, null, 2);
    const doneCommand = `delivery-workflow done --workspace "${workspacePath}" --step ${stepId} --summary "ready for review"`;
    const openCommand = `delivery-workflow open --workspace "${workspacePath}" --step ${returnStepId}`;
    const agentContract = agentContractForStep(stepId);
    const contractOutputLines = agentContract && agentContract.requiredOutputs && agentContract.requiredOutputs.length
      ? agentContract.requiredOutputs.map((item) => `- ${item}`).join('\n')
      : '';
    return [
      `# ${agent} 协作入口`,
      '',
      `请在 ${agent} 中接手当前 Delivery Workflow 步骤。此文件只做轻量交接，详细规则按需读取对应文件。`,
      '',
      agentContract ? [
        '## 当前角色 Agent',
        '',
        `- Agent: ${agentContract.name}`,
        `- 角色职责: ${agentContract.role}`,
        `- 会话策略: ${agentContract.sessionPolicy}`,
        '- 结束标准: 无论中间与用户对话多少轮，最终必须回写本 Agent 的结构化产物，并执行 `delivery-workflow done`。',
        '',
      ].join('\n') : '',
      '## 当前目标',
      '',
      `- Workspace: ${workspacePath}`,
      `- Step: ${stepPosition.current || '?'} / ${stepPosition.total}: ${stepId} / ${definition.title}`,
      definition.commandFile ? `- Command: ${definition.commandFile}` : '',
      `- Workflow: ${workflow.source} / v${workflow.version}`,
      taskId ? `- Task: ${taskId}` : '',
      `- Progress: ${WORKFLOW_PROGRESS_FILE}`,
      '',
      '## 最小读取顺序',
      '',
      '1. 读取 `AGENTS.md`、`CLAUDE.md`。',
      '2. 读取 `.workflow/workspace.json` 和 `.workflow/progress.md`，确认当前进度。',
      definition.commandFile ? `3. 读取 \`${definition.commandFile}\`，只执行当前步骤。` : '3. 按当前人工步骤要求处理。',
      '4. 如命令文件要求使用 skill/rule，再读取下方启用项；不要主动展开未启用能力。',
      '5. 所有产物写回 workspace，输出中文且保持简洁。',
      '6. 完成或阻塞时，更新 `.workflow/progress.md` 和 `.workflow/progress.json`。',
      '',
      '## Harness 内置边界',
      '',
      '- 本段规则来自 Delivery Workflow 平台，优先级高于团队模板和用户补充说明。',
      '- 不要修改 `.workflow/workflow.json`、`.workflow/progress.json` 的结构定义，除非当前命令明确要求维护进度状态。',
      '- 不要跳过 manual checkpoint；需要人工确认时，只写回待确认产物并暂停。',
      '- 不要把聊天中的临时结论当作最终交付，最终结论必须落到本步骤产物文件。',
      '- 团队 rules / skills 只能增强当前步骤，不得扩大本步骤允许读取和允许修改范围。',
      '',
      (contractOutputLines || outputLines) ? `## Agent 必须回写产物\n\n${contractOutputLines || outputLines}\n` : '',
      contractOutputLines && outputLines && contractOutputLines !== outputLines ? `## 当前步骤补充产物\n\n${outputLines}\n` : '',
      capabilityLines ? `## 本步骤启用能力\n\n${capabilityLines}\n` : '',
      appLines ? `## 候选应用\n\n${appLines}\n` : '',
      whitepaperLines ? `## 白皮书与功能上下文\n\n${whitepaperLines}\n` : '',
      knowledgeLines ? `## 背景知识\n\n${knowledgeLines}\n` : '',
      qualityGateContext,
      '## 回到页面验收',
      '',
      `- 完成或阻塞后，优先执行：\`${doneCommand}\`。`,
      `- 然后打开页面：\`${openCommand}\`。`,
      '- 只有在 `delivery-workflow done` 命令不可用时，才按下面示例手工写入完成标记。',
      '',
      `- 降级完成标记路径：\`${HANDOFF_DONE_FILE}\`。`,
      '- 完成标记示例：',
      '',
      '```json',
      doneJsonExample,
      '```',
      '',
      `- 然后在终端执行：\`${openCommand}\`。`,
      `- 如果命令不可用，请把这个链接展示给用户：${returnUrl}`,
      '- 页面会优先根据产物文件、done.json 和 `.workflow/progress.json` 推导状态。',
      '- 在“产物”下拉中查看本步骤输出文件。',
      '- 如果当前步骤后面是人工确认，请在页面勾选确认清单，或写入评审意见后退回修改。',
    ].filter(Boolean).join('\n');
  }

  return {
    buildQualityGateContext,
    buildAgentCollaborationPrompt,
  };
}

module.exports = {
  createAgentPromptRuntime,
};
