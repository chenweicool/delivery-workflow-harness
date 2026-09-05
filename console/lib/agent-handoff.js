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
    readIterationStatus,
    recordCandidateEvidence,
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
    const requestedStatus = String(body.status || 'done').trim().toLowerCase();
    const status = requestedStatus === 'ready-for-review' ? 'done' : requestedStatus;
    if (!['done', 'blocked', 'running'].includes(status)) {
      throw new Error('步骤状态仅支持 done、blocked 或 running');
    }
    if (status === 'done') {
      const missing = [];
      for (const output of definition.outputs || []) {
        if (typeof output === 'string' && !output.endsWith('/**') && !(await pathExistsInWorkspace(workspacePath, output))) {
          missing.push(output);
        }
      }
      if (missing.length) {
        throw new Error(`步骤完成前缺少必需产物：${missing.join('、')}`);
      }
    }
    const evidenceByStep = {
      '07-review-code': { kind: 'review', path: 'review/quality-report.md' },
      '08-verify-tests': { kind: 'unit-test', path: 'review/evidence/unit-test-result.md' },
      '09-run-smoke': { kind: 'smoke-test', path: 'review/evidence/smoke-test-result.md' },
    };
    const evidenceDefinition = evidenceByStep[stepId];
    let candidateId = String(body.candidateId || body.candidate || '').trim();
    let candidateEvidence = null;
    if (status === 'done' && evidenceDefinition) {
      const iteration = await readIterationStatus(workspacePath);
      candidateId = candidateId || iteration.activeCandidateId;
      if (!candidateId || iteration.activeCandidateId !== candidateId || iteration.candidateStatus !== 'valid') {
        throw new Error(`完成 ${stepId} 前必须创建并激活有效 Candidate；执行 dw candidate create 后重试。`);
      }
      candidateEvidence = await recordCandidateEvidence({
        workspacePath,
        candidateId,
        kind: evidenceDefinition.kind,
        path: evidenceDefinition.path,
        status: 'passed',
        operator: String(body.operator || '').trim() || 'local-user',
        note: String(body.summary || '').trim(),
      });
    }
    const payload = {
      stepId,
      taskId,
      status,
      changeSetId: String(body.changeSetId || body.changeSet || '').trim(),
      candidateId,
      candidateEvidenceId: candidateEvidence && candidateEvidence.evidence ? candidateEvidence.evidence.evidenceId : '',
      returnStepId,
      outputs,
      summary: String(body.summary || (status === 'blocked' ? '当前步骤被阻塞，等待补齐输入。' : 'AI step completed.')),
      nextUrl: `${localConsoleUrl(body.port)}/?workspace=${encodeURIComponent(workspacePath)}&step=${encodeURIComponent(returnStepId)}`,
      createdAt: nowIso(),
      source: 'delivery-workflow-cli',
    };
    const donePath = path.join(workspacePath, HANDOFF_DONE_FILE);
    assertWithin(workspacePath, donePath);
    await ensureDir(path.dirname(donePath));
    const transition = await transitionSteps({
      workspacePath,
      workflow,
      eventType: 'agent-handoff',
      transitions: [{ stepId, status, summary: payload.summary }],
      actor: String(body.operator || '').trim() || 'local-user',
      changeSetId: payload.changeSetId,
      candidateId: payload.candidateId,
      runId: String(body.runId || body.run || '').trim(),
      idempotencyKey: String(body.idempotencyKey || body.idempotency || '').trim(),
      expectedRevision: body.expectedRevision === undefined ? body.revision : body.expectedRevision,
      metadata: {
        taskId,
        outputs,
        candidateEvidenceId: payload.candidateEvidenceId,
      },
    });
    payload.revision = transition.revision;
    payload.transitionEventId = transition.event && transition.event.eventId || '';
    await fsp.writeFile(donePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await closeMatchingAgentSession(workspacePath, stepId, taskId, payload.status);
    return {
      workspacePath,
      doneFile: HANDOFF_DONE_FILE,
      payload,
      transition,
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
