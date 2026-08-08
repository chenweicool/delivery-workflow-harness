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
    freezeDesignBaselines,
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
      ? '已使用 `design/process/technical-review.md` 中的结构化评审意见。'
      : note || '本轮未填写具体退回原因，请补充评审意见后重新生成技术方案。';
    const reviewFile = TECHNICAL_REVIEW_FILE;
    const changelogFile = 'design/process/technical-design.changelog.md';
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

  function extractSections(markdown, headings, limit = 5000) {
    const source = String(markdown || '');
    const result = [];
    for (const heading of headings) {
      const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = source.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'mi'));
      if (match && match[1].trim()) {
        result.push(`## ${heading}\n\n${match[1].trim()}`);
      }
    }
    return result.join('\n\n').slice(0, limit);
  }

  async function writeCurrentContext(workspacePath, payload) {
    const workspace = await readJsonFileIfExists(workspacePath, '.workflow/workspace.json') || {};
    const requirementPath = 'design/process/requirement-confirmation.md';
    const technicalConfirmationPath = 'design/process/technical-confirmation.md';
    const requirement = await readWorkspaceTextFileIfExists(workspacePath, requirementPath);
    const technicalConfirmation = await readWorkspaceTextFileIfExists(workspacePath, technicalConfirmationPath);
    const requirementSummary = extractSections(requirement, ['需求目标', '非目标范围', '确认结果']);
    const technicalSummary = extractSections(technicalConfirmation, ['确认结果', '研发协作确认']);
    const locks = [
      '.workflow/baselines/technical-design.lock.json',
      '.workflow/baselines/unit-test-design.lock.json',
    ];
    const appLines = Array.isArray(workspace.apps) && workspace.apps.length
      ? workspace.apps.map((app) => `- ${app.name || app.sourcePath || '未命名应用'}：${app.worktreePath || app.sourcePath || '待确认'}`).join('\n')
      : '- 尚未配置应用。';
    await writeWorkspaceTextFile(workspacePath, 'context/current-context.md', [
      '# 当前已批准上下文',
      '',
      '> 本文件在技术方案人工批准后生成，供新开启的 Codex / Claude 会话快速恢复本需求背景。它是索引和已确认结论摘要；完整证据仍以链接的正式产物为准。',
      '',
      `- 需求：${workspace.demandName || path.basename(workspacePath)}`,
      `- 批准时间：${payload.createdAt}`,
      `- 批准人：${payload.operator || 'local-user'}`,
      '- 当前允许状态：可进入任务拆分；代码实现仍须经过任务人工确认。',
      '',
      '## 新会话必读顺序',
      '',
      '1. `AGENTS.md`、`CLAUDE.md`、`.workflow/progress.md`。',
      '2. 本文件。',
      '3. `design/technical-design.md`、`design/unit-test-design.md`。',
      `4. ${requirementPath}、${technicalConfirmationPath}。`,
      '5. 按当前阶段再读取 `tasks/task-list.md`、Review 证据或代码 worktree。',
      '',
      '## 已批准正式产物',
      '',
      '- `design/technical-design.md`',
      '- `design/unit-test-design.md`',
      '- 冻结证据：',
      ...locks.map((item) => `  - \`${item}\``),
      '',
      '## 已确认需求结论摘要',
      '',
      requirementSummary || `请读取 \`${requirementPath}\` 获取完整确认结论。`,
      '',
      '## 已确认技术与协作结论摘要',
      '',
      technicalSummary || `请读取 \`${technicalConfirmationPath}\` 获取完整确认结论。`,
      '',
      '## 已确认应用',
      '',
      appLines,
      '',
      '## 使用边界',
      '',
      '- 本文件不替代正式方案、冻结基线或人工确认记录；发生冲突时，以这些原始证据为准。',
      '- 未写入本文件的新结论不得视为已批准；应先更新相应正式产物并走人工确认。',
      '- 不要把本需求背景复制回共享团队 Skill、Rule 或领域 Harness。',
      '',
    ].join('\n'));
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
      if (stepId === 'manual-technical') {
        await freezeDesignBaselines(workspacePath, payload);
      }
      await writeWorkspaceJsonFile(workspacePath, definition.approvalFile, payload);
      if (stepId === 'manual-technical') {
        await writeCurrentContext(workspacePath, payload);
      }
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
    writeCurrentContext,
    getCheckpointState,
    submitCheckpoint,
  };
}

module.exports = {
  createCheckpointRuntime,
};
