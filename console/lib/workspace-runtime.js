const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { defaultWorkflowDefinition } = require('./workflow');

const execFileAsync = promisify(execFile);

function createWorkspaceRuntime(deps) {
  const {
    ROOT_DIR,
    WORKFLOW_DIR,
    TEMPLATE_DIR,
    DEFAULT_OUTPUT_ROOT,
    exists,
    ensureDir,
    normalizeUserPath,
    assertWithin,
    sanitizeName,
    isDirectoryEmpty,
    copyRecursive,
    gitHead,
    gitOutput,
    readToolsConfig,
    resolveTeamDefaultsForWorkspace,
    ensureWorkflowProgressFiles,
    writeState,
    normalizeAppPaths,
    normalizeApps,
    normalizeTextList,
    normalizeNamedPaths,
    normalizeCapabilityList,
  } = deps;

async function initWorkspace(demandName, outputRoot, workspacePathValue) {
  if (!(await exists(TEMPLATE_DIR))) {
    throw new Error(`模板目录不存在：${TEMPLATE_DIR}`);
  }
  const directWorkspacePath = normalizeUserPath(workspacePathValue || '');
  const safeDemandName = directWorkspacePath ? sanitizeName(path.basename(directWorkspacePath)) : sanitizeName(demandName);
  const targetRoot = directWorkspacePath ? path.dirname(directWorkspacePath) : normalizeUserPath(outputRoot || DEFAULT_OUTPUT_ROOT);
  const targetDir = directWorkspacePath || path.join(targetRoot, safeDemandName);

  await ensureDir(targetRoot);
  if ((await exists(targetDir)) && !(await isDirectoryEmpty(targetDir))) {
    throw new Error(`目标 workspace 已存在且非空：${targetDir}`);
  }

  await copyRecursive(TEMPLATE_DIR, targetDir);
  await fsp.writeFile(
    path.join(targetDir, '.workflow', 'workflow.json'),
    JSON.stringify({ ...defaultWorkflowDefinition(), version: 2, description: 'Domain Workspace v2：需求、方案、测试基线与交付反验闭环。' }, null, 2),
    'utf8',
  );

  const dirs = [
    'context/rules',
    'context/skills',
    'context/rules/linked',
    'context/skills/linked',
    'prd/assets',
    'prd/templates',
    'prd/examples',
    'prd/references',
  ];
  for (const dir of dirs) {
    await ensureDir(path.join(targetDir, dir));
  }

  const sourceCommit = await gitHead(ROOT_DIR);
  const knowledgeVersion = [
    '# Knowledge Snapshot Version',
    '',
    `workspace: ${safeDemandName}`,
    `init_time: ${new Date().toISOString()}`,
    `source_repo: ${path.basename(ROOT_DIR)}`,
    `source_commit: ${sourceCommit}`,
    `delivery_workflow_path: ${WORKFLOW_DIR}`,
    '',
  ].join('\n');
  await fsp.writeFile(path.join(targetDir, 'context', 'knowledge-version.md'), knowledgeVersion, 'utf8');

  const tools = await readToolsConfig();
  const inheritedConfig = await resolveTeamDefaultsForWorkspace(tools, safeDemandName);
  await writeWorkspaceConfig(targetDir, {
    demandName: safeDemandName,
    ...inheritedConfig,
    feishuDocs: [],
    notes: inheritedConfig.notes || '',
  });
  await ensureWorkflowProgressFiles(targetDir);

  await writeState({ outputRoot: targetRoot, workspacePath: targetDir });
  return targetDir;
}

function normalizeWorkspaceConfig(config, workspacePath) {
  const appPaths = normalizeAppPaths(config.appPaths || []);
  const apps = normalizeApps(config.apps, appPaths);
  return {
    demandName: config.demandName || path.basename(workspacePath),
    feishuDocs: Array.isArray(config.feishuDocs) ? config.feishuDocs : [],
    appPaths: apps.map((app) => ({ name: app.name, path: app.sourcePath })),
    apps,
    knowledge: normalizeNamedPaths(config.knowledge),
    skills: normalizeTextList(config.skills),
    rules: normalizeTextList(config.rules),
    capabilities: normalizeCapabilityList(config.capabilities),
    domain: config.domain && typeof config.domain === 'object' ? config.domain : {},
    domainContext: config.domainContext && typeof config.domainContext === 'object' ? config.domainContext : {},
    perspective: ['backend', 'frontend', 'qa', 'ops'].includes(String(config.perspective || '').trim())
      ? String(config.perspective).trim()
      : 'backend',
    branchPattern: String(config.branchPattern || '').trim(),
    loadAppContextForClarification: Boolean(config.loadAppContextForClarification),
    notes: config.notes || '',
    profile: config.profile && typeof config.profile === 'object' ? config.profile : {},
    updatedAt: config.updatedAt || '',
  };
}

async function readWorkspaceConfig(workspacePath) {
  const filePath = path.join(workspacePath, '.workflow', 'workspace.json');
  if (!(await exists(filePath))) {
    return normalizeWorkspaceConfig({}, workspacePath);
  }
  try {
    return normalizeWorkspaceConfig(JSON.parse(await fsp.readFile(filePath, 'utf8')), workspacePath);
  } catch {
    return normalizeWorkspaceConfig({}, workspacePath);
  }
}

async function ensureImplementationWorktrees(workspacePath, config) {
  const appPaths = normalizeApps(config.apps, config.appPaths);
  const prepared = [];
  for (const app of appPaths) {
    const sourcePath = app.sourcePath;
    if (!(await exists(path.join(sourcePath, '.git')))) {
      throw new Error(`应用源目录不是 git 仓库：${sourcePath}`);
    }
    const appName = app.name || path.basename(sourcePath);
    const targetPath = path.join(workspacePath, app.worktreePath || path.join('apps', appName));
    assertWithin(workspacePath, targetPath);
    const branchName = String(app.featureBranch || '').trim();
    if (!branchName) {
      throw new Error(`应用 ${appName} 未填写经研发确认的开发分支，不能创建 worktree`);
    }
    const targetGitPath = path.join(targetPath, '.git');
    if (await exists(targetGitPath)) {
      prepared.push({ ...app, sourcePath, worktreePath: targetPath, branchName, created: false });
      continue;
    }
    if (await exists(targetPath)) {
      const entries = await fsp.readdir(targetPath);
      if (entries.length > 0) {
        throw new Error(`worktree 目标目录已存在且不为空：${targetPath}`);
      }
    } else {
      await ensureDir(path.dirname(targetPath));
    }
    const worktreeList = await gitOutput(['worktree', 'list', '--porcelain'], sourcePath);
    const branchRef = `branch refs/heads/${branchName}`;
    if (worktreeList.includes(branchRef)) {
      const lines = worktreeList.split(/\r?\n/);
      let currentWorktree = '';
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          currentWorktree = line.slice('worktree '.length);
        }
        if (line === branchRef) {
          throw new Error(`分支 ${branchName} 已被其他 worktree 使用：${currentWorktree}`);
        }
      }
    }
    const existingBranch = await gitOutput(['branch', '--list', branchName], sourcePath);
    const baseBranch = String(app.baseBranch || '').trim();
    if (!baseBranch) {
      throw new Error(`应用 ${appName} 未填写经研发确认的基准分支，不能创建 worktree`);
    }
    const args = existingBranch
      ? ['worktree', 'add', targetPath, branchName]
      : ['worktree', 'add', '-b', branchName, targetPath, baseBranch];
    await execFileAsync('git', args, {
      cwd: sourcePath,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    prepared.push({ ...app, sourcePath, worktreePath: targetPath, branchName, created: true });
  }
  return prepared;
}

async function getAppAccessStates(workspacePath, config) {
  const apps = normalizeApps(config.apps, config.appPaths);
  const states = [];
  for (const app of apps) {
    const sourcePath = app.sourcePath;
    const worktreeRelativePath = app.worktreePath || path.join('apps', app.name || path.basename(sourcePath));
    const worktreePath = path.join(workspacePath, worktreeRelativePath);
    assertWithin(workspacePath, worktreePath);
    states.push({
      name: app.name,
      sourcePath,
      sourceExists: Boolean(sourcePath && await exists(sourcePath)),
      sourceIsGit: Boolean(sourcePath && await exists(path.join(sourcePath, '.git'))),
      worktreePath,
      worktreeRelativePath: path.relative(workspacePath, worktreePath).replace(/\\/g, '/'),
      worktreeExists: await exists(worktreePath),
      baseBranch: app.baseBranch || '',
      featureBranch: app.featureBranch || '',
      suggestedFeatureBranch: app.suggestedFeatureBranch || '',
      branchConfirmedBy: app.branchConfirmedBy || '',
      branchConfirmedAt: app.branchConfirmedAt || '',
      type: app.type || '',
    });
  }
  return states;
}

async function writeWorkspaceConfig(workspacePath, nextConfig) {
  const workflowDir = path.join(workspacePath, '.workflow');
  await ensureDir(workflowDir);
  const current = await readWorkspaceConfig(workspacePath);
  const nextAppPaths = Object.prototype.hasOwnProperty.call(nextConfig, 'appPaths')
    ? normalizeAppPaths(nextConfig.appPaths)
    : normalizeAppPaths(current.appPaths);
  const appPathsWereProvided = Object.prototype.hasOwnProperty.call(nextConfig, 'appPaths');
  const apps = Object.prototype.hasOwnProperty.call(nextConfig, 'apps')
    ? normalizeApps(nextConfig.apps, nextAppPaths)
    : appPathsWereProvided
      ? normalizeApps([], nextAppPaths)
      : normalizeApps(current.apps, nextAppPaths);
  const config = {
    ...current,
    ...nextConfig,
    apps,
    appPaths: apps.map((app) => ({ name: app.name, path: app.sourcePath })),
    updatedAt: new Date().toISOString(),
  };
  await fsp.writeFile(path.join(workflowDir, 'workspace.json'), JSON.stringify(config, null, 2), 'utf8');
  return config;
}

  return {
    initWorkspace,
    normalizeWorkspaceConfig,
    readWorkspaceConfig,
    ensureImplementationWorktrees,
    getAppAccessStates,
    writeWorkspaceConfig,
  };
}

module.exports = {
  createWorkspaceRuntime,
};
