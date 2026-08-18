const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

async function replaceFile(temporaryFile, targetFile) {
  try {
    await fsp.rename(temporaryFile, targetFile);
    return;
  } catch (error) {
    if (process.platform !== 'win32' || !['EACCES', 'EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) {
      throw error;
    }
  }

  const backupFile = `${temporaryFile}.previous`;
  let hasBackup = false;
  try {
    await fsp.rename(targetFile, backupFile);
    hasBackup = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  try {
    await fsp.rename(temporaryFile, targetFile);
  } catch (error) {
    if (hasBackup) {
      await fsp.rename(backupFile, targetFile).catch(() => {});
    }
    throw error;
  }
  if (hasBackup) {
    await fsp.rm(backupFile, { force: true });
  }
}

async function writeJsonAtomically(filePath, value) {
  const temporaryFile = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    await fsp.writeFile(temporaryFile, JSON.stringify(value, null, 2), 'utf8');
    await replaceFile(temporaryFile, filePath);
  } finally {
    await fsp.rm(temporaryFile, { force: true }).catch(() => {});
  }
}

async function readJsonWithRetry(filePath, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return JSON.parse(await fsp.readFile(filePath, 'utf8'));
    } catch (error) {
      lastError = error;
      const retryable = error instanceof SyntaxError || ['EBUSY', 'ENOENT', 'EPERM'].includes(error.code);
      if (!retryable || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}

function createRunStoreRuntime(deps) {
  const {
    normalizeUserPath,
    assertWithin,
    ensureDir,
    exists,
    nowIso,
    RUNS_DIR_NAME,
    RUN_LOG_PREVIEW_BYTES,
  } = deps;

function createRunId(stepId) {
  const safeStep = String(stepId || 'step').replace(/[^a-zA-Z0-9._-]/g, '-');
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${safeStep}-${suffix}`;
}

async function getRunsDir(workspacePath) {
  const runsDir = path.join(workspacePath, '.workflow', RUNS_DIR_NAME);
  assertWithin(workspacePath, runsDir);
  await ensureDir(runsDir);
  return runsDir;
}

async function writeRunMeta(runFile, meta) {
  await writeJsonAtomically(runFile, meta);
}

async function appendRunLog(logFile, text) {
  await fsp.appendFile(logFile, text, 'utf8');
}

async function readRun(workspacePathValue, runIdValue) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  const runId = String(runIdValue || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const runsDir = await getRunsDir(workspacePath);
  const runFile = path.join(runsDir, `${runId}.json`);
  const logFile = path.join(runsDir, `${runId}.log`);
  assertWithin(workspacePath, runFile);
  assertWithin(workspacePath, logFile);
  let meta;
  try {
    meta = await reconcileRunMeta(workspacePath, runFile);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`运行记录不存在：${runId}`);
    throw error;
  }
  const log = (await exists(logFile)) ? await fsp.readFile(logFile, 'utf8') : '';
  return { meta, log };
}

function isPidAlive(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function reconcileRunMeta(workspacePath, runFile) {
  const meta = await readJsonWithRetry(runFile);
  if (meta.status !== 'running') {
    return meta;
  }

  const runStat = await fsp.stat(runFile);
  const ageMs = Date.now() - runStat.mtime.getTime();
  if (meta.pid && isPidAlive(meta.pid)) {
    return meta;
  }

  let nextMeta = null;
  const logFile = runFile.replace(/\.json$/i, '.log');
  const logText = (await exists(logFile)) ? await readLogPreview(logFile) : '';
  if (/exitCode:\s*0\b/.test(logText)) {
    nextMeta = {
      ...meta,
      status: 'success',
      endedAt: meta.endedAt || nowIso(),
      exitCode: meta.exitCode === null || meta.exitCode === undefined ? 0 : meta.exitCode,
      error: meta.error || '',
    };
  } else if (ageMs > 5 * 60 * 1000 || (meta.pid && ageMs > 10 * 1000)) {
    nextMeta = {
      ...meta,
      status: 'failed',
      endedAt: meta.endedAt || nowIso(),
      exitCode: meta.exitCode === null || meta.exitCode === undefined ? -1 : meta.exitCode,
      error: meta.error || '运行记录未正常结束，可能是服务重启或 CLI 进程已退出。',
    };
  }

  if (nextMeta) {
    await writeRunMeta(runFile, nextMeta);
    return nextMeta;
  }
  return meta;
}

async function readLogPreview(logFile) {
  if (!(await exists(logFile))) {
    return '';
  }
  const stat = await fsp.stat(logFile);
  const start = Math.max(0, stat.size - RUN_LOG_PREVIEW_BYTES);
  const handle = await fsp.open(logFile, 'r');
  try {
    const buffer = Buffer.alloc(stat.size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
}

async function listRuns(workspacePathValue) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  const runsDir = path.join(workspacePath, '.workflow', RUNS_DIR_NAME);
  assertWithin(workspacePath, runsDir);
  if (!(await exists(runsDir))) {
    return [];
  }

  const entries = await fsp.readdir(runsDir, { withFileTypes: true });
  const runs = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }
    const runFile = path.join(runsDir, entry.name);
    try {
      const meta = await reconcileRunMeta(workspacePath, runFile);
      const stat = await fsp.stat(runFile);
      runs.push({
        ...meta,
        updatedAt: stat.mtime.toISOString(),
      });
    } catch {
      // Ignore damaged run metadata; the log can still be opened from disk if needed.
    }
  }

  return runs.sort((a, b) => {
    const aTime = Date.parse(a.startedAt || a.updatedAt || 0);
    const bTime = Date.parse(b.startedAt || b.updatedAt || 0);
    return bTime - aTime;
  });
}

  return {
    createRunId,
    getRunsDir,
    writeRunMeta,
    appendRunLog,
    readRun,
    readLogPreview,
    listRuns,
  };
}

module.exports = {
  writeJsonAtomically,
  readJsonWithRetry,
  createRunStoreRuntime,
};
