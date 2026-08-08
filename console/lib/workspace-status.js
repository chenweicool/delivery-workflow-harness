const fsp = require('fs/promises');
const path = require('path');

function createWorkspaceStatusRuntime(deps) {
  const {
    normalizeUserPath,
    exists,
    readWorkspaceConfig,
    readWorkflowDefinition,
    ensureWorkflowProgressFiles,
    getAppAccessStates,
    listFiles,
    pathExistsInWorkspace,
    getCheckpointState,
    readWorkspaceTextFileIfExists,
    parseTaskList,
    readJsonFileIfExists,
    readAgentSessionIndex,
    workflowStepSequence,
    HANDOFF_FILE,
    HANDOFF_DONE_FILE,
  } = deps;

  function buildNextRecommendation(workflow, steps, config, appAccessStates, tasks) {
    const blockerForRequirement = (requirement) => requirement.path === 'review/evidence/smoke-test-case.md'
      ? '阻塞：缺少研发提测前提供的冒烟用例 review/evidence/smoke-test-case.md；请由研发补充后再执行冒烟验证。'
      : `阻塞：缺少前置产物 ${requirement.path}；请先完成生成该产物的上一步。`;
    const sequence = workflowStepSequence(workflow);
    const next = sequence.find((step) => steps[step.id] && !steps[step.id].done);
    if (!next) {
      return {
        status: 'done',
        title: '流程已完成',
        summary: '当前 workflow 中的步骤都已完成。请核对交付产物；如需生成统计报告，执行 dw report complete --workspace <path>。',
        stepId: '',
        unitId: '',
        blockers: [],
      };
    }
  
    const step = steps[next.id];
    const blockers = [];
    for (const requirement of step.requirementStatuses || []) {
      if (!requirement.exists) {
        blockers.push(blockerForRequirement(requirement));
      }
    }
  
    if (next.id === '06-implement-task') {
      if (!tasks.length) {
        blockers.push('未解析到 tasks/task-list.md 中的任务编号');
      }
      if (!appAccessStates.length) {
        blockers.push('未配置候选应用，06 实现阶段无法准备 apps/<app-name> worktree');
      }
      for (const app of appAccessStates) {
        if (!app.sourceExists) {
          blockers.push(`应用源目录不存在：${app.name}`);
        } else if (!app.sourceIsGit) {
          blockers.push(`应用源目录不是 git 仓库：${app.name}`);
        }
      }
    }
  
    if (step.kind === 'manual') {
      const reviewFiles = step.checkpoint && step.checkpoint.reviewFiles ? step.checkpoint.reviewFiles : [];
      const missingReviewFiles = reviewFiles
        .filter((item) => !item.optional && !item.exists)
        .map((item) => item.path);
      if (missingReviewFiles.length) {
        blockers.push(`待确认产物未生成：${missingReviewFiles.join('、')}`);
      }
      return {
        status: blockers.length ? 'blocked' : 'waiting',
        title: blockers.length ? `等待产物：${step.title || next.id}` : `需要人工确认：${step.title || next.id}`,
        summary: blockers.length
          ? '当前不能确认：请先按阻塞说明补齐产物，再回到本节点。'
          : `当前产物已齐备：请预览确认文件、勾选确认清单，并记录确认或退回意见。确认后下一步将自动切换。`,
        stepId: next.id,
        unitId: next.unitId,
        blockers,
      };
    }
  
    return {
      status: blockers.length || step.blocked ? 'blocked' : 'ready',
      title: blockers.length || step.blocked ? `暂不能执行：${step.title || next.id}` : `建议执行：${step.title || next.id}`,
      summary: blockers.length || step.blocked
        ? '当前不能执行：请按下方阻塞说明处理前置确认、任务、代码访问或研发输入。'
        : step.kind === 'agent'
          ? `当前步骤可以交给 Codex / Claude：执行 ${step.commandFile || '当前命令'}，回写产物后系统会定位下一步。`
          : '当前步骤由页面本地流程处理。',
      stepId: next.id,
      unitId: next.unitId,
      blockers,
    };
  }

  function taskIdsFromProgress(content, label) {
    const line = new RegExp(`^-\\s*${label}：\\s*(.+)$`, 'm').exec(String(content || ''));
    return new Set(line ? [...line[1].matchAll(/\bT\d{3,}\b/gi)].map((item) => item[0].toUpperCase()) : []);
  }
  
  async function getWorkspaceStatus(workspacePathValue) {
    const workspacePath = normalizeUserPath(workspacePathValue);
    if (!workspacePath) {
      return { exists: false, message: '未选择 workspace' };
    }
  
    const workspaceExists = await exists(workspacePath);
    const isWorkspace =
      workspaceExists &&
      (await exists(path.join(workspacePath, 'AGENTS.md'))) &&
      (await exists(path.join(workspacePath, '.workflow', 'commands')));
  
    if (!isWorkspace) {
      return { exists: workspaceExists, isWorkspace: false, workspacePath, message: '不是有效 delivery workflow workspace' };
    }
  
    const config = await readWorkspaceConfig(workspacePath);
    const workflow = await readWorkflowDefinition(workspacePath);
    const workflowProgress = await ensureWorkflowProgressFiles(workspacePath, workflow);
    const appAccessStates = await getAppAccessStates(workspacePath, config);
    const prdFiles = await listFiles(workspacePath, 'prd', 120);
    const artifactFiles = await listFiles(workspacePath, 'design', 120);
    artifactFiles.push(...(await listFiles(workspacePath, 'tasks', 60)));
    artifactFiles.push(...(await listFiles(workspacePath, 'review', 60)));
    artifactFiles.push(...(await listFiles(workspacePath, 'delivery', 60)));
    artifactFiles.push(...(await listFiles(workspacePath, 'archive', 60)));
    const materialPrdFiles = prdFiles.filter(
      (item) => item.type === 'file' && item.path !== 'prd/README.md' && !item.path.endsWith('/.gitkeep')
    );
    const allArtifactFiles = artifactFiles.filter((item) => item.type === 'file' && !item.path.endsWith('/.gitkeep'));
    const visibleArtifactFiles = allArtifactFiles.filter((item) => !/(^|\/)(process|approvals|templates)\//.test(item.path));
    const hasExternalPrdSource = Array.isArray(config.feishuDocs) && config.feishuDocs.some((item) => String(item || '').trim());
    const hasParsedPrd = await pathExistsInWorkspace(workspacePath, 'prd/document.md');
    const taskListContent = await readWorkspaceTextFileIfExists(workspacePath, 'tasks/task-list.md');
    const taskProgressContent = await readWorkspaceTextFileIfExists(workspacePath, 'tasks/process/task-progress.md');
    const taskConfirmationContent = await readWorkspaceTextFileIfExists(workspacePath, 'tasks/process/task-confirmation.md');
    const tasks = taskListContent ? parseTaskList(taskListContent) : [];
    const allowedTaskIds = taskIdsFromProgress(taskConfirmationContent, '本轮允许 AI 实施任务');
    const completedTaskIds = taskIdsFromProgress(taskProgressContent, '已完成任务');
    const requiredTaskIds = allowedTaskIds.size
      ? [...allowedTaskIds]
      : tasks.filter((task) => /允许\s*AI\s*实施|允许实施/i.test(task.aiImplementable || '')).map((task) => task.id);
  
    const steps = {};
    for (const [stepId, definition] of Object.entries(workflow.steps)) {
      const outputStatuses = [];
      for (const output of definition.outputs || []) {
        if (output.endsWith('/**')) {
          const dir = output.slice(0, -3);
          const files = dir === 'prd' ? materialPrdFiles : await listFiles(workspacePath, dir, 1);
          outputStatuses.push({ path: output, exists: files.some((item) => item.type === 'file') });
        } else {
          outputStatuses.push({ path: output, exists: await pathExistsInWorkspace(workspacePath, output) });
        }
      }
      let done = outputStatuses.length ? outputStatuses.every((item) => item.exists) : false;
      if (stepId === 'import-prd') {
        done = hasParsedPrd;
        outputStatuses.splice(0, outputStatuses.length, {
          path: hasExternalPrdSource && !materialPrdFiles.length ? '飞书/外部 PRD 链接' : 'prd/**',
          exists: materialPrdFiles.length > 0 || hasExternalPrdSource,
        }, {
          path: 'prd/document.md',
          exists: hasParsedPrd,
        });
      }
      if (stepId === '06-implement-task' && requiredTaskIds.length) {
        const executionArtifactsReady = outputStatuses.every((item) => item.exists);
        done = executionArtifactsReady && requiredTaskIds.every((taskId) => completedTaskIds.has(taskId));
      }
      const requirementStatuses = [];
      for (const requirement of definition.requires || []) {
        requirementStatuses.push({ path: requirement, exists: await pathExistsInWorkspace(workspacePath, requirement) });
      }
      const blocked = requirementStatuses.some((item) => !item.exists);
      const checkpoint = await getCheckpointState(workspacePath, definition);
      steps[stepId] = {
        ...definition,
        id: stepId,
        done: checkpoint ? checkpoint.status === 'approved' : done,
        blocked,
        outputStatuses,
        requirementStatuses,
        checkpoint,
      };
    }
  
    const units = workflow.units.map((unit) => {
      const unitSteps = unit.steps.map((stepId) => steps[stepId]).filter(Boolean);
      const doneCount = unitSteps.filter((step) => step.done).length;
      const hasManualCheckpoint = unitSteps.some((step) => step.kind === 'manual');
      let status = 'idle';
      if (unitSteps.length && doneCount === unitSteps.length) {
        status = 'done';
      } else if (hasManualCheckpoint && doneCount > 0) {
        status = 'waiting';
      } else if (doneCount > 0 || unit.id === 'workspace') {
        status = 'active';
      }
      return { ...unit, status, doneCount, stepCount: unitSteps.length };
    });
    const nextRecommendation = buildNextRecommendation(workflow, steps, config, appAccessStates, tasks);
    const handoffDone = await readJsonFileIfExists(workspacePath, HANDOFF_DONE_FILE);
    const handoffDonePath = path.join(workspacePath, HANDOFF_DONE_FILE);
    const handoffCurrentPath = path.join(workspacePath, HANDOFF_FILE);
    const handoffState = {
      currentFile: HANDOFF_FILE,
      doneFile: HANDOFF_DONE_FILE,
      hasCurrent: await exists(handoffCurrentPath),
      done: Boolean(handoffDone),
      donePayload: handoffDone || null,
      currentModifiedAt: await exists(handoffCurrentPath) ? (await fsp.stat(handoffCurrentPath)).mtime.toISOString() : '',
      doneModifiedAt: await exists(handoffDonePath) ? (await fsp.stat(handoffDonePath)).mtime.toISOString() : '',
    };
    const agentSessions = await readAgentSessionIndex(workspacePath);
  
    return {
      exists: true,
      isWorkspace: true,
      workspacePath,
      config,
      progress: workflowProgress,
      workflow: {
        version: workflow.version,
        source: workflow.source,
        description: workflow.description,
      },
      prdFiles,
      materialPrdCount: materialPrdFiles.length,
      artifactFiles: visibleArtifactFiles,
      allArtifactFiles,
      appAccessStates,
      tasks,
      implementation: {
        requiredTaskIds,
        completedTaskIds: [...completedTaskIds],
        pendingTaskIds: requiredTaskIds.filter((taskId) => !completedTaskIds.has(taskId)),
      },
      handoffState,
      agentSessions,
      nextRecommendation,
      units,
      steps,
    };
  }

  return {
    buildNextRecommendation,
    getWorkspaceStatus,
  };
}

module.exports = {
  createWorkspaceStatusRuntime,
};
