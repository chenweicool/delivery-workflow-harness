const {
  readJsonFileIfExists,
  writeWorkspaceJsonFile,
} = require('./workspace-files');

const AGENT_SESSIONS_FILE = '.workflow/agent-sessions.json';

function nowIso() {
  return new Date().toISOString();
}

async function readAgentSessionIndex(workspacePath) {
  const data = await readJsonFileIfExists(workspacePath, AGENT_SESSIONS_FILE);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { version: 1, current: {}, recent: [] };
  }
  return {
    version: 1,
    current: data.current && typeof data.current === 'object' && !Array.isArray(data.current) ? data.current : {},
    recent: Array.isArray(data.recent) ? data.recent.slice(0, 20) : [],
  };
}

async function writeAgentSessionIndex(workspacePath, index) {
  await writeWorkspaceJsonFile(workspacePath, AGENT_SESSIONS_FILE, {
    version: 1,
    current: index.current || {},
    recent: Array.isArray(index.recent) ? index.recent.slice(0, 20) : [],
  });
}

async function upsertAgentSession(workspacePath, session) {
  const index = await readAgentSessionIndex(workspacePath);
  const previous = index.current[session.key] || {};
  const next = {
    ...previous,
    ...session,
    launchCount: Number(previous.launchCount || 0) + 1,
    lastUsedAt: nowIso(),
  };
  index.current[session.key] = next;
  index.recent = [
    next,
    ...(index.recent || []).filter((item) => item && item.key !== session.key),
  ].slice(0, 20);
  await writeAgentSessionIndex(workspacePath, index);
  return next;
}

async function closeMatchingAgentSession(workspacePath, stepId, taskId, status = 'ready-for-review') {
  const index = await readAgentSessionIndex(workspacePath);
  let changed = false;
  for (const [key, session] of Object.entries(index.current || {})) {
    if (!session || session.stepId !== stepId || String(session.taskId || '') !== String(taskId || '')) {
      continue;
    }
    index.current[key] = {
      ...session,
      status,
      closedAt: nowIso(),
      lastUsedAt: nowIso(),
    };
    changed = true;
  }
  if (changed) {
    index.recent = Object.values(index.current || {})
      .sort((a, b) => String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')))
      .slice(0, 20);
    await writeAgentSessionIndex(workspacePath, index);
  }
}

module.exports = {
  AGENT_SESSIONS_FILE,
  readAgentSessionIndex,
  writeAgentSessionIndex,
  upsertAgentSession,
  closeMatchingAgentSession,
};
