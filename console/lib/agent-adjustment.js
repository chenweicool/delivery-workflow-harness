const fsp = require('fs/promises');
const path = require('path');

function createAgentAdjustmentRuntime(deps) {
  const {
    normalizeApps,
    listRuns,
    readWorkspaceTextIfExists,
    truncateText,
    formatCapabilitiesForPrompt,
    assertWithin,
    ensureDir,
    nowIso,
    AI_ADJUSTMENTS_FILE,
  } = deps;

async function buildAiAdjustmentPrompt(workspacePath, body, runConfig, preparedWorktrees, diffSummary, capabilities = { skills: [], rules: [], notes: '' }) {
  const taskId = String(body.taskId || '').trim().toUpperCase();
  const instruction = String(body.instruction || '').trim();
  const selectedApp = String(body.appName || '').trim();
  const targetApps = preparedWorktrees.length
    ? preparedWorktrees
    : normalizeApps(runConfig.apps, runConfig.appPaths).map((app) => ({
      name: app.name,
      sourcePath: app.sourcePath,
      worktreePath: app.sourcePath,
      branchName: app.featureBranch || '',
    }));
  const targetAppLines = targetApps
    .filter((app) => !selectedApp || app.name === selectedApp)
    .map((app) => [
      `- 应用：${app.name}`,
      `  - worktree/source：${app.worktreePath || app.sourcePath}`,
      app.branchName ? `  - 分支：${app.branchName}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n');
  const recentRuns = (await listRuns(workspacePath))
    .filter((run) => !taskId || String(run.taskId || '').toUpperCase() === taskId || run.stepId === '06-implement-task')
    .slice(0, 5)
    .map((run) => `- ${run.startedAt || run.updatedAt} / ${run.stepId} / ${run.executor} / ${run.status} / ${run.runId}`)
    .join('\n');
  const files = [
    ['技术方案', 'design/technical-design.md'],
    ['技术方案确认', 'design/technical-confirmation.md'],
    ['任务清单', 'tasks/task-list.md'],
    ['任务确认', 'tasks/task-confirmation.md'],
    ['任务进度', 'tasks/task-progress.md'],
    ['变更记录', 'review/change-log.md'],
    ['自检记录', 'review/self-check.md'],
    ['AI Review', 'review/ai-review.md'],
  ];
  const contextSections = [];
  for (const [title, file] of files) {
    const content = await readWorkspaceTextIfExists(workspacePath, file);
    if (content) {
      contextSections.push(`## ${title}：${file}\n\n${truncateText(content, 12000)}`);
    }
  }

  return [
    '# AI 调整任务',
    '',
    '你正在 delivery workflow 的代码实现后调整阶段工作。用户希望像 vibe coding 一样基于现有任务和代码 diff 继续修改。',
    '',
    '## 用户本轮调整诉求',
    '',
    instruction,
    '',
    '## 执行边界',
    '',
    `- Workspace: ${workspacePath}`,
    taskId ? `- 当前任务编号: ${taskId}` : '- 当前任务编号: 未指定',
    selectedApp ? `- 用户选择应用: ${selectedApp}` : '- 用户选择应用: 全部相关应用',
    '',
    '## 允许操作',
    '',
    '- 可以读取 workspace、任务文档、技术方案、确认文件、review 文件和目标应用 worktree。',
    '- 可以修改目标应用 worktree 内代码、测试和必要配置。',
    '- 可以更新 workspace 内的任务进度、变更记录、自检记录和 AI 调整记录。',
    '',
    '## 必须遵守',
    '',
    '- 先理解用户调整诉求，再看当前 diff，避免重复实现已完成内容。',
    '- 如果用户诉求和已确认技术方案/任务确认冲突，必须停止并说明冲突，不要强行改。',
    '- 修改完成后，必须更新 review/change-log.md、review/self-check.md 和 tasks/ai-adjustments.md。',
    '- 不要提交 git commit，不要 push。',
    '- 输出中文总结，说明改了什么、未完成什么、需要人工确认什么。',
    '',
    '## 目标应用 / Worktree',
    '',
    targetAppLines || '- 未配置应用目录',
    '',
    '## 最近运行记录',
    '',
    recentRuns || '- 暂无运行记录',
    '',
    '## 交付配置能力',
    '',
    formatCapabilitiesForPrompt(capabilities),
    '',
    '## 当前代码 Diff 摘要',
    '',
    diffSummary || '- 暂无 diff 或无法读取 diff',
    '',
    '## 已有上下文文件',
    '',
    contextSections.join('\n\n') || '- 暂无上下文文件',
  ].join('\n');
}

async function appendAiAdjustmentRecord(workspacePath, body, runId, targetApps) {
  const targetFile = path.join(workspacePath, AI_ADJUSTMENTS_FILE);
  assertWithin(workspacePath, targetFile);
  await ensureDir(path.dirname(targetFile));
  const taskId = String(body.taskId || '').trim().toUpperCase() || '未指定';
  const appLine = targetApps.map((app) => app.name || app.worktreePath || app.sourcePath).filter(Boolean).join('、') || '未指定';
  const content = [
    `## ${nowIso()} / ${runId}`,
    '',
    `- 任务编号：${taskId}`,
    `- 目标应用：${appLine}`,
    `- 执行器：${body.executor === 'claude' ? 'claude' : 'codex'}`,
    '',
    '### 用户调整诉求',
    '',
    String(body.instruction || '').trim(),
    '',
  ].join('\n');
  await fsp.appendFile(targetFile, content, 'utf8');
}

  return {
    buildAiAdjustmentPrompt,
    appendAiAdjustmentRecord,
  };
}

module.exports = {
  createAgentAdjustmentRuntime,
};
