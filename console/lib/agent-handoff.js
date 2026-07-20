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
    nowIso,
  } = deps;

  async function prepareAgentHandoff(body) {
    const workspacePath = normalizeUserPath(body.workspacePath);
    const stepId = String(body.stepId || '').trim();
    const taskId = String(body.taskId || '').trim();
    const agent = body.agent === 'claude' ? 'claude' : 'codex';
    if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
      throw new Error('褰撳墠鐩綍涓嶆槸鏈夋晥 workspace');
    }
    const workflow = await readWorkflowDefinition(workspacePath);
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
      agent,
      workspacePath,
      unitId,
      agentRoleId: agentContract ? agentContract.id : '',
      agentRoleName: agentContract ? agentContract.name : '',
      requiredOutputs: agentContract ? agentContract.requiredOutputs : [],
      stepId,
      taskId,
      returnStepId,
      sessionKey: agentSessionKey(unitId, stepId, taskId, agent),
      sessionName: buildAgentSessionName(workspacePath, unitId, stepId, taskId, agent),
      handoffFile: HANDOFF_FILE,
      doneFile: HANDOFF_DONE_FILE,
      prompt,
    };
  }

  async function completeAgentHandoff(body) {
    const workspacePath = normalizeUserPath(body.workspacePath);
    const stepId = String(body.stepId || '').trim();
    const taskId = String(body.taskId || '').trim();
    if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
      throw new Error('Not a valid delivery workflow workspace');
    }
    if (!stepId) {
      throw new Error('Missing step id');
    }
    const workflow = await readWorkflowDefinition(workspacePath);
    const definition = workflow.steps[stepId];
    if (!definition) {
      throw new Error(`Unknown step: ${stepId}`);
    }
    const returnStepId = String(body.returnStepId || '').trim() || findReturnStepId(workflow, stepId);
    const outputs = Array.isArray(body.outputs) && body.outputs.length
      ? body.outputs.map((item) => String(item || '').trim()).filter(Boolean)
      : (definition.outputs || []);
    const payload = {
      stepId,
      taskId,
      status: String(body.status || 'ready-for-review'),
      returnStepId,
      outputs,
      summary: String(body.summary || 'AI step completed and is ready for review.'),
      nextUrl: `${localConsoleUrl(body.port)}/?workspace=${encodeURIComponent(workspacePath)}&step=${encodeURIComponent(returnStepId)}`,
      createdAt: nowIso(),
      source: 'delivery-workflow-cli',
    };
    const donePath = path.join(workspacePath, HANDOFF_DONE_FILE);
    assertWithin(workspacePath, donePath);
    await ensureDir(path.dirname(donePath));
    await fsp.writeFile(donePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await closeMatchingAgentSession(workspacePath, stepId, taskId, payload.status);
    return {
      workspacePath,
      doneFile: HANDOFF_DONE_FILE,
      payload,
    };
  }

  return {
    prepareAgentHandoff,
    completeAgentHandoff,
  };
}

module.exports = {
  HANDOFF_FILE,
  HANDOFF_DONE_FILE,
  createAgentHandoffRuntime,
};
