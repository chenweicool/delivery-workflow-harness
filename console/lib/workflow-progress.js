const fsp = require('fs/promises');
const path = require('path');

const WORKFLOW_PROGRESS_FILE = '.workflow/progress.md';
const WORKFLOW_PROGRESS_JSON_FILE = '.workflow/progress.json';

function createWorkflowProgressRuntime(deps) {
  const {
    assertWithin,
    ensureDir,
    exists,
    pathExistsInWorkspace,
    getCheckpointState,
    readWorkflowDefinition,
    workflowStepSequence,
    progressMarkdown,
    nowIso,
  } = deps;

  async function inferStepProgressStatus(workspacePath, definition) {
    if (!definition) {
      return 'pending';
    }
    if (definition.kind === 'manual') {
      const checkpoint = await getCheckpointState(workspacePath, definition);
      if (checkpoint && checkpoint.status === 'approved') {
        return 'done';
      }
      if (checkpoint && checkpoint.status === 'rejected') {
        return 'rejected';
      }
      return 'pending';
    }
    const outputs = (definition.outputs || []).filter((output) => typeof output === 'string'
      && !output.endsWith('/**')
      && !(definition.kind === 'local' && ['.workflow/progress.md', '.workflow/progress.json'].includes(output)));
    if (!outputs.length) {
      return 'pending';
    }
    const outputStatuses = await Promise.all(outputs.map((output) => pathExistsInWorkspace(workspacePath, output)));
    return outputStatuses.every(Boolean) ? 'done' : 'pending';
  }
  
  async function readWorkflowProgress(workspacePath, workflow = null) {
    const filePath = path.join(workspacePath, WORKFLOW_PROGRESS_JSON_FILE);
    assertWithin(workspacePath, filePath);
    const resolvedWorkflow = workflow || await readWorkflowDefinition(workspacePath);
    if (await exists(filePath)) {
      let existing;
      try {
        existing = JSON.parse(await fsp.readFile(filePath, 'utf8'));
      } catch (error) {
        throw new Error(`进度文件不是合法 JSON：${WORKFLOW_PROGRESS_JSON_FILE}；${error.message}`);
      }
      try {
        existing.steps = existing.steps && typeof existing.steps === 'object' ? existing.steps : {};
        for (const step of workflowStepSequence(resolvedWorkflow)) {
          if (!existing.steps[step.id]) {
            existing.steps[step.id] = {
              status: await inferStepProgressStatus(workspacePath, resolvedWorkflow.steps[step.id]),
              updatedAt: '',
              summary: '',
            };
          }
        }
        return {
          ...existing,
          version: Math.max(2, Number(existing.version) || 1),
          revision: Number.isInteger(Number(existing.revision)) && Number(existing.revision) >= 0 ? Number(existing.revision) : 0,
          latest: existing.latest || {},
          steps: existing.steps,
        };
      } catch (error) {
        throw new Error(`进度文件结构无效：${WORKFLOW_PROGRESS_JSON_FILE}；${error.message}`);
      }
    }
    const steps = {};
    for (const step of workflowStepSequence(resolvedWorkflow)) {
      steps[step.id] = {
        status: await inferStepProgressStatus(workspacePath, resolvedWorkflow.steps[step.id]),
        updatedAt: '',
        summary: '',
      };
    }
    const progress = {
      version: 2,
      revision: 0,
      updatedAt: nowIso(),
      latest: {},
      steps,
    };
    return progress;
  }
  
  async function writeWorkflowProgress(workspacePath, workflow, progress) {
    const mdPath = path.join(workspacePath, WORKFLOW_PROGRESS_FILE);
    const jsonPath = path.join(workspacePath, WORKFLOW_PROGRESS_JSON_FILE);
    assertWithin(workspacePath, mdPath);
    assertWithin(workspacePath, jsonPath);
    await ensureDir(path.dirname(mdPath));
    const next = {
      ...progress,
      version: Math.max(2, Number(progress.version) || 1),
      revision: Number.isInteger(Number(progress.revision)) && Number(progress.revision) >= 0 ? Number(progress.revision) : 0,
      updatedAt: nowIso(),
    };
    await fsp.writeFile(jsonPath, JSON.stringify(next, null, 2), 'utf8');
    await fsp.writeFile(mdPath, progressMarkdown(workflow, next), 'utf8');
    return next;
  }
  
  async function ensureWorkflowProgressFiles(workspacePath, workflow = null) {
    const resolvedWorkflow = workflow || await readWorkflowDefinition(workspacePath);
    const progress = await readWorkflowProgress(workspacePath, resolvedWorkflow);
    return writeWorkflowProgress(workspacePath, resolvedWorkflow, progress);
  }

  return {
    inferStepProgressStatus,
    readWorkflowProgress,
    writeWorkflowProgress,
    ensureWorkflowProgressFiles,
  };
}

module.exports = {
  WORKFLOW_PROGRESS_FILE,
  WORKFLOW_PROGRESS_JSON_FILE,
  createWorkflowProgressRuntime,
};
