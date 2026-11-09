const fsp = require('fs/promises');
const path = require('path');

const HANDOFF_FILE = '.workflow/handoff/current.md';
const HANDOFF_DONE_FILE = '.workflow/handoff/done.json';

function createAgentHandoffRuntime(deps) {
  const {
    normalizeUserPath,
    exists,
    assertWithin,
    ensureDir,
    readWorkflowDefinition,
    findReturnStepId,
    workflowUnitForStep,
    agentContractForStep,
    buildAgentCollaborationPrompt,
    unlinkWorkspaceFileIfExists,
    agentSessionKey,
    buildAgentSessionName,
    localConsoleUrl,
    closeMatchingAgentSession,
    transitionSteps,
    pathExistsInWorkspace,
    assertNoUnresolvedRisks,
    validateDeliveryArtifacts,
    nowIso,
  } = deps;

  async function prepareAgentHandoff(body) {
    const workspacePath = normalizeUserPath(body.workspacePath);
    const stepId = String(body.stepId || '').trim();
    const taskId = String(body.taskId || '').trim();
    const agent = body.agent === 'claude' ? 'claude' : 'codex';
    if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) throw new Error('当前目录不是有效 Workspace');
    const workflow = await readWorkflowDefinition(workspacePath);
    const definition = workflow.steps[stepId];
    if (!definition || definition.kind !== 'agent') throw new Error(`不是可交给 Agent 的步骤：${stepId}`);
    const returnStepId = findReturnStepId(workflow, stepId);
    const unit = workflowUnitForStep(workflow, stepId);
    const unitId = unit ? unit.id : '';
    const agentContract = agentContractForStep(stepId);
    const prompt = await buildAgentCollaborationPrompt(workspacePath, stepId, taskId, agent, { port: body.port });
    const handoffPath = path.join(workspacePath, HANDOFF_FILE);
    const donePath = path.join(workspacePath, HANDOFF_DONE_FILE);
    assertWithin(workspacePath, handoffPath);
    assertWithin(workspacePath, donePath);
    await ensureDir(path.dirname(handoffPath));
    await fsp.writeFile(handoffPath, prompt, 'utf8');
    await unlinkWorkspaceFileIfExists(workspacePath, HANDOFF_DONE_FILE);
    return {
      agent, workspacePath, unitId,
      agentRoleId: agentContract ? agentContract.id : '',
      agentRoleName: agentContract ? agentContract.name : '',
      requiredOutputs: agentContract ? agentContract.requiredOutputs : [],
      stepId, taskId, returnStepId,
      sessionKey: agentSessionKey(unitId, stepId, taskId, agent),
      sessionName: buildAgentSessionName(workspacePath, unitId, stepId, taskId, agent),
      handoffFile: HANDOFF_FILE, doneFile: HANDOFF_DONE_FILE, prompt,
    };
  }

  async function completeAgentHandoff(body) {
    const workspacePath = normalizeUserPath(body.workspacePath);
    const stepId = String(body.stepId || '').trim();
    const taskId = String(body.taskId || '').trim();
    if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) throw new Error('当前目录不是有效 Workspace');
    const workflow = await readWorkflowDefinition(workspacePath);
    const definition = workflow.steps[stepId];
    if (!definition) throw new Error(`未知步骤：${stepId}`);
    const requestedStatus = String(body.status || 'done').trim().toLowerCase();
    const status = requestedStatus === 'ready-for-review' ? 'done' : requestedStatus;
    if (!['done', 'blocked', 'running'].includes(status)) throw new Error('步骤状态仅支持 done、blocked 或 running');
    if (status === 'done') {
      const missing = [];
      for (const output of definition.outputs || []) {
        if (typeof output === 'string' && !output.endsWith('/**') && !(await pathExistsInWorkspace(workspacePath, output))) missing.push(output);
      }
      if (missing.length) throw new Error(`步骤完成前缺少必需产物：${missing.join('、')}`);
      if (stepId === 'execute-delivery') {
        await assertNoUnresolvedRisks(workspacePath);
        const validation = await validateDeliveryArtifacts(workspacePath);
        if (validation.status !== 'ready') throw new Error(`交付物校验未通过：${validation.issues.join('、')}`);
      }
    }
    const returnStepId = String(body.returnStepId || '').trim() || findReturnStepId(workflow, stepId);
    const outputs = Array.isArray(body.outputs) && body.outputs.length ? body.outputs.map(String).filter(Boolean) : (definition.outputs || []);
    const payload = {
      stepId, taskId, status, returnStepId, outputs,
      summary: String(body.summary || (status === 'blocked' ? '当前 Work Run 已暂停，等待风险决策或外部输入。' : '自主交付已完成。')),
      nextUrl: `${localConsoleUrl(body.port)}/?workspace=${encodeURIComponent(workspacePath)}&step=${encodeURIComponent(returnStepId)}`,
      createdAt: nowIso(), source: 'delivery-workflow-cli',
    };
    const transition = await transitionSteps({
      workspacePath, workflow, eventType: 'agent-handoff',
      transitions: [{ stepId, status, summary: payload.summary }],
      actor: String(body.operator || '').trim() || 'local-user',
      runId: String(body.runId || body.run || '').trim(),
      idempotencyKey: String(body.idempotencyKey || body.idempotency || '').trim(),
      expectedRevision: body.expectedRevision === undefined ? body.revision : body.expectedRevision,
      metadata: { taskId, outputs },
    });
    payload.revision = transition.revision;
    payload.transitionEventId = transition.event && transition.event.eventId || '';
    const donePath = path.join(workspacePath, HANDOFF_DONE_FILE);
    assertWithin(workspacePath, donePath);
    await ensureDir(path.dirname(donePath));
    await fsp.writeFile(donePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await closeMatchingAgentSession(workspacePath, stepId, taskId, payload.status);
    return { workspacePath, doneFile: HANDOFF_DONE_FILE, payload, transition };
  }

  return { prepareAgentHandoff, completeAgentHandoff };
}

module.exports = { HANDOFF_FILE, HANDOFF_DONE_FILE, createAgentHandoffRuntime };
