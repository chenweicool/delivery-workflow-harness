const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { exists, ensureDir } = require('./fs-utils');

const execFileAsync = promisify(execFile);

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const CONSOLE_DIR = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DELIVERY_WORKFLOW_DATA_DIR || path.join(CONSOLE_DIR, '.data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const DEFAULT_OUTPUT_ROOT = path.resolve(ROOT_DIR, '..', 'ai-workspaces');

function normalizeTextList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readState() {
  const defaults = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    workspacePath: '',
    selectedUnitId: 'workspace',
    tools: {
      codexPath: '',
      codexDesktopPath: '',
      claudePath: '',
      ideaPath: '',
      workspaceRoot: DEFAULT_OUTPUT_ROOT,
      teamConfigRoot: '',
      whitepaperRoot: '',
      appIndexPath: '',
      repoRoot: '',
      codeCacheRoot: '',
      teamProfile: 'default',
      defaultSkillsRoot: 'C:\\code\\team-ai-config\\skills\\common',
      globalSkills: [],
      globalRules: [],
      globalNotes: '',
      teamName: '',
      templates: [],
      integrations: {},
    },
  };
  if (!(await exists(STATE_FILE))) {
    return defaults;
  }
  try {
    const data = JSON.parse(await fsp.readFile(STATE_FILE, 'utf8'));
    const tools = {
      ...defaults.tools,
      ...(data.tools || {}),
    };
    if (!data.tools || !data.tools.workspaceRoot) {
      tools.workspaceRoot = data.outputRoot || DEFAULT_OUTPUT_ROOT;
    }
    const savedOutputRoot = data.outputRoot || tools.workspaceRoot || DEFAULT_OUTPUT_ROOT;
    const outputRoot = await exists(savedOutputRoot) ? savedOutputRoot : (tools.workspaceRoot || DEFAULT_OUTPUT_ROOT);
    const savedWorkspacePath = data.workspacePath || '';
    const workspacePath = savedWorkspacePath && await exists(path.join(savedWorkspacePath, 'AGENTS.md'))
      ? savedWorkspacePath
      : '';
    return {
      outputRoot,
      workspacePath,
      selectedUnitId: data.selectedUnitId || 'workspace',
      tools,
    };
  } catch {
    return defaults;
  }
}

async function writeState(nextState) {
  await ensureDir(DATA_DIR);
  const current = await readState();
  const merged = { ...current, ...nextState };
  await fsp.writeFile(STATE_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function normalizeToolsConfig(tools = {}) {
  return {
    codexPath: String(tools.codexPath || '').trim(),
    codexDesktopPath: String(tools.codexDesktopPath || '').trim(),
    claudePath: String(tools.claudePath || '').trim(),
    ideaPath: String(tools.ideaPath || '').trim(),
    workspaceRoot: String(tools.workspaceRoot || DEFAULT_OUTPUT_ROOT).trim(),
    teamConfigRoot: String(tools.teamConfigRoot || '').trim(),
    whitepaperRoot: String(tools.whitepaperRoot || '').trim(),
    appIndexPath: String(tools.appIndexPath || '').trim(),
    repoRoot: String(tools.repoRoot || '').trim(),
    codeCacheRoot: String(tools.codeCacheRoot || '').trim(),
    teamProfile: String(tools.teamProfile || 'default').trim() || 'default',
    defaultSkillsRoot: String(tools.defaultSkillsRoot || 'C:\\code\\team-ai-config\\skills\\common').trim(),
    globalSkills: normalizeTextList(tools.globalSkills),
    globalRules: normalizeTextList(tools.globalRules),
    globalNotes: String(tools.globalNotes || '').trim(),
    teamName: String(tools.teamName || '').trim(),
    templates: normalizeTextList(tools.templates),
    integrations: normalizeIntegrationsConfig(tools.integrations),
  };
}

function normalizeIntegrationsConfig(integrations = {}) {
  if (!integrations || Array.isArray(integrations) || typeof integrations !== 'object') {
    return {};
  }
  return Object.fromEntries(Object.entries(integrations).map(([key, value]) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      return null;
    }
    const normalizedValue = value && typeof value === 'object' && !Array.isArray(value)
      ? { ...value }
      : { value };
    return [normalizedKey, normalizedValue];
  }).filter(Boolean));
}

async function findExecutable(names) {
  const list = Array.isArray(names) ? names : [names];
  const command = process.platform === 'win32' ? 'where' : 'which';
  for (const name of list) {
    try {
      const { stdout } = await execFileAsync(command, [name], {
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      const found = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      if (found) {
        return found;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return '';
}

async function findCodexDesktopExecutable(configuredPath = '') {
  if (configuredPath && await exists(configuredPath)) {
    return configuredPath;
  }
  const candidates = [];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    if (localAppData) {
      candidates.push(path.join(localAppData, 'OpenAI', 'Codex', 'bin', 'codex.exe'));
      candidates.push(path.join(localAppData, 'OpenAI', 'Codex', 'codex.exe'));
    }
    candidates.push('codex.exe');
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Codex.app');
  }

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (await exists(candidate)) {
        return candidate;
      }
      continue;
    }
    const found = await findExecutable(candidate);
    if (found) {
      return found;
    }
  }
  return '';
}

async function findIdeaExecutable(configuredPath = '') {
  if (configuredPath && await exists(configuredPath)) {
    return configuredPath;
  }
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push('idea64.exe', 'idea.exe', 'idea.cmd', 'idea.bat');
    const programFiles = [
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'JetBrains', 'Toolbox', 'scripts'),
    ].filter(Boolean);
    for (const root of programFiles) {
      if (root.endsWith(path.join('JetBrains', 'Toolbox', 'scripts'))) {
        candidates.push(path.join(root, 'idea.cmd'), path.join(root, 'idea64.cmd'));
        continue;
      }
      const jetbrainsRoot = path.join(root, 'JetBrains');
      if (!(await exists(jetbrainsRoot))) {
        continue;
      }
      const entries = await fsp.readdir(jetbrainsRoot, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.isDirectory() && /IntelliJ IDEA/i.test(entry.name)) {
          candidates.push(path.join(jetbrainsRoot, entry.name, 'bin', 'idea64.exe'));
          candidates.push(path.join(jetbrainsRoot, entry.name, 'bin', 'idea.exe'));
          candidates.push(path.join(jetbrainsRoot, entry.name, 'bin', 'idea.bat'));
        }
      }
    }
  } else {
    candidates.push('idea');
  }

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (await exists(candidate)) {
        return candidate;
      }
      continue;
    }
    const found = await findExecutable(candidate);
    if (found) {
      return found;
    }
  }
  return '';
}

async function detectToolsConfig() {
  return normalizeToolsConfig({
    codexPath: await findExecutable(process.platform === 'win32' ? ['codex.cmd', 'codex.exe', 'codex'] : ['codex']),
    codexDesktopPath: await findCodexDesktopExecutable(''),
    claudePath: await findExecutable(process.platform === 'win32' ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude']),
    ideaPath: await findIdeaExecutable(''),
    workspaceRoot: DEFAULT_OUTPUT_ROOT,
    teamConfigRoot: '',
    whitepaperRoot: '',
    appIndexPath: '',
    repoRoot: '',
    codeCacheRoot: '',
    teamProfile: 'default',
    defaultSkillsRoot: 'C:\\code\\team-ai-config\\skills\\common',
    globalSkills: [],
    globalRules: [],
    globalNotes: '',
    teamName: '',
    templates: [],
    integrations: {},
  });
}

async function readToolsConfig() {
  const state = await readState();
  const saved = normalizeToolsConfig(state.tools || {});
  const detected = await detectToolsConfig();
  return {
    codexPath: saved.codexPath || detected.codexPath,
    codexDesktopPath: saved.codexDesktopPath || detected.codexDesktopPath,
    claudePath: saved.claudePath || detected.claudePath,
    ideaPath: saved.ideaPath || detected.ideaPath,
    workspaceRoot: saved.workspaceRoot || detected.workspaceRoot,
    teamConfigRoot: saved.teamConfigRoot || detected.teamConfigRoot,
    whitepaperRoot: saved.whitepaperRoot || detected.whitepaperRoot,
    appIndexPath: saved.appIndexPath || detected.appIndexPath,
    repoRoot: saved.repoRoot || detected.repoRoot,
    codeCacheRoot: saved.codeCacheRoot || detected.codeCacheRoot,
    teamProfile: saved.teamProfile || detected.teamProfile,
    defaultSkillsRoot: saved.defaultSkillsRoot || detected.defaultSkillsRoot,
    globalSkills: saved.globalSkills,
    globalRules: saved.globalRules,
    globalNotes: saved.globalNotes,
    teamName: saved.teamName,
    templates: saved.templates,
    integrations: saved.integrations,
  };
}

async function saveToolsConfig(body) {
  const detected = await detectToolsConfig();
  const raw = body.tools || body || {};
  const tools = normalizeToolsConfig({
    codexPath: raw.codexPath || detected.codexPath,
    codexDesktopPath: raw.codexDesktopPath || detected.codexDesktopPath,
    claudePath: raw.claudePath || detected.claudePath,
    ideaPath: raw.ideaPath || detected.ideaPath,
    workspaceRoot: raw.workspaceRoot || detected.workspaceRoot,
    teamConfigRoot: raw.teamConfigRoot || detected.teamConfigRoot,
    whitepaperRoot: raw.whitepaperRoot || detected.whitepaperRoot,
    appIndexPath: raw.appIndexPath || detected.appIndexPath,
    repoRoot: raw.repoRoot || detected.repoRoot,
    codeCacheRoot: raw.codeCacheRoot || detected.codeCacheRoot,
    teamProfile: raw.teamProfile || detected.teamProfile,
    defaultSkillsRoot: raw.defaultSkillsRoot || detected.defaultSkillsRoot,
    globalSkills: raw.globalSkills,
    globalRules: raw.globalRules,
    globalNotes: raw.globalNotes,
    teamName: raw.teamName,
    templates: raw.templates,
    integrations: raw.integrations,
  });
  const state = await writeState({ tools });
  return normalizeToolsConfig(state.tools || {});
}

module.exports = {
  DEFAULT_OUTPUT_ROOT,
  readState,
  writeState,
  normalizeToolsConfig,
  readToolsConfig,
  saveToolsConfig,
  findExecutable,
  findIdeaExecutable,
};
