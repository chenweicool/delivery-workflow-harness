const fsp = require('fs/promises');
const path = require('path');

function createAgentExecutionRuntime(deps) {
  const {
    normalizeAppPaths,
    normalizeUserPath,
    exists,
    capabilityPathValue,
    configuredCommand,
  } = deps;

  function normalizeAccessDirs(appPaths = [], accessDirs = []) {
    const dirs = [];
    for (const item of normalizeAppPaths(appPaths)) {
      dirs.push(item.path);
    }
    for (const item of accessDirs || []) {
      const value = String(item || '').trim();
      if (value) {
        dirs.push(path.resolve(value));
      }
    }
    const seen = new Set();
    return dirs.filter((dir) => {
      const key = dir.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function knowledgeAccessDirs(config = {}) {
    const knowledgeDirs = (config.knowledge || [])
      .map((item) => item && item.path ? normalizeUserPath(item.path) : '')
      .filter(Boolean);
    const whitepaperRoot = config.whitepaperContext && config.whitepaperContext.root
      ? normalizeUserPath(config.whitepaperContext.root)
      : '';
    const domainRoot = config.domainContext && config.domainContext.root
      ? normalizeUserPath(config.domainContext.root)
      : (config.domain && config.domain.root ? normalizeUserPath(config.domain.root) : '');
    return Array.from(new Set([...knowledgeDirs, whitepaperRoot, domainRoot].filter(Boolean)));
  }

  async function collectCapabilityAccessDirs(workspacePath, capabilities) {
    const entries = [...(capabilities.skills || []), ...(capabilities.rules || [])];
    const dirs = [];
    for (const entry of entries) {
      const value = String(capabilityPathValue(entry) || '').trim();
      if (!value) {
        continue;
      }
      const candidate = path.isAbsolute(value) ? value : path.resolve(workspacePath, value);
      if (!(await exists(candidate))) {
        continue;
      }
      const stat = await fsp.stat(candidate);
      dirs.push(stat.isDirectory() ? candidate : path.dirname(candidate));
    }
    return normalizeAccessDirs([], dirs);
  }

  function buildExecutorCommand(executor, workspacePath, appPaths = [], accessDirs = [], tools = {}) {
    const isWindows = process.platform === 'win32';
    const extraDirs = normalizeAccessDirs(appPaths, accessDirs);
    const addDirArgs = [workspacePath, ...extraDirs].flatMap((dir) => ['--add-dir', dir]);
    if (executor === 'claude') {
      return {
        command: configuredCommand(tools.claudePath, isWindows ? 'claude.cmd' : 'claude'),
        args: [
          '-p',
          '--permission-mode',
          'acceptEdits',
          ...addDirArgs,
          '-',
        ],
      };
    }
    return {
      command: configuredCommand(tools.codexPath, isWindows ? 'codex.cmd' : 'codex'),
      args: [
        'exec',
        '--cd',
        workspacePath,
        '--skip-git-repo-check',
        '--sandbox',
        'workspace-write',
        ...extraDirs.flatMap((dir) => ['--add-dir', dir]),
        '-',
      ],
    };
  }

  function shouldExposeAppContextForStep(stepId, config = {}) {
    if (stepId === '01-clarify-requirement') {
      return Boolean(config.loadAppContextForClarification);
    }
    if (stepId === 'import-prd') {
      return false;
    }
    return true;
  }

  return {
    normalizeAccessDirs,
    knowledgeAccessDirs,
    collectCapabilityAccessDirs,
    buildExecutorCommand,
    shouldExposeAppContextForStep,
  };
}

module.exports = {
  createAgentExecutionRuntime,
};
