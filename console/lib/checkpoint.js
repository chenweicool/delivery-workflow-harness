const path = require('path');

function createCheckpointRuntime(deps) {
  const {
    normalizeUserPath,
    readWorkspaceTextFileIfExists,
    pathExistsInWorkspace,
    writeWorkspaceTextFile,
    appendWorkspaceTextFile,
    readJsonFileIfExists,
    readWorkflowDefinition,
    exists,
    writeWorkspaceJsonFile,
    unlinkWorkspaceFileIfExists,
    readWorkflowProgress,
    writeWorkflowProgress,
    nowIso,
    TECHNICAL_REVIEW_FILE,
    TECHNICAL_REVIEW_TEMPLATE,
  } = deps;

  function technicalReviewTemplate() {
    return typeof TECHNICAL_REVIEW_TEMPLATE === 'function'
      ? TECHNICAL_REVIEW_TEMPLATE()
      : TECHNICAL_REVIEW_TEMPLATE;
  }

  async function appendTechnicalReview(workspacePath, payload) {
    const note = String(payload.note || '').trim();
    const existingReview = (await readWorkspaceTextFileIfExists(workspacePath, TECHNICAL_REVIEW_FILE)).trim();
    const hasMeaningfulReview = existingReview && existingReview !== technicalReviewTemplate().trim();
    const reviewBody = hasMeaningfulReview
      ? '已使用 `design/technical-review.md` 中的结构化评审意见。'
      : note || '本轮未填写具体退回原因，请补充评审意见后重新生成技术方案。';
    const reviewFile = TECHNICAL_REVIEW_FILE;
    const changelogFile = 'design/technical-design.changelog.md';
    if (!(await pathExistsInWorkspace(workspacePath, reviewFile))) {
      await writeWorkspaceTextFile(workspacePath, reviewFile, technicalReviewTemplate());
    }
    if (!hasMeaningfulReview && note) {
      await appendWorkspaceTextFile(
        workspacePath,
        reviewFile,
        [
          '',
          `## ${payload.createdAt} / ${payload.operator}`,
          '',
          '### 快速退回意见',
          '',
          note,
          '',
        ].join('\n')
      );
    }
    if (!(await pathExistsInWorkspace(workspacePath, changelogFile))) {
      await writeWorkspaceTextFile(
        workspacePath,
        changelogFile,
        [
          '# 技术方案修订记录',
          '',
          '| 时间 | 类型 | 说明 |',
          '| --- | --- | --- |',
        ].join('\n')
      );
    }
    const summary = reviewBody.replace(/\s+/g, ' ').slice(0, 120);
    await appendWorkspaceTextFile(workspacePath, changelogFile, `| ${payload.createdAt} | 人工退回 | ${summary} |\n`);
  }
  
  async function getCheckpointState(workspacePath, definition) {
    if (!definition || definition.kind !== 'manual') {
      return null;
    }
    const approval = await readJsonFileIfExists(workspacePath, definition.approvalFile);
    const rejection = await readJsonFileIfExists(workspacePath, definition.rejectionFile);
    let status = 'pending';
    if (approval) {
      status = 'approved';
    } else if (rejection) {
      status = 'rejected';
    }
    const reviewFileStatuses = [];
    for (const item of definition.reviewFiles || []) {
      const reviewFile = typeof item === 'string' ? item : item.path;
      reviewFileStatuses.push({
        path: reviewFile,
        exists: await pathExistsInWorkspace(workspacePath, reviewFile),
        optional: typeof item === 'object' && Boolean(item.optional),
      });
    }
    return {
      status,
      approval,
      rejection,
      approvalFile: definition.approvalFile || '',
      rejectionFile: definition.rejectionFile || '',
      reviewFiles: reviewFileStatuses,
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
    if (!definition || definition.kind !== 'manual') {
      throw new Error(`不是人工确认步骤：${stepId}`);
    }
    if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
      throw new Error('当前目录不是有效 workspace');
    }
  
    const reviewFiles = [];
    for (const item of definition.reviewFiles || []) {
      const reviewFile = typeof item === 'string' ? item : item.path;
      reviewFiles.push({
        path: reviewFile,
        exists: await pathExistsInWorkspace(workspacePath, reviewFile),
        optional: typeof item === 'object' && Boolean(item.optional),
      });
    }
    if (action === 'approve' && reviewFiles.some((item) => !item.optional && !item.exists)) {
      throw new Error(`待确认产物不存在：${reviewFiles.filter((item) => !item.optional && !item.exists).map((item) => item.path).join(', ')}`);
    }
    const requiredChecklist = definition.checklist || [];
    if (action === 'approve') {
      const checkedIds = new Set(checklist.filter((item) => item && item.checked).map((item) => item.id));
      const missingChecklist = requiredChecklist.filter((item) => !checkedIds.has(item.id));
      if (missingChecklist.length) {
        throw new Error(`请先完成确认清单：${missingChecklist.map((item) => item.label).join('、')}`);
      }
    }
  
    const payload = {
      stepId,
      action,
      status: action === 'approve' ? 'approved' : 'rejected',
      operator,
      note,
      reviewFiles,
      checklistTemplate: requiredChecklist,
      checklist,
      createdAt: nowIso(),
    };
  
    if (action === 'approve') {
      await writeWorkspaceJsonFile(workspacePath, definition.approvalFile, payload);
      await unlinkWorkspaceFileIfExists(workspacePath, definition.rejectionFile);
    } else {
      await writeWorkspaceJsonFile(workspacePath, definition.rejectionFile, payload);
      await unlinkWorkspaceFileIfExists(workspacePath, definition.approvalFile);
      if (stepId === 'manual-technical') {
        await appendTechnicalReview(workspacePath, payload);
      }
    }
    const progress = await readWorkflowProgress(workspacePath, workflow);
    progress.steps = progress.steps || {};
    progress.steps[stepId] = {
      ...(progress.steps[stepId] || {}),
      status: action === 'approve' ? 'done' : 'rejected',
      updatedAt: payload.createdAt,
      summary: note || (action === 'approve' ? '人工确认通过' : '人工退回修改'),
    };
    progress.latest = {
      stepId,
      status: progress.steps[stepId].status,
      updatedAt: payload.createdAt,
      summary: progress.steps[stepId].summary,
    };
    await writeWorkflowProgress(workspacePath, workflow, progress);
  
    return { checkpoint: await getCheckpointState(workspacePath, definition) };
  }

  return {
    appendTechnicalReview,
    getCheckpointState,
    submitCheckpoint,
  };
}

module.exports = {
  createCheckpointRuntime,
};
