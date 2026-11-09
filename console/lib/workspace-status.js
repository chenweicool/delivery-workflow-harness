const fsp = require('fs/promises');
const path = require('path');

function createWorkspaceStatusRuntime(deps) {
  const {
    normalizeUserPath,
    exists,
    readWorkspaceConfig,
    readWorkflowDefinition,
    readWorkflowProgress,
    getAppAccessStates,
    listFiles,
    pathExistsInWorkspace,
    getCheckpointState,
    readJsonFileIfExists,
    readAgentSessionIndex,
    workflowStepSequence,
    HANDOFF_FILE,
    HANDOFF_DONE_FILE,
    riskSummary,
    validateDeliveryArtifacts,
  } = deps;

  function buildNextRecommendation(workflow, steps, risks) {
    const sequence = workflowStepSequence(workflow);
    const next = sequence.find((step) => steps[step.id] && !steps[step.id].done);
    if (!next) return { status: 'done', title: '交付流程已完成', summary: '三份交付物已确认，可以按发布配置执行后续发布。', stepId: '', unitId: '', blockers: [] };
    const step = steps[next.id];
    if (next.id === 'execute-delivery' && risks && !risks.clear) {
      return {
        status: 'blocked', title: '等待风险决策',
        summary: 'Work Run 保持原位；批准后继续实施，不需要重开需求、方案或任务流程。',
        stepId: next.id, unitId: next.unitId,
        blockers: risks.unresolved.map((risk) => `${risk.id} ${risk.type}：${risk.status}`),
      };
    }
    if (step.validationIssues.length) {
      return { status: 'blocked', title: `交付结果需要刷新：${step.title}`, summary: '代码或证据已经变化，请重新生成并校验交付物。', stepId: next.id, unitId: next.unitId, blockers: step.validationIssues };
    }
    if (step.kind === 'manual') {
      const missing = (step.checkpoint && step.checkpoint.reviewFiles || []).filter((item) => !item.optional && !item.exists).map((item) => item.path);
      return {
        status: missing.length ? 'blocked' : 'waiting',
        title: missing.length ? '交付物尚未齐备' : '需要人工确认发布',
        summary: missing.length ? '先完成自主交付并生成三份正式交付物。' : '请核对测试、覆盖率、发布配置和风险决策后确认或退回。',
        stepId: next.id, unitId: next.unitId, blockers: missing,
      };
    }
    return {
      status: step.status === 'running' ? 'running' : 'ready',
      title: step.status === 'running' ? '自主交付进行中' : '开始或继续自主交付',
      summary: 'Agent 可直接理解、修改、Review 和测试；普通变更无需创建额外过程文件。',
      stepId: next.id, unitId: next.unitId, blockers: [],
    };
  }

  async function getWorkspaceStatus(workspacePathValue) {
    const workspacePath = normalizeUserPath(workspacePathValue);
    if (!workspacePath) return { exists: false, message: '未选择 Workspace' };
    const workspaceExists = await exists(workspacePath);
    const isWorkspace = workspaceExists && await exists(path.join(workspacePath, 'AGENTS.md')) && await exists(path.join(workspacePath, '.workflow'));
    if (!isWorkspace) return { exists: workspaceExists, isWorkspace: false, workspacePath, message: '不是有效 Delivery Workflow Workspace' };
    const config = await readWorkspaceConfig(workspacePath);
    const workflow = await readWorkflowDefinition(workspacePath);
    const workflowProgress = await readWorkflowProgress(workspacePath, workflow);
    const appAccessStates = await getAppAccessStates(workspacePath, config);
    const inputFiles = await listFiles(workspacePath, 'input', 120);
    const artifactFiles = await listFiles(workspacePath, 'delivery', 120);
    const workFiles = await listFiles(workspacePath, 'workspace', 120);
    const materialInputFiles = inputFiles.filter((item) => item.type === 'file' && !item.path.endsWith('/.gitkeep'));
    const visibleArtifacts = [...artifactFiles, ...workFiles].filter((item) => item.type === 'file' && !item.path.endsWith('/.gitkeep'));
    const risks = await riskSummary(workspacePath);
    let deliveryValidation = { status: 'not-ready', issues: ['尚未生成正式交付物'] };
    if (await pathExistsInWorkspace(workspacePath, 'delivery/unit-test-report.md') && appAccessStates.length) {
      try { deliveryValidation = await validateDeliveryArtifacts(workspacePath); } catch (error) { deliveryValidation = { status: 'blocked', issues: [error.message] }; }
    }
    const steps = {};
    for (const [stepId, definition] of Object.entries(workflow.steps)) {
      const outputStatuses = [];
      for (const output of definition.outputs || []) outputStatuses.push({ path: output, exists: output.endsWith('/**') ? false : await pathExistsInWorkspace(workspacePath, output) });
      const outputsReady = outputStatuses.length > 0 && outputStatuses.every((item) => item.exists);
      const checkpoint = await getCheckpointState(workspacePath, definition);
      const progressRecord = workflowProgress.steps && workflowProgress.steps[stepId] || {};
      let status = String(progressRecord.status || 'pending').toLowerCase();
      if (checkpoint && checkpoint.status === 'approved') status = 'done';
      else if (checkpoint && checkpoint.status === 'rejected') status = 'rejected';
      const validationIssues = [];
      if (status === 'done' && !outputsReady) validationIssues.push(`缺少必需产物：${outputStatuses.filter((item) => !item.exists).map((item) => item.path).join('、')}`);
      if (stepId === 'execute-delivery' && status === 'done' && deliveryValidation.status !== 'ready') validationIssues.push(...deliveryValidation.issues);
      if (definition.kind === 'manual' && status === 'done' && (!checkpoint || checkpoint.status !== 'approved')) validationIssues.push('人工发布确认记录不存在。');
      steps[stepId] = {
        ...definition, id: stepId, status, summary: String(progressRecord.summary || ''),
        done: status === 'done' && validationIssues.length === 0,
        blocked: validationIssues.length > 0 || status === 'rejected' || (stepId === 'execute-delivery' && !risks.clear),
        blockedReasons: validationIssues,
        outputsReady, validationIssues, outputStatuses, requirementStatuses: [], checkpoint,
      };
    }
    const units = workflow.units.map((unit) => {
      const unitSteps = unit.steps.map((stepId) => steps[stepId]).filter(Boolean);
      const doneCount = unitSteps.filter((step) => step.done).length;
      return { ...unit, status: doneCount === unitSteps.length ? 'done' : doneCount ? 'active' : 'idle', doneCount, stepCount: unitSteps.length };
    });
    const nextRecommendation = buildNextRecommendation(workflow, steps, risks);
    const handoffDone = await readJsonFileIfExists(workspacePath, HANDOFF_DONE_FILE);
    const handoffCurrentPath = path.join(workspacePath, HANDOFF_FILE);
    const handoffDonePath = path.join(workspacePath, HANDOFF_DONE_FILE);
    const handoffState = {
      currentFile: HANDOFF_FILE, doneFile: HANDOFF_DONE_FILE,
      hasCurrent: await exists(handoffCurrentPath), done: Boolean(handoffDone), donePayload: handoffDone || null,
      currentModifiedAt: await exists(handoffCurrentPath) ? (await fsp.stat(handoffCurrentPath)).mtime.toISOString() : '',
      doneModifiedAt: await exists(handoffDonePath) ? (await fsp.stat(handoffDonePath)).mtime.toISOString() : '',
    };
    return {
      exists: true, isWorkspace: true, workspacePath, config, progress: workflowProgress,
      workflow: { version: workflow.version, source: workflow.source, description: workflow.description },
      prdFiles: inputFiles, inputFiles, materialPrdCount: materialInputFiles.length,
      artifactFiles: visibleArtifacts, allArtifactFiles: visibleArtifacts,
      appAccessStates, tasks: [], implementation: { requiredTaskIds: [], completedTaskIds: [], pendingTaskIds: [] },
      handoffState, agentSessions: await readAgentSessionIndex(workspacePath),
      nextRecommendation, mainlineRecommendation: nextRecommendation, independentActions: [],
      risks, deliveryValidation, units, steps, iteration: null, patchWork: { actions: [], activeCount: 0 }, baselineVerification: null,
    };
  }

  return { buildNextRecommendation, getWorkspaceStatus };
}

module.exports = { createWorkspaceStatusRuntime };
