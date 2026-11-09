const path = require('path');

function createCheckpointRuntime(deps) {
  const {
    normalizeUserPath,
    pathExistsInWorkspace,
    readJsonFileIfExists,
    readWorkflowDefinition,
    exists,
    writeWorkspaceJsonFile,
    unlinkWorkspaceFileIfExists,
    transitionSteps,
    nowIso,
    validateDeliveryArtifacts,
  } = deps;

  async function getCheckpointState(workspacePath, definition) {
    if (!definition || definition.kind !== 'manual') return null;
    const approval = await readJsonFileIfExists(workspacePath, definition.approvalFile);
    const rejection = await readJsonFileIfExists(workspacePath, definition.rejectionFile);
    let status = approval ? 'approved' : rejection ? 'rejected' : 'pending';
    let staleReason = '';
    if (approval && approval.status === 'superseded') status = 'superseded';
    if (approval && definition.approvalFile === '.workflow/approvals/release.approved.json') {
      try {
        const validation = await validateDeliveryArtifacts(workspacePath);
        if (validation.status !== 'ready' || approval.deliveryFingerprint !== validation.snapshot.fingerprint) {
          status = 'stale';
          staleReason = validation.issues.join('、') || '发布确认绑定的代码指纹已变化。';
        }
      } catch (error) {
        status = 'stale';
        staleReason = error.message;
      }
    }
    const reviewFiles = [];
    for (const item of definition.reviewFiles || []) {
      const relativePath = typeof item === 'string' ? item : item.path;
      reviewFiles.push({ path: relativePath, exists: await pathExistsInWorkspace(workspacePath, relativePath), optional: typeof item === 'object' && Boolean(item.optional) });
    }
    return {
      status, staleReason, approval, rejection,
      approvalFile: definition.approvalFile || '',
      rejectionFile: definition.rejectionFile || '',
      reviewFiles,
    };
  }

  async function submitCheckpoint(body, action) {
    const workspacePath = normalizeUserPath(body.workspacePath);
    const stepId = String(body.stepId || '').trim();
    const note = String(body.note || '').trim();
    const operator = String(body.operator || '').trim() || 'local-user';
    const checklist = Array.isArray(body.checklist) ? body.checklist : [];
    const workflow = await readWorkflowDefinition(workspacePath);
    const definition = workflow.steps[stepId];
    if (!definition || definition.kind !== 'manual') throw new Error(`不是人工确认步骤：${stepId}`);
    if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) throw new Error('当前目录不是有效 Workspace');
    const reviewFiles = [];
    for (const item of definition.reviewFiles || []) {
      const relativePath = typeof item === 'string' ? item : item.path;
      reviewFiles.push({ path: relativePath, exists: await pathExistsInWorkspace(workspacePath, relativePath), optional: typeof item === 'object' && Boolean(item.optional) });
    }
    if (action === 'approve' && reviewFiles.some((item) => !item.optional && !item.exists)) {
      throw new Error(`待确认产物不存在：${reviewFiles.filter((item) => !item.optional && !item.exists).map((item) => item.path).join('、')}`);
    }
    const requiredChecklist = definition.checklist || [];
    if (action === 'approve') {
      const checkedIds = new Set(checklist.filter((item) => item && item.checked).map((item) => item.id));
      const missing = requiredChecklist.filter((item) => !checkedIds.has(item.id));
      if (missing.length) throw new Error(`请先完成确认清单：${missing.map((item) => item.label).join('、')}`);
    }
    let deliveryValidation = null;
    if (action === 'approve' && stepId === 'manual-release') {
      deliveryValidation = await validateDeliveryArtifacts(workspacePath);
      if (deliveryValidation.status !== 'ready') throw new Error(`发布确认前交付物校验未通过：${deliveryValidation.issues.join('、')}`);
    }
    const payload = {
      stepId, action, status: action === 'approve' ? 'approved' : 'rejected', operator, note,
      reviewFiles, checklistTemplate: requiredChecklist, checklist,
      deliveryFingerprint: deliveryValidation ? deliveryValidation.snapshot.fingerprint : '',
      createdAt: nowIso(),
    };
    const summary = note || (action === 'approve' ? '人工确认发布' : '人工退回修改');
    const transition = await transitionSteps({
      workspacePath, workflow, eventType: 'manual-checkpoint',
      transitions: [{ stepId, status: action === 'approve' ? 'done' : 'rejected', summary }],
      actor: operator,
      expectedRevision: body.expectedRevision === undefined ? body.revision : body.expectedRevision,
      idempotencyKey: String(body.idempotencyKey || body.idempotency || '').trim(),
      metadata: { action, approvalFile: definition.approvalFile || '', rejectionFile: definition.rejectionFile || '', deliveryFingerprint: payload.deliveryFingerprint },
      beforeCommit: async () => {
        if (action === 'approve') {
          await writeWorkspaceJsonFile(workspacePath, definition.approvalFile, payload);
          await unlinkWorkspaceFileIfExists(workspacePath, definition.rejectionFile);
        } else {
          await writeWorkspaceJsonFile(workspacePath, definition.rejectionFile, payload);
          await unlinkWorkspaceFileIfExists(workspacePath, definition.approvalFile);
        }
      },
    });
    return { checkpoint: await getCheckpointState(workspacePath, definition), transition };
  }

  return { getCheckpointState, submitCheckpoint };
}

module.exports = { createCheckpointRuntime };
