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
    const sequence = workflowStepSequence(workflow);
    const next = sequence.find((step) => steps[step.id] && !steps[step.id].done);
    if (!next) {
      return {
        status: 'done',
        title: '流程已完成',
        summary: '当前 workflow 中的步骤都已完成，可以进入交付回收或归档复盘。',
        stepId: '',
        unitId: '',
        blockers: [],
      };
    }
  
    const step = steps[next.id];
    const blockers = [];
    for (const requirement of step.requirementStatuses || []) {
      if (!requirement.exists) {
        blockers.push(`缺少前置产物：${requirement.path}`);
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
          ? '先完成上一步 AI 产物，再回到人工确认区处理。'
          : '请预览确认文件、勾选确认清单，并记录确认或退回意见。',
        stepId: next.id,
        unitId: next.unitId,
        blockers,
      };
    }
  
    return {
      status: blockers.length || step.blocked ? 'blocked' : 'ready',
      title: blockers.length || step.blocked ? `暂不能执行：${step.title || next.id}` : `建议执行：${step.title || next.id}`,
      summary: blockers.length || step.blocked
        ? '先处理前置确认、任务或应用代码访问问题。'
        : step.kind === 'agent'
          ? '当前步骤可以交给 Codex / Claude，执行后回到页面查看产物。'
          : '当前步骤由页面本地流程处理。',
      stepId: next.id,
      unitId: next.unitId,
      blockers,
    };
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
      (item) => item.type === 'file' && !['prd/README.md', 'prd/.gitkeep'].includes(item.path)
    );
    const visibleArtifactFiles = artifactFiles.filter((item) => item.type === 'file' && !item.path.endsWith('/.gitkeep'));
    const hasExternalPrdSource = Array.isArray(config.feishuDocs) && config.feishuDocs.some((item) => String(item || '').trim());
    const hasParsedPrd = await pathExistsInWorkspace(workspacePath, 'prd/document.md');
  
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
    const taskListContent = await readWorkspaceTextFileIfExists(workspacePath, 'tasks/task-list.md');
    const tasks = taskListContent ? parseTaskList(taskListContent) : [];
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
      appAccessStates,
      tasks,
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
