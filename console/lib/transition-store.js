const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');

const TRANSITION_EVENTS_FILE = '.workflow/events.jsonl';
const TRANSITION_INDEX_FILE = '.workflow/events-index.json';
const TRANSITION_LOCK_FILE = '.workflow/transition.lock';
const LOCK_STALE_MS = 2 * 60 * 1000;

function emptyIndex(revision = 0) {
  return { schemaVersion: 1, revision, idempotency: {} };
}

function normalizedRevision(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function transitionConflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  error.code = 'TRANSITION_CONFLICT';
  return error;
}

function transitionEventsIndex(events) {
  const index = emptyIndex(events.length ? events[events.length - 1].revision : 0);
  for (const event of events) {
    if (event.idempotencyKey) index.idempotency[event.idempotencyKey] = event;
  }
  const keys = Object.keys(index.idempotency);
  if (keys.length > 200) {
    keys.slice(0, keys.length - 200).forEach((key) => delete index.idempotency[key]);
  }
  return index;
}

function createTransitionStoreRuntime(deps) {
  const {
    normalizeUserPath,
    exists,
    assertWithin,
    ensureDir,
    readJsonFileIfExists,
    writeWorkspaceJsonFile,
    readWorkflowProgress,
    writeWorkflowProgress,
    nowIso,
  } = deps;

  async function assertWorkspace(workspacePathValue) {
    const workspacePath = normalizeUserPath(workspacePathValue || '');
    if (!workspacePath || !(await exists(path.join(workspacePath, 'AGENTS.md')))) {
      throw new Error('请选择有效的 Delivery Workflow workspace');
    }
    return workspacePath;
  }

  async function withTransitionLock(workspacePath, callback) {
    const lockPath = path.join(workspacePath, TRANSITION_LOCK_FILE);
    assertWithin(workspacePath, lockPath);
    await ensureDir(path.dirname(lockPath));
    let handle = null;
    let lastError = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        handle = await fsp.open(lockPath, 'wx');
        await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: nowIso() }), 'utf8');
        break;
      } catch (error) {
        lastError = error;
        if (error.code !== 'EEXIST') throw error;
        const lockStat = await fsp.stat(lockPath).catch(() => null);
        if (lockStat && Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
          await fsp.unlink(lockPath).catch(() => {});
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    if (!handle) throw new Error(`状态转换正在被其他执行者占用，请稍后重试：${lastError && lastError.message || ''}`);
    try {
      return await callback();
    } finally {
      await handle.close().catch(() => {});
      await fsp.unlink(lockPath).catch(() => {});
    }
  }

  async function readTransitionEvents(workspacePath) {
    const eventsPath = path.join(workspacePath, TRANSITION_EVENTS_FILE);
    assertWithin(workspacePath, eventsPath);
    if (!(await exists(eventsPath))) return [];
    const content = await fsp.readFile(eventsPath, 'utf8');
    const events = [];
    for (const [lineNumber, line] of content.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        throw transitionConflict(`状态事件日志第 ${lineNumber + 1} 行不是合法 JSON，无法继续提交。`);
      }
      const revision = normalizedRevision(event.revision);
      if (revision !== events.length + 1 || !Array.isArray(event.transitions)) {
        throw transitionConflict(`状态事件日志在 revision ${events.length + 1} 处不连续或格式错误，无法继续提交。`);
      }
      events.push({ ...event, revision });
    }
    return events;
  }

  function applyEventToProgress(progress, event) {
    progress.steps = progress.steps && typeof progress.steps === 'object' ? progress.steps : {};
    for (const item of event.transitions) {
      progress.steps[item.stepId] = {
        ...(progress.steps[item.stepId] || {}),
        status: item.status,
        updatedAt: event.createdAt || '',
        summary: String(item.summary || '').trim(),
      };
    }
    const latest = event.transitions[event.transitions.length - 1];
    progress.version = Math.max(2, Number(progress.version) || 1);
    progress.revision = event.revision;
    progress.latest = {
      stepId: latest.stepId,
      status: latest.status,
      updatedAt: event.createdAt || '',
      summary: String(latest.summary || '').trim(),
    };
  }

  async function reconcileProjection(workspacePath, workflow, progress) {
    const events = await readTransitionEvents(workspacePath);
    const eventRevision = events.length ? events[events.length - 1].revision : 0;
    const progressRevision = normalizedRevision(progress.revision);
    if (progressRevision > eventRevision) {
      throw transitionConflict(`状态投影 revision 超出事件日志：progress=${progressRevision}，events=${eventRevision}；请保留 Workspace 后排查。`);
    }
    let recovered = false;
    if (progressRevision < eventRevision) {
      for (const event of events.slice(progressRevision)) applyEventToProgress(progress, event);
      await writeWorkflowProgress(workspacePath, workflow, progress);
      recovered = true;
    }
    const expectedIndex = transitionEventsIndex(events);
    const storedIndex = await readJsonFileIfExists(workspacePath, TRANSITION_INDEX_FILE);
    const storedRevision = normalizedRevision(storedIndex && storedIndex.revision);
    if (storedRevision > eventRevision) {
      throw transitionConflict(`状态事件索引 revision 超出事件日志：index=${storedRevision}，events=${eventRevision}；请保留 Workspace 后排查。`);
    }
    if (storedRevision !== eventRevision) {
      await writeWorkspaceJsonFile(workspacePath, TRANSITION_INDEX_FILE, expectedIndex);
      recovered = true;
    }
    return { progress, events, index: expectedIndex, recovered };
  }

  async function transitionSteps(body = {}) {
    const workspacePath = await assertWorkspace(body.workspacePath);
    const workflow = body.workflow;
    if (!workflow) throw new Error('状态转换缺少 workflow 定义');
    const transitions = Array.isArray(body.transitions) ? body.transitions : [];
    if (!transitions.length) throw new Error('状态转换缺少节点');
    const eventType = String(body.eventType || 'step-transition').trim();
    const idempotencyKey = String(body.idempotencyKey || '').trim();
    const expectedRevision = body.expectedRevision === undefined || body.expectedRevision === ''
      ? null
      : normalizedRevision(body.expectedRevision);
    return withTransitionLock(workspacePath, async () => {
      const progress = await readWorkflowProgress(workspacePath, workflow);
      const reconciled = await reconcileProjection(workspacePath, workflow, progress);
      const index = reconciled.index;
      if (idempotencyKey && index.idempotency[idempotencyKey]) {
        return {
          workspacePath,
          idempotent: true,
          revision: index.revision,
          event: index.idempotency[idempotencyKey],
          progress: reconciled.progress,
          recovered: reconciled.recovered,
        };
      }
      if (expectedRevision !== null && expectedRevision !== index.revision) {
        throw transitionConflict(`状态已更新，拒绝旧 revision 提交：expected=${expectedRevision}，actual=${index.revision}`);
      }
      const beforeCommit = typeof body.beforeCommit === 'function' ? body.beforeCommit : null;
      const beforeCommitResult = beforeCommit
        ? await beforeCommit({ workspacePath, revision: index.revision })
        : undefined;
      const resolvedChangeSetId = String(
        body.changeSetId || (beforeCommitResult && beforeCommitResult.changeSetId) || '',
      ).trim();
      const resolvedCandidateId = String(
        body.candidateId || (beforeCommitResult && beforeCommitResult.candidateId) || '',
      ).trim();
      const resolvedMetadata = {
        ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
        ...(beforeCommitResult && beforeCommitResult.metadata && typeof beforeCommitResult.metadata === 'object'
          ? beforeCommitResult.metadata
          : {}),
      };
      const createdAt = nowIso();
      progress.steps = progress.steps && typeof progress.steps === 'object' ? progress.steps : {};
      for (const item of transitions) {
        const stepId = String(item.stepId || '').trim();
        if (!stepId || !workflow.steps[stepId]) throw new Error(`未知 Workflow 节点：${stepId || '(empty)'}`);
        const status = String(item.status || '').trim();
        if (!['pending', 'running', 'done', 'blocked', 'rejected', 'stale'].includes(status)) {
          throw new Error(`不支持的步骤状态：${status}`);
        }
        progress.steps[stepId] = {
          ...(progress.steps[stepId] || {}),
          status,
          updatedAt: createdAt,
          summary: String(item.summary || '').trim(),
        };
      }
      const latest = transitions[transitions.length - 1];
      const revision = index.revision + 1;
      progress.version = Math.max(2, Number(progress.version) || 1);
      progress.revision = revision;
      progress.latest = {
        stepId: latest.stepId,
        status: latest.status,
        updatedAt: createdAt,
        summary: String(latest.summary || '').trim(),
      };
      const event = {
        schemaVersion: 1,
        eventId: `evt-${crypto.randomUUID()}`,
        revision,
        eventType,
        transitions: transitions.map((item) => ({ stepId: item.stepId, status: item.status, summary: String(item.summary || '').trim() })),
        actor: String(body.actor || '').trim() || 'local-user',
        changeSetId: resolvedChangeSetId,
        candidateId: resolvedCandidateId,
        runId: String(body.runId || '').trim(),
        idempotencyKey,
        metadata: resolvedMetadata,
        createdAt,
      };
      const eventsPath = path.join(workspacePath, TRANSITION_EVENTS_FILE);
      assertWithin(workspacePath, eventsPath);
      await fsp.appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
      await writeWorkflowProgress(workspacePath, workflow, progress);
      const nextIndex = transitionEventsIndex([...reconciled.events, event]);
      await writeWorkspaceJsonFile(workspacePath, TRANSITION_INDEX_FILE, nextIndex);
      return { workspacePath, idempotent: false, revision, event, progress, beforeCommitResult, recovered: reconciled.recovered };
    });
  }

  return { TRANSITION_EVENTS_FILE, TRANSITION_INDEX_FILE, transitionSteps };
}

module.exports = { TRANSITION_EVENTS_FILE, TRANSITION_INDEX_FILE, createTransitionStoreRuntime };
