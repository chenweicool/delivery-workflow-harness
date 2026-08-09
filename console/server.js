const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const {
  sendJson,
  sendError,
  readBuffer,
  readJson: readJsonBody,
} = require('./lib/http');
const {
  gitHead,
  gitOutput,
  gitOutputSafe,
} = require('./lib/git');
const {
  exists,
  ensureDir,
  normalizeUserPath,
  resolveOptionalRootPath,
  assertWithin,
} = require('./lib/fs-utils');
const {
  agentContractForStep,
  findReturnStepId,
  agentSessionKey,
  buildAgentSessionName,
  findAgentSession,
} = require('./lib/agents');
const {
  AGENT_SESSIONS_FILE,
  readAgentSessionIndex,
  upsertAgentSession,
  closeMatchingAgentSession,
} = require('./lib/agent-sessions');
const {
  createAgentPromptRuntime,
} = require('./lib/agent-prompt');
const {
  HANDOFF_FILE,
  HANDOFF_DONE_FILE,
  createAgentHandoffRuntime,
} = require('./lib/agent-handoff');
const {
  createAgentLauncherRuntime,
  openTerminalCommand,
  quoteShellArg,
  quotePowerShellArg,
} = require('./lib/agent-launcher');
const {
  createWorkspaceStatusRuntime,
} = require('./lib/workspace-status');
const {
  createWorkspaceRuntime,
} = require('./lib/workspace-runtime');
const {
  createWhitepaperRuntime,
} = require('./lib/whitepaper');
const {
  createDomainHarnessRuntime,
} = require('./lib/domain-harness');
const {
  createQualityEvidenceRuntime,
} = require('./lib/quality-evidence');
const {
  createQualityGateRuntime,
} = require('./lib/quality-gate');
const {
  createKnowledgeArchiveRuntime,
} = require('./lib/knowledge-archive');
const {
  validateDemand,
  createDeliveryReportRuntime,
} = require('./lib/delivery-report');
const {
  createHarnessClientRuntime,
} = require('./lib/harness-client');
const {
  createRunStoreRuntime,
} = require('./lib/run-store');
const {
  createAgentExecutionRuntime,
} = require('./lib/agent-execution');
const {
  createAgentRunnerRuntime,
} = require('./lib/agent-runner');
const {
  createAgentAdjustmentRuntime,
} = require('./lib/agent-adjustment');
const {
  getPackageUpdateStatus,
  installPackageUpdate,
} = require('./lib/package-update');
const {
  WORKFLOW_PROGRESS_FILE,
  createWorkflowProgressRuntime,
} = require('./lib/workflow-progress');
const {
  createCheckpointRuntime,
} = require('./lib/checkpoint');
const {
  createDesignBaselineRuntime,
} = require('./lib/design-baseline');
const workflowRuntime = require('./lib/workflow');
const {
  workflowStepSequence,
  workflowUnitForStep,
  workflowStepPosition,
  progressMarkdown,
} = workflowRuntime;
const {
  normalizeCapabilityList,
  capabilityPathValue,
  capabilityDisplayName,
  classifyCapability,
  stepAllowedCapabilityTypes,
} = require('./lib/capabilities');
const {
  normalizeAppPaths,
  normalizeApps,
} = require('./lib/workspace');
const {
  normalizeTextList,
  normalizeNamedPaths,
  createCapabilityRoutingRuntime,
} = require('./lib/capability-routing');
const {
  listFiles,
  pathExistsInWorkspace,
  readJsonFileIfExists,
  unlinkWorkspaceFileIfExists,
  writeWorkspaceJsonFile,
  readWorkspaceTextFileIfExists,
  writeWorkspaceTextFile,
  appendWorkspaceTextFile,
} = require('./lib/workspace-files');
const {
  importFeishuDocument,
} = require('./lib/feishu');
const {
  ingestPrdSources,
} = require('./lib/prd-ingestion');
const {
  DEFAULT_OUTPUT_ROOT,
  readState,
  writeState,
  readToolsConfig,
  saveToolsConfig,
  findExecutable,
  findIdeaExecutable,
} = require('./lib/state');

const ROOT_DIR = path.resolve(__dirname, '..');
const WORKFLOW_DIR = ROOT_DIR;
const TEMPLATE_DIR = path.join(WORKFLOW_DIR, 'templates', 'workspace');
const COMMANDS_DIR = path.join(TEMPLATE_DIR, '.workflow', 'commands');
const PUBLIC_DIR = path.join(__dirname, 'public');
const WORKFLOW_DEFINITION_FILE = '.workflow/workflow.json';
const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 3040);
let activePort = PORT;
const MAX_JSON_BODY = 5 * 1024 * 1024;
const MAX_UPLOAD_BODY = 100 * 1024 * 1024;
const RUNS_DIR_NAME = 'runs';
const RUN_LOG_PREVIEW_BYTES = 512 * 1024;
const AI_ADJUSTMENTS_FILE = 'tasks/process/ai-adjustments.md';
const KNOWN_FACTS_FILE = 'design/known-facts.md';
const TECHNICAL_REVIEW_FILE = 'design/process/technical-review.md';
const TASK_CONFIRMATION_FILE = 'tasks/process/task-confirmation.md';
const CAPABILITY_LOCK_FILE = '.workflow/capabilities.lock.json';
const CAPABILITY_SUMMARY_FILE = 'context/capabilities.md';
const {
  freezeDesignBaselines,
  verifyDesignBaselines,
} = createDesignBaselineRuntime({
  readWorkspaceTextFileIfExists,
  readJsonFileIfExists,
  writeWorkspaceJsonFile,
});
const progressApi = {};
const {
  getCheckpointState,
  submitCheckpoint,
} = createCheckpointRuntime({
  normalizeUserPath,
  readWorkspaceTextFileIfExists,
  pathExistsInWorkspace,
  writeWorkspaceTextFile,
  appendWorkspaceTextFile,
  readJsonFileIfExists,
  readWorkflowDefinition,
  exists,
  writeWorkspaceJsonFile,
  unlinkWorkspaceFileIfExists,
  readWorkflowProgress: (...args) => progressApi.readWorkflowProgress(...args),
  writeWorkflowProgress: (...args) => progressApi.writeWorkflowProgress(...args),
  nowIso,
  TECHNICAL_REVIEW_FILE,
  TECHNICAL_REVIEW_TEMPLATE: () => TECHNICAL_REVIEW_TEMPLATE,
  freezeDesignBaselines,
});
const {
  readWorkflowProgress,
  writeWorkflowProgress,
  ensureWorkflowProgressFiles,
} = createWorkflowProgressRuntime({
  assertWithin,
  ensureDir,
  exists,
  pathExistsInWorkspace,
  getCheckpointState,
  readWorkflowDefinition,
  workflowStepSequence,
  progressMarkdown,
  nowIso,
});
Object.assign(progressApi, {
  readWorkflowProgress,
  writeWorkflowProgress,
});
const {
  linkConfiguredCapabilities,
  routeCapabilitiesForStep,
} = createCapabilityRoutingRuntime({
  exists,
  ensureDir,
  assertWithin,
  sanitizeName,
  copyRecursive,
  capabilityPathValue,
  capabilityDisplayName,
  classifyCapability,
  stepAllowedCapabilityTypes,
});
const {
  initWorkspace,
  readWorkspaceConfig,
  ensureImplementationWorktrees,
  getAppAccessStates,
  writeWorkspaceConfig,
} = createWorkspaceRuntime({
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
});
const {
  readWhitepaperCatalog,
  matchFunctions,
  resolveWhitepaperContext,
  whitepaperContextMarkdown,
} = createWhitepaperRuntime({
  exists,
  normalizeUserPath,
  gitHead,
});
const {
  inspectDomainHarness,
  attachDomainHarness,
} = createDomainHarnessRuntime({
  exists,
  normalizeUserPath,
  gitHead,
  readWorkspaceConfig,
  writeWorkspaceConfig,
  writeWorkspaceJsonFile,
  writeWorkspaceTextFile,
});
const {
  refreshQualitySummary,
} = createQualityEvidenceRuntime({
  normalizeUserPath,
  exists,
  readWorkspaceConfig,
  readWorkspaceTextFileIfExists,
  writeWorkspaceJsonFile,
});
const {
  evaluateQualityGates,
  submitQualityGate,
} = createQualityGateRuntime({
  normalizeUserPath,
  exists,
  readJsonFileIfExists,
  writeWorkspaceJsonFile,
  readWorkspaceTextFileIfExists,
});
const {
  createKnowledgeUpdateProposal,
} = createKnowledgeArchiveRuntime({
  normalizeUserPath,
  exists,
  readWorkspaceConfig,
  readWorkspaceTextFileIfExists,
  readJsonFileIfExists,
  writeWorkspaceJsonFile,
  writeWorkspaceTextFile,
});
const {
  completeDeliveryReport,
} = createDeliveryReportRuntime({
  normalizeUserPath,
  exists,
  readWorkspaceConfig,
  readJsonFileIfExists,
  writeWorkspaceJsonFile,
  nowIso,
});
const {
  submitDeliveryReport,
  startHarnessAuthorization,
  authorizeHarnessClient,
  getHarnessClientStatus,
  logoutHarnessClient,
} = createHarnessClientRuntime({
  normalizeUserPath,
  exists,
  readJsonFileIfExists,
  writeWorkspaceJsonFile,
  readToolsConfig,
  saveToolsConfig,
  nowIso,
});

function redactToolsConfigForApi(tools = {}) {
  const integrations = { ...(tools.integrations || {}) };
  if (integrations.harnessClient) {
    const { accessToken, ...safeHarnessClient } = integrations.harnessClient;
    integrations.harnessClient = {
      ...safeHarnessClient,
      authorized: Boolean(accessToken),
    };
  }
  return { ...tools, integrations };
}
const {
  createRunId,
  getRunsDir,
  writeRunMeta,
  appendRunLog,
  readRun,
  readLogPreview,
  listRuns,
} = createRunStoreRuntime({
  normalizeUserPath,
  assertWithin,
  ensureDir,
  exists,
  nowIso,
  RUNS_DIR_NAME,
  RUN_LOG_PREVIEW_BYTES,
});
const {
  knowledgeAccessDirs,
  collectCapabilityAccessDirs,
  buildExecutorCommand,
  shouldExposeAppContextForStep,
} = createAgentExecutionRuntime({
  normalizeAppPaths,
  normalizeUserPath,
  exists,
  capabilityPathValue,
  configuredCommand,
});
const {
  launchAgentProcess,
} = createAgentRunnerRuntime({
  assertWithin,
  writeRunMeta,
  appendRunLog,
  nowIso,
});
const {
  buildAiAdjustmentPrompt,
  appendAiAdjustmentRecord,
} = createAgentAdjustmentRuntime({
  normalizeApps,
  listRuns,
  readWorkspaceTextIfExists,
  truncateText,
  formatCapabilitiesForPrompt,
  assertWithin,
  ensureDir,
  nowIso,
  AI_ADJUSTMENTS_FILE,
});
const {
  buildAgentCollaborationPrompt,
} = createAgentPromptRuntime({
  normalizeUserPath,
  readWorkflowDefinition,
  ensureWorkflowProgressFiles,
  assertTaskAllowedForImplementation,
  workflowStepPosition,
  workflowStepSequence,
  readWorkspaceConfig,
  shouldExposeAppContextForStep,
  readToolsConfig,
  linkConfiguredCapabilities,
  routeCapabilitiesForStep,
  capabilityDisplayName,
  agentContractForStep,
  localConsoleUrl,
  getImplementationTargets,
  collectDiffSummary,
  readWorkspaceTextFileIfExists,
  truncateText,
  WORKFLOW_PROGRESS_FILE,
  HANDOFF_DONE_FILE,
});
const {
  prepareAgentHandoff,
  completeAgentHandoff,
} = createAgentHandoffRuntime({
  normalizeUserPath,
  exists,
  assertWithin,
  ensureDir,
  readWorkflowDefinition,
  findReturnStepId,
  workflowUnitForStep,
  agentContractForStep,
  buildAgentCollaborationPrompt,
  unlinkWorkspaceFileIfExists,
  agentSessionKey,
  buildAgentSessionName,
  localConsoleUrl,
  closeMatchingAgentSession,
  nowIso,
});
const {
  openAgentCli,
} = createAgentLauncherRuntime({
  prepareAgentHandoff,
  readToolsConfig,
  configuredCommand,
  readAgentSessionIndex,
  findAgentSession,
  upsertAgentSession,
});
const {
  getWorkspaceStatus,
} = createWorkspaceStatusRuntime({
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
});
const KNOWN_FACTS_TEMPLATE = [
  '# 技术方案生成输入',
  '',
  '## 1. 建议涉及应用',
  '',
  '- 应用名：',
  '- 是否建议涉及：',
  '- 理由：',
  '- 备注：',
  '',
  '## 2. 建议代码入口',
  '',
  '### 入口 1',
  '',
  '- 应用：',
  '- 文件 / 类 / 方法：',
  '- 入口类型：页面 / Controller / Service / Mapper / Job / 其他',
  '- 建议处理方式：复用 / 扩展 / 新增 / 待确认',
  '- 备注：',
  '',
  '## 3. 建议接口命名与定义',
  '',
  '### 接口 1',
  '',
  '- 接口名称：',
  '- 请求方式：',
  '- 建议路径：',
  '- 新增 / 复用 / 扩展：',
  '- 入参重点：',
  '- 出参重点：',
  '- 备注：',
  '',
  '## 4. 建议数据模型 / 字段 / 表',
  '',
  '### 数据对象 1',
  '',
  '- 对象：',
  '- 字段 / 表名：',
  '- 建议处理方式：新增 / 复用 / 扩展 / 不改 / 待确认',
  '- 理由：',
  '- 备注：',
  '',
  '## 5. 历史数据处理建议',
  '',
  '- ',
  '',
  '## 6. 已确认不做',
  '- ',
  '',
  '## 7. 已知风险 / 历史问题',
  '- ',
  '',
  '## 8. 需要 AI 重点判断的问题',
  '- ',
  '',
  '## 9. 其他补充',
  '- ',
  '',
].join('\n');
const TECHNICAL_REVIEW_TEMPLATE = [
  '# 技术方案评审意见',
  '',
  '## 本轮结论',
  '',
  '- 结论：退回修改',
  '- 评审人：',
  '- 评审时间：',
  '',
  '## 必须修改',
  '',
  '1. ',
  '',
  '## 建议补充',
  '',
  '1. ',
  '',
  '## 接口定义问题',
  '',
  '| 问题 | 期望调整 | 备注 |',
  '| --- | --- | --- |',
  '|  |  |  |',
  '',
  '## 数据库 / 字段问题',
  '',
  '| 问题 | 期望调整 | 备注 |',
  '| --- | --- | --- |',
  '|  |  |  |',
  '',
  '## 风险与回滚问题',
  '',
  '| 问题 | 期望调整 | 备注 |',
  '| --- | --- | --- |',
  '|  |  |  |',
  '',
  '## 研发协作问题',
  '',
  '| 问题 | 期望调整 | 备注 |',
  '| --- | --- | --- |',
  '|  |  |  |',
  '',
  '## 不需要调整',
  '',
  '- ',
  '',
].join('\n');
const TASK_CONFIRMATION_TEMPLATE = [
  '# 任务确认结果',
  '',
  '## 执行口径',
  '',
  '- `tasks/task-list.md` 保存 AI 拆出的任务事实、涉及文件、验收标准和依赖关系。',
  '- `tasks/process/task-confirmation.md` 保存人工确认后的实施准入结论。',
  '- 后续单任务实现必须同时读取两个文件：先按本文件判断任务是否允许实施，再回到任务清单读取完整任务细节。',
  '- 如果两个文件结论冲突、任务编号缺失或允许范围不明确，AI 必须停止实施并等待人工确认。',
  '- 默认不允许全量执行。只有“人工确认结果”为“允许 AI 实施”的任务，才能进入 06 实现阶段。',
  '',
  '## 本轮确认结论',
  '',
  '- 任务清单整体结论：可进入实施 / 退回重拆 / 部分实施',
  '- 本轮允许 AI 实施任务：',
  '- 本轮暂缓任务：',
  '- 确认人：',
  '- 确认时间：',
  '',
  '## 任务确认明细',
  '',
  '| 任务 | 摘要 | AI 判断 | 依赖 | 人工确认结果 | 实施前提 | 备注 |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| T001 |  | 需要确认 / 可实施 | 无 | 待人工确认 |  |  |',
  '',
  '## 暂缓原因',
  '',
  '- ',
  '',
  '## 任务清单调整意见',
  '',
  '- ',
  '',
].join('\n');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function defaultWorkflowDefinition() {
  return workflowRuntime.defaultWorkflowDefinition();
}

function normalizeWorkflowDefinition(raw = {}, source = 'custom') {
  return workflowRuntime.normalizeWorkflowDefinition(raw, source);
}

async function readWorkflowDefinition(workspacePath = '') {
  return workflowRuntime.readWorkflowDefinition(workspacePath, {
    templateDir: TEMPLATE_DIR,
    workflowDefinitionFile: WORKFLOW_DEFINITION_FILE,
  });
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 0;
}

function localConsoleUrl(portValue) {
  return `http://127.0.0.1:${normalizePort(portValue) || activePort || PORT}`;
}

async function readJson(req) {
  return readJsonBody(req, MAX_JSON_BODY);
}

function configuredCommand(configuredPath, fallback) {
  const value = String(configuredPath || '').trim();
  return value || fallback;
}

async function runWindowsPicker(script, pickerName) {
  try {
    return await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {
      windowsHide: true,
      timeout: 120000,
    });
  } catch (error) {
    throw new Error(`${pickerName}打开失败，请手动粘贴路径或检查本机 PowerShell / 桌面权限`);
  }
}

async function selectLocalDirectory(body = {}) {
  const initialPath = body.initialPath ? normalizeUserPath(body.initialPath) : '';
  const title = String(body.title || 'Select directory').replace(/'/g, "''");
  if (process.platform === 'win32') {
    const initialPathExists = initialPath && await exists(initialPath);
    const safeInitialPath = initialPathExists ? initialPath.replace(/'/g, "''") : '';
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      '$owner = New-Object System.Windows.Forms.Form',
      '$owner.TopMost = $true',
      '$owner.ShowInTaskbar = $false',
      '$owner.StartPosition = "CenterScreen"',
      '$owner.Size = New-Object System.Drawing.Size(1, 1)',
      '$owner.Opacity = 0',
      '$owner.Show()',
      '$owner.Activate()',
      '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
      `$dialog.Description = '${title}'`,
      '$dialog.ShowNewFolderButton = $true',
      safeInitialPath ? `$dialog.SelectedPath = '${safeInitialPath}'` : '',
      '$result = $dialog.ShowDialog($owner)',
      '$owner.Close()',
      'if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }',
    ].filter(Boolean).join('; ');
    const { stdout } = await runWindowsPicker(script, '目录选择器');
    return { path: stdout.trim() };
  }
  if (process.platform === 'darwin') {
    const prompt = String(body.title || 'Select directory').replace(/"/g, '\\"');
    const { stdout } = await execFileAsync('osascript', ['-e', `POSIX path of (choose folder with prompt "${prompt}")`]);
    return { path: stdout.trim() };
  }
  throw new Error('当前系统暂不支持目录选择器，请手动粘贴目录路径');
}

async function selectLocalFile(body = {}) {
  const initialPath = body.initialPath ? normalizeUserPath(body.initialPath) : '';
  const title = String(body.title || 'Select file').replace(/'/g, "''");
  if (process.platform === 'win32') {
    const initialDir = initialPath && await exists(initialPath)
      ? (await fsp.stat(initialPath)).isDirectory() ? initialPath : path.dirname(initialPath)
      : '';
    const filter = String(body.filter || 'All files (*.*)|*.*').replace(/'/g, "''");
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      '$owner = New-Object System.Windows.Forms.Form',
      '$owner.TopMost = $true',
      '$owner.ShowInTaskbar = $false',
      '$owner.StartPosition = "CenterScreen"',
      '$owner.Size = New-Object System.Drawing.Size(1, 1)',
      '$owner.Opacity = 0',
      '$owner.Show()',
      '$owner.Activate()',
      '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
      `$dialog.Title = '${title}'`,
      `$dialog.Filter = '${filter}'`,
      initialDir ? `$dialog.InitialDirectory = '${initialDir.replace(/'/g, "''")}'` : '',
      '$result = $dialog.ShowDialog($owner)',
      '$owner.Close()',
      'if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.FileName }',
    ].filter(Boolean).join('; ');
    const { stdout } = await runWindowsPicker(script, '文件选择器');
    return { path: stdout.trim() };
  }
  if (process.platform === 'darwin') {
    const prompt = String(body.title || 'Select file').replace(/"/g, '\\"');
    const { stdout } = await execFileAsync('osascript', ['-e', `POSIX path of (choose file with prompt "${prompt}")`]);
    return { path: stdout.trim() };
  }
  throw new Error('当前系统暂不支持文件选择器，请手动粘贴文件路径');
}

async function readConfigJsonFileIfExists(filePath) {
  if (!(await exists(filePath))) {
    return null;
  }
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`配置文件不是合法 JSON：${filePath}`);
  }
}

function sanitizeName(name) {
  const cleaned = String(name || '').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
  if (!cleaned) {
    throw new Error('名称不能为空');
  }
  return cleaned;
}

async function copyRecursive(source, destination) {
  const stat = await fsp.stat(source);
  if (stat.isDirectory()) {
    await ensureDir(destination);
    const entries = await fsp.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await copyRecursive(path.join(source, entry.name), path.join(destination, entry.name));
    }
    return;
  }
  await ensureDir(path.dirname(destination));
  await fsp.copyFile(source, destination);
}

async function isDirectoryEmpty(targetDir) {
  if (!(await exists(targetDir))) {
    return true;
  }
  const entries = await fsp.readdir(targetDir);
  return entries.length === 0;
}

function replaceTemplateVars(value, vars) {
  return String(value || '').replace(/\{([a-zA-Z0-9_-]+)\}/g, (_, key) => vars[key] || '');
}

function dateStamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

async function readTeamProfileConfig(tools) {
  const teamConfigRoot = tools.teamConfigRoot ? normalizeUserPath(tools.teamConfigRoot) : '';
  const configuredAppIndexPath = tools.appIndexPath
    ? resolveOptionalRootPath(teamConfigRoot, tools.appIndexPath)
    : '';
  const readAppIndex = async () => {
    if (configuredAppIndexPath) {
      return await readConfigJsonFileIfExists(configuredAppIndexPath) || {};
    }
    if (!teamConfigRoot) {
      return {};
    }
    return await readConfigJsonFileIfExists(path.join(teamConfigRoot, 'apps', 'app-index.json')) ||
      await readConfigJsonFileIfExists(path.join(teamConfigRoot, 'app-index.json')) ||
      {};
  };

  if (!teamConfigRoot || !(await exists(teamConfigRoot))) {
    return {
      available: false,
      reason: teamConfigRoot ? '团队配置仓库不存在' : '未配置团队配置仓库',
      root: teamConfigRoot,
      profileName: tools.teamProfile || 'default',
      profile: {},
      appIndex: await readAppIndex(),
      appIndexPath: configuredAppIndexPath,
    };
  }

  const profileName = String(tools.teamProfile || 'default').trim() || 'default';
  const candidates = [
    path.join(teamConfigRoot, 'profiles', `${profileName}.json`),
    path.join(teamConfigRoot, `${profileName}.json`),
    path.join(teamConfigRoot, 'default-profile.json'),
    path.join(teamConfigRoot, 'profile.json'),
  ];
  let profilePath = '';
  let profile = null;
  for (const candidate of candidates) {
    profile = await readConfigJsonFileIfExists(candidate);
    if (profile) {
      profilePath = candidate;
      break;
    }
  }
  const appIndex = await readAppIndex();

  return {
    available: Boolean(profile),
    reason: profile ? '' : `未找到 profile：${profileName}`,
    root: teamConfigRoot,
    profileName,
    profilePath,
    profile: profile || {},
    appIndex,
    appIndexPath: configuredAppIndexPath,
  };
}

function normalizeAppIndex(appIndex) {
  const items = Array.isArray(appIndex)
    ? appIndex
    : Array.isArray(appIndex.apps)
      ? appIndex.apps
      : [];
  const byKey = new Map();
  for (const item of items) {
    if (!item) {
      continue;
    }
    const keys = [item.repoKey, item.name].map((value) => String(value || '').trim()).filter(Boolean);
    for (const key of keys) {
      byKey.set(key.toLowerCase(), item);
    }
  }
  return byKey;
}

async function looksLikeProjectDir(projectPath) {
  const markers = ['.git', 'pom.xml', 'package.json', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];
  for (const marker of markers) {
    if (await exists(path.join(projectPath, marker))) {
      return true;
    }
  }
  return false;
}

async function discoverRepoRootApps(repoRoot) {
  if (!repoRoot || !(await exists(repoRoot))) {
    return [];
  }
  let entries = [];
  try {
    entries = await fsp.readdir(repoRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const apps = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }
    const projectPath = path.join(repoRoot, entry.name);
    if (!(await looksLikeProjectDir(projectPath))) {
      continue;
    }
    apps.push({
      name: entry.name,
      repoKey: entry.name,
      sourcePath: projectPath,
      type: '',
      role: '',
    });
  }
  return apps;
}

function resolveProfileApps(profileApps, appIndex, tools, demandName, branchPattern) {
  const repoRoot = tools.repoRoot ? normalizeUserPath(tools.repoRoot) : '';
  const index = normalizeAppIndex(appIndex);
  const varsBase = {
    demand: demandName,
    date: dateStamp(),
  };
  return (Array.isArray(profileApps) ? profileApps : [])
    .map((raw) => {
      const key = String(raw.repoKey || raw.name || '').trim().toLowerCase();
      const indexed = key ? index.get(key) || {} : {};
      const app = { ...indexed, ...raw };
      const name = String(app.name || app.repoKey || '').trim();
      if (!name) {
        return null;
      }
      const relative = app.defaultRelativePath || app.relativePath || app.repoKey || name;
      const sourcePath = app.sourcePath
        ? resolveOptionalRootPath(repoRoot, app.sourcePath)
        : repoRoot
          ? path.resolve(repoRoot, relative)
          : '';
      const vars = { ...varsBase, app: name };
      return {
        name,
        sourcePath,
        worktreePath: app.worktreePath || `apps/${name}`,
        baseBranch: app.baseBranch || '',
        // Profile 只给研发提供候选命名；featureBranch 必须在 workspace 中由研发显式确认后写入。
        featureBranch: '',
        suggestedFeatureBranch: replaceTemplateVars(app.featureBranch || branchPattern || '', vars),
        type: app.type || 'java-backend',
        role: app.role || '',
        repoKey: app.repoKey || '',
      };
    })
    .filter(Boolean);
}

async function listAvailableApps(tools) {
  const repoRoot = tools.repoRoot ? normalizeUserPath(tools.repoRoot) : '';
  const team = await readTeamProfileConfig(tools);
  const byName = new Map();
  const addApp = (app, source) => {
    const name = String(app.name || app.repoKey || '').trim();
    if (!name) {
      return;
    }
    const relative = app.defaultRelativePath || app.relativePath || app.repoKey || name;
    const sourcePath = app.sourcePath
      ? resolveOptionalRootPath(repoRoot, app.sourcePath)
      : repoRoot
        ? path.resolve(repoRoot, relative)
        : '';
    const key = name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, {
        name,
        path: sourcePath,
        repoKey: app.repoKey || '',
        type: app.type || '',
        role: app.role || '',
        source,
      });
    }
  };

  const appIndexItems = Array.isArray(team.appIndex)
    ? team.appIndex
    : Array.isArray(team.appIndex.apps)
      ? team.appIndex.apps
      : [];
  for (const app of appIndexItems) {
    addApp(app, team.appIndexPath ? 'app-index' : 'team-config');
  }

  for (const app of await discoverRepoRootApps(repoRoot)) {
    addApp(app, 'repo-root');
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function whitepaperRootForTools(tools) {
  return String(tools.whitepaperRoot || '').trim();
}

async function resolveWhitepaperApplication(app, tools) {
  const repoRoot = tools.repoRoot ? normalizeUserPath(tools.repoRoot) : '';
  const candidates = [];
  if (repoRoot && app.sourcePath) {
    candidates.push(resolveOptionalRootPath(repoRoot, app.sourcePath));
  }
  if (repoRoot && app.repoKey) {
    candidates.push(path.join(repoRoot, app.repoKey));
  }
  const repoNames = app.localDiscovery && Array.isArray(app.localDiscovery.repoNames)
    ? app.localDiscovery.repoNames
    : [];
  for (const repoName of repoNames) {
    if (repoRoot && String(repoName || '').trim()) {
      candidates.push(path.join(repoRoot, String(repoName).trim()));
    }
  }
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return {
        ...app,
        sourcePath: candidate,
        sourceState: 'local',
      };
    }
  }
  return {
    ...app,
    sourcePath: '',
    sourceState: app.remote && app.remote.url ? 'remote-available' : 'unresolved',
  };
}

async function resolveWhitepaperWorkspaceContext(body) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  if (!workspacePath || !(await exists(workspacePath))) {
    throw new Error('请选择有效的 workspace');
  }
  const prdDir = path.join(workspacePath, 'prd');
  const prdFiles = await fsp.readdir(prdDir, { withFileTypes: true }).catch(() => []);
  if (!prdFiles.some((item) => item.isFile() && !/^README/i.test(item.name))) {
    throw new Error('请先导入 PRD 或需求材料，再确认功能点');
  }
  const tools = await readToolsConfig();
  const catalog = await readWhitepaperCatalog(whitepaperRootForTools(tools));
  if (!catalog.available) {
    throw new Error(catalog.reason || '白皮书索引不可用');
  }
  const context = resolveWhitepaperContext(catalog, body.primaryFunctionId, body.relatedFunctionIds || []);
  const applications = [];
  for (const app of context.applications) {
    applications.push(await resolveWhitepaperApplication(app, tools));
  }
  const enrichedContext = { ...context, applications };
  const current = await readWorkspaceConfig(workspacePath);
  const existingApps = Array.isArray(current.apps) ? current.apps : [];
  const whitepaperApps = applications
    .filter((app) => app.sourceState === 'local' && app.sourcePath)
    .map((app) => ({
      name: app.name,
      sourcePath: app.sourcePath,
      baseBranch: app.baseBranch || '',
      type: app.type || 'java-backend',
      role: app.role || '',
      repoKey: app.repoKey || '',
    }));
  const mergedApps = Array.from(new Map(
    [...existingApps, ...whitepaperApps].map((app) => [
      `${String(app.name || '').toLowerCase()}|${String(app.sourcePath || '').toLowerCase()}`,
      app,
    ]),
  ).values());
  const functionPoint = {
    primaryId: context.primaryFunction.id,
    primaryName: context.primaryFunction.name,
    relatedIds: context.relatedFunctions.map((item) => item.id),
  };
  const config = await writeWorkspaceConfig(workspacePath, {
    apps: mergedApps,
    functionPoint,
    whitepaperContext: enrichedContext,
  });
  await writeWorkspaceJsonFile(workspacePath, '.workflow/whitepaper.lock.json', enrichedContext);
  await writeWorkspaceTextFile(workspacePath, 'context/whitepaper-context.md', whitepaperContextMarkdown(enrichedContext));
  return { catalog, context: enrichedContext, config };
}

async function persistResolvedWhitepaperApplication(workspacePath, current, updatedApplication) {
  const context = current.whitepaperContext && typeof current.whitepaperContext === 'object'
    ? current.whitepaperContext
    : {};
  const applications = (context.applications || []).map((item) => (
    String(item.id || '').toLowerCase() === String(updatedApplication.id || '').toLowerCase()
      ? updatedApplication
      : item
  ));
  const nextContext = { ...context, applications, resolvedAt: nowIso() };
  const existingApps = Array.isArray(current.apps) ? current.apps : [];
  const candidateApps = updatedApplication.sourcePath
    ? [...existingApps, {
      name: updatedApplication.name,
      sourcePath: updatedApplication.sourcePath,
      baseBranch: updatedApplication.baseBranch || '',
      type: updatedApplication.type || 'java-backend',
      role: updatedApplication.role || '',
      repoKey: updatedApplication.repoKey || '',
    }]
    : existingApps;
  const apps = Array.from(new Map(candidateApps.map((app) => [
    `${String(app.name || '').toLowerCase()}|${String(app.sourcePath || '').toLowerCase()}`,
    app,
  ])).values());
  const config = await writeWorkspaceConfig(workspacePath, {
    apps,
    whitepaperContext: nextContext,
  });
  await writeWorkspaceJsonFile(workspacePath, '.workflow/whitepaper.lock.json', nextContext);
  await writeWorkspaceTextFile(workspacePath, 'context/whitepaper-context.md', whitepaperContextMarkdown(nextContext));
  return { config, context: nextContext };
}

function isSupportedRemoteGitUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) || /^git@[^:]+:.+/.test(url) || /^ssh:\/\//i.test(url);
}

async function fetchWhitepaperApplicationSource(body) {
  if (body.confirm !== true) {
    throw new Error('拉取远程代码需要显式确认');
  }
  const workspacePath = normalizeUserPath(body.workspacePath);
  if (!workspacePath || !(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('请选择有效的 workspace');
  }
  const appId = String(body.appId || '').trim().toLowerCase();
  const current = await readWorkspaceConfig(workspacePath);
  const applications = (current.whitepaperContext && current.whitepaperContext.applications) || [];
  const application = applications.find((item) => String(item.id || '').trim().toLowerCase() === appId);
  if (!application) {
    throw new Error('当前 workspace 没有该白皮书应用，请先确认功能点');
  }
  if (application.sourceState === 'local' && application.sourcePath && await exists(application.sourcePath)) {
    return { status: 'already-local', ...(await persistResolvedWhitepaperApplication(workspacePath, current, application)) };
  }
  const remoteUrl = String(application.remote && application.remote.url || '').trim();
  if (!isSupportedRemoteGitUrl(remoteUrl)) {
    throw new Error('白皮书应用没有可用的 Git 远程地址');
  }
  const tools = await readToolsConfig();
  const cacheRoot = tools.codeCacheRoot
    ? normalizeUserPath(tools.codeCacheRoot)
    : tools.repoRoot
      ? path.join(normalizeUserPath(tools.repoRoot), '.delivery-workflow-cache')
      : '';
  if (!cacheRoot) {
    throw new Error('请先配置业务代码根目录，远程代码会拉取到其 .delivery-workflow-cache 目录');
  }
  await ensureDir(cacheRoot);
  const repoName = sanitizeName(application.repoKey || application.id || application.name);
  const targetPath = path.join(cacheRoot, repoName);
  assertWithin(cacheRoot, targetPath);
  let status = 'cloned';
  if (await exists(targetPath)) {
    if (!(await exists(path.join(targetPath, '.git')))) {
      throw new Error(`目标目录已存在且不是 Git 仓库：${targetPath}`);
    }
    status = 'existing-cache';
  } else {
    const branch = String(application.baseBranch || application.remote && application.remote.baseBranch || '').trim();
    const args = branch
      ? ['clone', '--single-branch', '--branch', branch, remoteUrl, targetPath]
      : ['clone', remoteUrl, targetPath];
    await execFileAsync('git', args, {
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
  }
  const updatedApplication = {
    ...application,
    sourcePath: targetPath,
    sourceState: 'local-cache',
    sourceRemote: await gitOutputSafe(['remote', 'get-url', 'origin'], targetPath),
    sourceRevision: await gitHead(targetPath),
  };
  const persisted = await persistResolvedWhitepaperApplication(workspacePath, current, updatedApplication);
  return { status, sourcePath: targetPath, ...persisted };
}

function resolveProfileCapabilities(profile, root) {
  const inlineCapabilities = normalizeCapabilityList(profile.capabilities);
  const legacySkills = normalizeTextList(profile.skills).map((item) => ({
    id: item,
    type: 'skill',
    name: path.basename(item),
    path: item,
    enabled: true,
  }));
  const legacyRules = normalizeTextList(profile.rules).map((item) => ({
    id: item,
    type: 'rule',
    name: path.basename(item),
    path: item,
    enabled: true,
  }));
  return [...inlineCapabilities, ...legacySkills, ...legacyRules].map((capability) => ({
    ...capability,
    path: capability.path ? resolveOptionalRootPath(root, capability.path) : '',
  }));
}

async function resolveTeamDefaultsForWorkspace(tools, demandName) {
  const team = await readTeamProfileConfig(tools);
  if (!team.available) {
    return {
      appPaths: [],
      apps: [],
      knowledge: [],
      skills: [],
      rules: [],
      capabilities: [],
      branchPattern: '',
      loadAppContextForClarification: false,
      notes: '',
      profile: {
        name: tools.teamProfile || 'default',
        inherited: false,
        reason: team.reason,
      },
    };
  }

  const root = team.root;
  const profile = team.profile || {};
  const branchPattern = String(profile.branchPattern || '').trim();
  const apps = resolveProfileApps(profile.apps, team.appIndex, tools, demandName, branchPattern);
  const skills = normalizeTextList(profile.skills).map((item) => resolveOptionalRootPath(root, item));
  const rules = normalizeTextList(profile.rules).map((item) => resolveOptionalRootPath(root, item));
  const capabilities = resolveProfileCapabilities(profile, root);
  const knowledge = normalizeNamedPaths(profile.knowledge).map((item) => ({
    ...item,
    path: resolveOptionalRootPath(root, item.path),
  }));
  const notes = [
    profile.description ? `Profile：${profile.description}` : '',
    profile.notes || '',
  ].filter(Boolean).join('\n');
  return {
    appPaths: apps.map((app) => ({ name: app.name, path: app.sourcePath })),
    apps,
    knowledge,
    skills,
    rules,
    capabilities,
    branchPattern,
    loadAppContextForClarification: Boolean(profile.loadAppContextForClarification),
    notes,
    profile: {
      name: team.profileName,
      inherited: true,
      root,
      profilePath: team.profilePath,
      inheritedAt: nowIso(),
    },
  };
}

async function readWorkspaceTextIfExists(workspacePath, relativePath) {
  const fullPath = path.join(workspacePath, relativePath);
  assertWithin(workspacePath, fullPath);
  if (!(await exists(fullPath))) {
    return '';
  }
  const stat = await fsp.stat(fullPath);
  if (!stat.isFile()) {
    return '';
  }
  return fsp.readFile(fullPath, 'utf8');
}

function truncateText(text, maxLength = 20000) {
  const value = String(text || '');
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n\n[内容过长，已截断 ${value.length - maxLength} 字符]`;
}

async function startAgentRun(body) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  const stepId = String(body.stepId || '').trim();
  const unitId = String(body.unitId || '').trim();
  const executor = body.executor === 'claude' ? 'claude' : 'codex';
  const taskId = String(body.taskId || '').trim();

  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  const workflow = await readWorkflowDefinition(workspacePath);
  const definition = workflow.steps[stepId];
  if (!definition || definition.kind !== 'agent') {
    throw new Error(`步骤不可由 CLI 执行：${stepId}`);
  }
  if (stepId === '06-implement-task' && !/^T\d{3}$/i.test(taskId)) {
    throw new Error('06 单任务实现必须先填写任务编号，例如 T001');
  }
  if (stepId === '06-implement-task') {
    await assertTaskAllowedForImplementation(workspacePath, taskId);
  }
  for (const requirement of definition.requires || []) {
    if (!(await pathExistsInWorkspace(workspacePath, requirement))) {
      throw new Error(`前置确认未完成：${requirement}`);
    }
  }

  const config = await readWorkspaceConfig(workspacePath);
  const runConfig = shouldExposeAppContextForStep(stepId, config)
    ? { ...config }
    : { ...config, appPaths: [], apps: [] };
  let preparedWorktrees = [];
  if (stepId === '06-implement-task') {
    preparedWorktrees = await ensureImplementationWorktrees(workspacePath, config);
    runConfig.appPaths = preparedWorktrees.map((item) => ({
      name: item.name,
      path: item.worktreePath,
    }));
  }
  const tools = await readToolsConfig();
  const capabilities = await linkConfiguredCapabilities(workspacePath, tools, config);
  const routedCapabilities = await routeCapabilitiesForStep(workspacePath, stepId, capabilities, workflow);
  const prompt = await buildPrompt(workspacePath, stepId, taskId, runConfig, routedCapabilities);
  const capabilityAccessDirs = [
    ...await collectCapabilityAccessDirs(workspacePath, routedCapabilities.enabled),
    ...knowledgeAccessDirs(runConfig),
  ];
  const runsDir = await getRunsDir(workspacePath);
  const runId = createRunId(stepId);
  const runFile = path.join(runsDir, `${runId}.json`);
  const logFile = path.join(runsDir, `${runId}.log`);
  const promptFile = path.join(runsDir, `${runId}.prompt.md`);
  assertWithin(workspacePath, runFile);
  assertWithin(workspacePath, logFile);
  assertWithin(workspacePath, promptFile);
  await fsp.writeFile(promptFile, prompt, 'utf8');

  const commandSpec = buildExecutorCommand(executor, workspacePath, runConfig.appPaths, capabilityAccessDirs, tools);
  const meta = {
    runId,
    unitId,
    stepId,
    executor,
    status: 'running',
    workspacePath,
    taskId: stepId === '06-implement-task' ? taskId.toUpperCase() : '',
    promptFile: path.relative(workspacePath, promptFile).replace(/\\/g, '/'),
    logFile: path.relative(workspacePath, logFile).replace(/\\/g, '/'),
    command: [commandSpec.command, ...commandSpec.args].join(' '),
    accessDirs: capabilityAccessDirs,
    capabilities: routedCapabilities,
    preparedWorktrees,
    startedAt: nowIso(),
    endedAt: '',
    exitCode: null,
    error: '',
  };
  return launchAgentProcess({
    workspacePath,
    runId,
    prompt,
    commandSpec,
    runFile,
    logFile,
    meta,
    initialLog: [
      `# Run ${runId}`,
      `startedAt: ${meta.startedAt}`,
      `executor: ${executor}`,
      `stepId: ${stepId}`,
      `command: ${meta.command}`,
      '',
      '---',
      '',
    ].join('\n'),
  });
}

async function collectDiffSummary(apps) {
  const sections = [];
  for (const app of apps) {
    const repoPath = app.worktreePath || app.sourcePath || app.path;
    if (!repoPath || !(await exists(repoPath))) {
      continue;
    }
    const status = await gitOutputSafe(['status', '--short'], repoPath);
    const diffStat = await gitOutputSafe(['diff', '--stat'], repoPath);
    const diffNameStatus = await gitOutputSafe(['diff', '--name-status'], repoPath);
    sections.push([
      `### ${app.name || path.basename(repoPath)}`,
      '',
      `路径：${repoPath}`,
      '',
      '```text',
      'git status --short',
      status || '(clean)',
      '',
      'git diff --stat',
      diffStat || '(no diff)',
      '',
      'git diff --name-status',
      diffNameStatus || '(no diff)',
      '```',
    ].join('\n'));
  }
  return sections.join('\n\n');
}

async function getImplementationTargets(workspacePath, config) {
  return normalizeApps(config.apps, config.appPaths).map((app) => {
    const appName = app.name || path.basename(app.sourcePath);
    const worktreePath = path.join(workspacePath, app.worktreePath || path.join('apps', appName));
    return {
      name: appName,
      sourcePath: app.sourcePath,
      worktreePath,
      branchName: app.featureBranch || '',
      exists: fs.existsSync(worktreePath),
    };
  });
}

async function readWorkspaceDiff(body) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  const config = await readWorkspaceConfig(workspacePath);
  const appName = String(body.appName || '').trim();
  const targets = await getImplementationTargets(workspacePath, config);
  const selected = targets.filter((app) => !appName || app.name === appName);
  const diff = await collectDiffSummary(selected.map((app) => ({
    ...app,
    worktreePath: app.exists ? app.worktreePath : app.sourcePath,
  })));
  return { apps: targets, diff };
}

function openWithSystem(targetPath) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = [targetPath];
    const child = spawn(command, args, {
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.unref();
    resolve();
  });
}

function openWithExecutable(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
    });
    child.on('error', reject);
    child.unref();
    resolve();
  });
}

async function openAppInIdea(body) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  const appName = String(body.appName || '').trim();
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  const config = await readWorkspaceConfig(workspacePath);
  const targets = await getImplementationTargets(workspacePath, config);
  const target = targets.find((app) => !appName || app.name === appName);
  if (!target) {
    throw new Error(appName ? `未找到应用：${appName}` : '未配置应用目录');
  }
  const targetPath = target.exists ? target.worktreePath : target.sourcePath;
  const tools = await readToolsConfig();
  const ideaExecutable = await findIdeaExecutable(tools.ideaPath);
  if (ideaExecutable) {
    await openWithExecutable(ideaExecutable, [targetPath]);
    return { opened: true, targetPath, mode: 'idea-executable', executable: ideaExecutable };
  }
  await openWithSystem(targetPath);
  return { opened: true, targetPath, mode: 'system-folder' };
}

async function openWorkspaceFolder(body) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  await openWithSystem(workspacePath);
  return { opened: true, targetPath: workspacePath, mode: 'system-folder' };
}

function normalizeDomainSources(value) {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values
    .flatMap((item) => String(item || '').split(/[\r\n,]+/))
    .map((item) => item.trim())
    .filter(Boolean)));
}

function isGitRemote(value) {
  return /^(https?:\/\/|ssh:\/\/|git@)/i.test(String(value || '').trim());
}

async function materializeDomainSources(workspacePathValue, sourcesValue) {
  const workspacePath = normalizeUserPath(workspacePathValue || '');
  const sources = normalizeDomainSources(sourcesValue);
  if (!sources.length) throw new Error('创建需求至少需要填写一个 Harness 本地目录或 Git 地址');
  const resolved = [];
  for (const [index, source] of sources.entries()) {
    if (!isGitRemote(source)) {
      const root = normalizeUserPath(source);
      const inspected = await inspectDomainHarness(root);
      if (!inspected.available) throw new Error(`Harness 无法挂载：${source}；${inspected.reason || ''}`);
      resolved.push({ source, root, cloned: false });
      continue;
    }
    const sourceName = sanitizeName(path.basename(source.replace(/[\\/]+$/, '')).replace(/\.git$/i, '') || `harness-${index + 1}`);
    const target = path.join(workspacePath, 'context', 'domain-sources', `${String(index + 1).padStart(2, '0')}-${sourceName}`);
    assertWithin(workspacePath, target);
    if (!(await exists(target))) {
      await ensureDir(path.dirname(target));
      try {
        await execFileAsync('git', ['clone', '--depth', '1', '--', source, target], {
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch (error) {
        throw new Error(`无法克隆 Harness：${source}；${String(error.stderr || error.message || '').trim()}`);
      }
    }
    const inspected = await inspectDomainHarness(target);
    if (!inspected.available) throw new Error(`克隆结果不是可挂载 Harness：${source}；${inspected.reason || ''}`);
    resolved.push({ source, root: target, cloned: true });
  }
  return resolved;
}

async function openWorkspacePath(body) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  const relativePath = String(body.path || '').trim().replace(/\\/g, '/');
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  if (!relativePath) {
    throw new Error('请选择要打开的文件或目录');
  }
  const targetPath = path.resolve(workspacePath, relativePath);
  assertWithin(workspacePath, targetPath);
  if (!(await exists(targetPath))) {
    throw new Error(`文件或目录不存在：${relativePath}`);
  }
  await openWithSystem(targetPath);
  return { opened: true, targetPath, mode: 'system-path' };
}

async function openConfiguredFolder(body, type) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  const config = await readWorkspaceConfig(workspacePath);
  let targetPath = '';
  if (type === 'domain') {
    const domain = config.domainContext && config.domainContext.root ? config.domainContext : config.domain || {};
    targetPath = normalizeUserPath(domain.root);
  } else {
    const appName = String(body.appName || '').trim();
    const app = (config.apps || []).find((item) => item.name === appName);
    targetPath = app ? normalizeUserPath(app.worktreePath || app.sourcePath) : '';
  }
  if (!targetPath || !(await exists(targetPath))) {
    throw new Error(type === 'domain' ? '未找到可打开的领域目录' : '未找到可打开的应用目录');
  }
  await openWithSystem(targetPath);
  return { opened: true, targetPath, mode: `configured-${type}-folder` };
}

async function startAiAdjustmentRun(body) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  const executor = body.executor === 'claude' ? 'claude' : 'codex';
  const instruction = String(body.instruction || '').trim();
  if (!instruction) {
    throw new Error('请先填写本轮希望 AI 调整的内容');
  }
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }

  const config = await readWorkspaceConfig(workspacePath);
  const preparedWorktrees = await ensureImplementationWorktrees(workspacePath, config);
  const selectedAppName = String(body.appName || '').trim();
  const targetApps = preparedWorktrees.filter((app) => !selectedAppName || app.name === selectedAppName);
  if (!targetApps.length) {
    throw new Error(selectedAppName ? `未找到应用：${selectedAppName}` : '未配置可调整的应用 worktree');
  }
  const runConfig = {
    ...config,
    appPaths: targetApps.map((item) => ({
      name: item.name,
      path: item.worktreePath,
    })),
  };
  const diffSummary = await collectDiffSummary(targetApps);
  const tools = await readToolsConfig();
  const workflow = await readWorkflowDefinition(workspacePath);
  const capabilities = await linkConfiguredCapabilities(workspacePath, tools, config);
  const routedCapabilities = await routeCapabilitiesForStep(workspacePath, '06-implement-task', capabilities, workflow);
  const prompt = await buildAiAdjustmentPrompt(workspacePath, body, runConfig, targetApps, diffSummary, routedCapabilities);
  const capabilityAccessDirs = [
    ...await collectCapabilityAccessDirs(workspacePath, routedCapabilities.enabled),
    ...knowledgeAccessDirs(config),
  ];
  const runsDir = await getRunsDir(workspacePath);
  const runId = createRunId('ai-adjust');
  const runFile = path.join(runsDir, `${runId}.json`);
  const logFile = path.join(runsDir, `${runId}.log`);
  const promptFile = path.join(runsDir, `${runId}.prompt.md`);
  assertWithin(workspacePath, runFile);
  assertWithin(workspacePath, logFile);
  assertWithin(workspacePath, promptFile);
  await fsp.writeFile(promptFile, prompt, 'utf8');
  await appendAiAdjustmentRecord(workspacePath, body, runId, targetApps);

  const commandSpec = buildExecutorCommand(executor, workspacePath, runConfig.appPaths, capabilityAccessDirs, tools);
  const meta = {
    runId,
    unitId: 'design-to-code',
    stepId: 'ai-adjust',
    executor,
    status: 'running',
    workspacePath,
    taskId: String(body.taskId || '').trim().toUpperCase(),
    promptFile: path.relative(workspacePath, promptFile).replace(/\\/g, '/'),
    logFile: path.relative(workspacePath, logFile).replace(/\\/g, '/'),
    command: [commandSpec.command, ...commandSpec.args].join(' '),
    accessDirs: capabilityAccessDirs,
    capabilities: routedCapabilities,
    preparedWorktrees: targetApps,
    startedAt: nowIso(),
    endedAt: '',
    exitCode: null,
    error: '',
  };
  return launchAgentProcess({
    workspacePath,
    runId,
    prompt,
    commandSpec,
    runFile,
    logFile,
    meta,
    initialLog: [
      `# Run ${runId}`,
      `startedAt: ${meta.startedAt}`,
      `executor: ${executor}`,
      'stepId: ai-adjust',
      `taskId: ${meta.taskId || ''}`,
      `command: ${meta.command}`,
      '',
      '---',
      '',
    ].join('\n'),
  });
}

async function listWorkspaces(outputRootValue) {
  const tools = outputRootValue ? null : await readToolsConfig();
  const outputRoot = normalizeUserPath(outputRootValue || (tools && tools.workspaceRoot) || DEFAULT_OUTPUT_ROOT);
  if (!(await exists(outputRoot))) {
    return [];
  }
  const entries = await fsp.readdir(outputRoot, { withFileTypes: true });
  const workspaces = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const workspacePath = path.join(outputRoot, entry.name);
    if (await exists(path.join(workspacePath, 'AGENTS.md'))) {
      workspaces.push({ name: entry.name, path: workspacePath });
    }
  }
  return workspaces.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function chooseDestinationDir(prdRoot, targetSubdir) {
  const allowed = new Set(['', 'source', 'assets', 'tables', 'metadata', 'templates', 'examples', 'references']);
  const normalized = String(targetSubdir || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!allowed.has(normalized)) {
    throw new Error('PRD 目标目录不合法');
  }
  return path.join(prdRoot, normalized || 'source');
}

async function importLocalPaths(workspacePathValue, sourcePaths, targetSubdir) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  const prdRoot = path.join(workspacePath, 'prd');
  const destinationDir = chooseDestinationDir(prdRoot, targetSubdir);
  await ensureDir(destinationDir);

  const imported = [];
  for (const sourcePathValue of sourcePaths || []) {
    const sourcePath = normalizeUserPath(sourcePathValue);
    if (!sourcePath || !(await exists(sourcePath))) {
      throw new Error(`本地路径不存在：${sourcePathValue}`);
    }
    const safeBaseName = sanitizeName(path.basename(sourcePath));
    const destination = path.join(destinationDir, safeBaseName);
    assertWithin(prdRoot, destination);
    await copyRecursive(sourcePath, destination);
    imported.push(path.relative(workspacePath, destination).replace(/\\/g, '/'));
  }
  const sourceImports = imported.filter((item) => item.startsWith('prd/source/'));
  const ingestion = sourceImports.length ? await ingestPrdSources(workspacePath, sourceImports) : null;
  return { imported, ingestion };
}

function capabilitiesMarkdown(snapshot) {
  const items = (entries) => entries.length
    ? entries.map((entry) => [
      `- [${entry.availability || 'available'}] ${capabilityDisplayName(entry)}`,
      entry.fallback ? `  - 降级流程：${entry.fallback}` : '',
    ].filter(Boolean).join('\n')).join('\n')
    : '- 无';
  return [
    '# 当前需求能力快照',
    '',
    '> 这是当前 Workspace 的能力快照。公共源目录只读；请勿把需求过程文件写回 skills、rules 或领域 Harness。',
    '',
    `generated_at: ${snapshot.generatedAt}`,
    '',
    '## Skills（仅 `available` 可按步骤路由使用）',
    '',
    items(snapshot.skills),
    '',
    '## Rules（仅 `available` 可按步骤路由使用）',
    '',
    items(snapshot.rules),
    '',
    '## 使用约束',
    '',
    '- 开始工作前先阅读 `AGENTS.md`、`.workflow/progress.md`、`context/domain-summary.md` 和本文件；实施、Review、测试、交付阶段还要读取 `context/current-context.md`（若存在）。',
    '- 只读取当前步骤提示词列出的 `available` 能力；Skill 为目录时先读其中的 `SKILL.md`，Rule 为文件时先读规则正文。',
    '- `unavailable` 仅表示本机未挂载，不是当前阶段的阻塞条件；按阶段命令的降级流程继续。',
    '- 只在当前需求相关的阶段使用能力；PRD 与人工确认优先于领域背景或通用规则。',
    snapshot.notes ? `\n## 团队补充约束\n\n${snapshot.notes}` : '',
    '',
  ].join('\n');
}

async function refreshWorkspaceCapabilities(workspacePathValue) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  if (!workspacePath || !(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('请选择有效的 workspace');
  }
  const tools = await readToolsConfig();
  const config = await readWorkspaceConfig(workspacePath);
  const resolved = await linkConfiguredCapabilities(workspacePath, tools, config);
  const snapshot = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    skills: resolved.skills || [],
    rules: resolved.rules || [],
    notes: resolved.notes || '',
  };
  await writeWorkspaceJsonFile(workspacePath, CAPABILITY_LOCK_FILE, snapshot);
  await writeWorkspaceTextFile(workspacePath, CAPABILITY_SUMMARY_FILE, capabilitiesMarkdown(snapshot));
  return snapshot;
}

async function importFeishuPrd(body) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  const links = normalizeTextList(body.links || body.feishuDocs || []);
  if (!links.length) {
    throw new Error('请先填写飞书文档链接');
  }
  const tools = await readToolsConfig();
  const feishuIntegration = tools.integrations && tools.integrations.feishu
    ? tools.integrations.feishu
    : {};
  const imported = [];
  const failed = [];
  for (const link of links) {
    try {
      const item = await importFeishuDocument(link, feishuIntegration, {
        mockMarkdown: body.mockMarkdown,
      });
      imported.push(item);
    } catch (error) {
      failed.push({
        source: 'feishu',
        url: link,
        status: 'failed',
        importedAt: new Date().toISOString(),
        error: error.message,
      });
    }
  }

  const records = [...imported, ...failed].map((item) => {
    const { markdown, ...meta } = item;
    return meta;
  });
  await writeWorkspaceJsonFile(workspacePath, 'prd/source/feishu.json', {
    version: 1,
    importedAt: new Date().toISOString(),
    records,
  });

  if (imported.length) {
    const documentMarkdown = imported.map((item, index) => [
      imported.length > 1 ? `# 飞书文档 ${index + 1}${item.title ? `：${item.title}` : ''}` : '',
      item.markdown,
    ].filter(Boolean).join('\n\n')).join('\n\n---\n\n');
    await writeWorkspaceTextFile(workspacePath, 'prd/document.md', documentMarkdown);
  }

  const config = await readWorkspaceConfig(workspacePath);
  await writeWorkspaceConfig(workspacePath, {
    feishuDocs: links,
    profile: {
      ...(config.profile || {}),
      feishuImport: {
        importedCount: imported.length,
        failedCount: failed.length,
        updatedAt: new Date().toISOString(),
      },
    },
  });

  return {
    imported: records.filter((item) => item.status === 'imported'),
    failed,
    sourcePath: 'prd/source/feishu.json',
    documentPath: imported.length ? 'prd/document.md' : '',
  };
}

function normalizeCommandArgs(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildFeishuCliCommandLine(command, args) {
  const cleanCommand = String(command || '').trim();
  const cleanArgs = normalizeCommandArgs(args);
  const needsSecretStdin = cleanArgs.includes('--app-secret-stdin');
  if (process.platform === 'win32') {
    const lines = [
      `Write-Host ${quotePowerShellArg('Delivery Workflow: Feishu / Lark CLI login')}`,
    ];
    if (needsSecretStdin) {
      lines.push(`Write-Host ${quotePowerShellArg('This command needs App Secret. Paste App Secret on the next line and press Enter. Input may be hidden.')}`);
    }
    lines.push(`& ${quotePowerShellArg(cleanCommand)} ${cleanArgs.map(quotePowerShellArg).join(' ')}`.trim());
    return lines.join('\r\n');
  }
  const lines = [
    `echo ${quoteShellArg('Delivery Workflow: Feishu / Lark CLI login')}`,
  ];
  if (needsSecretStdin) {
    lines.push(`echo ${quoteShellArg('This command needs App Secret. Paste App Secret on the next line and press Enter. Input may be hidden.')}`);
  }
  lines.push([quoteShellArg(cleanCommand), ...cleanArgs.map(quoteShellArg)].join(' '));
  return lines.join(' && ');
}

function isCliSubcommandOnly(value) {
  return /^(login|auth|authorize|signin|sign-in|oauth)$/i.test(String(value || '').trim());
}

function hasCommandArguments(value) {
  return /\s/.test(String(value || '').trim());
}

async function authorizeFeishuCli(body = {}) {
  const feishu = body.feishu && typeof body.feishu === 'object' ? body.feishu : {};
  const cliCommand = String(feishu.cliCommand || '').trim();
  if (!cliCommand) {
    throw new Error('请先填写飞书 / Lark CLI 命令。');
  }
  if (isCliSubcommandOnly(cliCommand)) {
    throw new Error('CLI 可执行命令不能填 login/auth。请填写真实命令，例如 npx、lark-mcp 或公司封装命令；login 放到 CLI 登录参数。');
  }
  if (hasCommandArguments(cliCommand)) {
    throw new Error('CLI 可执行命令只填命令本身，例如 npx；包名、子命令和 login 请放到 CLI 登录参数。');
  }
  const executablePath = await findExecutable(cliCommand);
  if (!executablePath && !/[\\/]/.test(cliCommand)) {
    throw new Error(`未找到 CLI 命令：${cliCommand}。请先安装公司飞书 CLI，或把 CLI 可执行命令改为 npx。`);
  }
  const cliAuthArgs = normalizeCommandArgs(feishu.cliAuthArgs);
  const tools = await readToolsConfig();
  const configuredRoot = normalizeUserPath(tools.workspaceRoot || DEFAULT_OUTPUT_ROOT);
  const cwd = configuredRoot && await exists(configuredRoot) ? configuredRoot : WORKFLOW_DIR;
  const commandLine = buildFeishuCliCommandLine(cliCommand, cliAuthArgs);
  await openTerminalCommand(commandLine, cwd);
  return {
    cwd,
    commandLine: [cliCommand, ...cliAuthArgs].join(' '),
  };
}

function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) {
    throw new Error('上传请求缺少 boundary');
  }
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const parts = [];
  let cursor = buffer.indexOf(boundary);
  while (cursor !== -1) {
    cursor += boundary.length;
    if (buffer[cursor] === 45 && buffer[cursor + 1] === 45) {
      break;
    }
    if (buffer[cursor] === 13 && buffer[cursor + 1] === 10) {
      cursor += 2;
    }
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), cursor);
    if (headerEnd === -1) {
      break;
    }
    const headersText = buffer.slice(cursor, headerEnd).toString('utf8');
    const nextBoundary = buffer.indexOf(boundary, headerEnd + 4);
    if (nextBoundary === -1) {
      break;
    }
    let body = buffer.slice(headerEnd + 4, nextBoundary);
    if (body.length >= 2 && body[body.length - 2] === 13 && body[body.length - 1] === 10) {
      body = body.slice(0, -2);
    }
    const disposition = /content-disposition:[^\r\n]+/i.exec(headersText);
    const name = disposition && /name="([^"]+)"/i.exec(disposition[0]);
    const filename = disposition && /filename="([^"]*)"/i.exec(disposition[0]);
    parts.push({
      name: name ? name[1] : '',
      filename: filename ? filename[1] : '',
      body,
    });
    cursor = nextBoundary;
  }
  return parts;
}

async function importUploadedFiles(req) {
  const buffer = await readBuffer(req, MAX_UPLOAD_BODY);
  const parts = parseMultipart(buffer, req.headers['content-type']);
  const fields = {};
  const files = [];
  for (const part of parts) {
    if (part.filename) {
      files.push(part);
    } else if (part.name) {
      fields[part.name] = part.body.toString('utf8');
    }
  }

  const workspacePath = normalizeUserPath(fields.workspacePath);
  const prdRoot = path.join(workspacePath, 'prd');
  const destinationDir = chooseDestinationDir(prdRoot, fields.targetSubdir);
  await ensureDir(destinationDir);

  const imported = [];
  for (const file of files) {
    const safeBaseName = sanitizeName(path.basename(file.filename));
    const destination = path.join(destinationDir, safeBaseName);
    assertWithin(prdRoot, destination);
    await fsp.writeFile(destination, file.body);
    imported.push(path.relative(workspacePath, destination).replace(/\\/g, '/'));
  }
  const sourceImports = imported.filter((item) => item.startsWith('prd/source/'));
  const ingestion = sourceImports.length ? await ingestPrdSources(workspacePath, sourceImports) : null;
  return { imported, ingestion };
}

async function getCommandText(workspacePath, stepId) {
  const workflow = await readWorkflowDefinition(workspacePath);
  const definition = workflow.steps[stepId];
  if (!definition || !definition.commandFile) {
    return '';
  }
  const commandPath = path.join(workspacePath, definition.commandFile);
  assertWithin(workspacePath, commandPath);
  if (await exists(commandPath)) {
    return fsp.readFile(commandPath, 'utf8');
  }
  const fallbackPath = path.join(COMMANDS_DIR, path.basename(definition.commandFile));
  return (await exists(fallbackPath)) ? fsp.readFile(fallbackPath, 'utf8') : '';
}

async function readCommandTemplate(workspacePathValue, stepIdValue) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  const stepId = String(stepIdValue || '');
  const workflow = await readWorkflowDefinition(workspacePath);
  const definition = workflow.steps[stepId];
  if (!definition || !definition.commandFile) {
    throw new Error(`当前步骤没有可编辑提示词模板：${stepId}`);
  }
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }

  const relativePath = definition.commandFile.replace(/\\/g, '/');
  const commandPath = path.join(workspacePath, relativePath);
  assertWithin(workspacePath, commandPath);
  const fallbackPath = path.join(COMMANDS_DIR, path.basename(relativePath));
  const fallbackContent = (await exists(fallbackPath)) ? await fsp.readFile(fallbackPath, 'utf8') : '';
  const existsInWorkspace = await exists(commandPath);
  const content = existsInWorkspace ? await fsp.readFile(commandPath, 'utf8') : fallbackContent;
  return {
    path: relativePath,
    exists: existsInWorkspace,
    customized: existsInWorkspace && fallbackContent ? content !== fallbackContent : existsInWorkspace,
    content,
    defaultContent: fallbackContent,
  };
}

async function resetCommandTemplate(body) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  const stepId = String(body.stepId || '');
  const workflow = await readWorkflowDefinition(workspacePath);
  const definition = workflow.steps[stepId];
  if (!definition || !definition.commandFile) {
    throw new Error(`当前步骤没有可恢复模板：${stepId}`);
  }
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }

  const relativePath = definition.commandFile.replace(/\\/g, '/');
  const fallbackPath = path.join(COMMANDS_DIR, path.basename(relativePath));
  if (!(await exists(fallbackPath))) {
    throw new Error(`脚手架默认模板不存在：${path.basename(relativePath)}`);
  }
  const content = await fsp.readFile(fallbackPath, 'utf8');
  const commandPath = path.join(workspacePath, relativePath);
  assertWithin(workspacePath, commandPath);
  await ensureDir(path.dirname(commandPath));
  await fsp.writeFile(commandPath, content, 'utf8');
  return {
    path: relativePath,
    savedAt: nowIso(),
  };
}

function formatCapabilitiesForPrompt(routedCapabilities = { enabled: { skills: [], rules: [], notes: '' }, disabled: { skills: [], rules: [] } }) {
  const capabilities = routedCapabilities.enabled || routedCapabilities;
  const disabled = routedCapabilities.disabled || { skills: [], rules: [] };
  const sections = [];
  if (capabilities.skills && capabilities.skills.length) {
    sections.push([
      '### 本步骤启用 skills',
      ...capabilities.skills.map((item) => `- ${capabilityDisplayName(item)}`),
      '',
      '调用方式：这些 skills 由服务端按当前步骤路由命中。先读取对应 SKILL.md，再按其脚本、示例和约束执行。',
    ].join('\n'));
  }
  if (capabilities.rules && capabilities.rules.length) {
    sections.push([
      '### 本步骤启用 rules',
      ...capabilities.rules.map((item) => `- ${capabilityDisplayName(item)}`),
      '',
      '调用方式：这些 rules 由服务端按当前步骤路由命中。若是文件或目录，先读取后再执行；若是文字说明，直接作为约束遵守。',
    ].join('\n'));
  }
  if (capabilities.notes) {
    sections.push(`### 全局补充说明\n${capabilities.notes}`);
  }
  const selection = routedCapabilities.selection || {};
  if (selection.enabledIds && selection.enabledIds.length) {
    sections.push(`### 白皮书自动启用能力\n${selection.enabledIds.map((item) => `- ${item}`).join('\n')}`);
  }
  if (selection.missingIds && selection.missingIds.length) {
    sections.push(`### 白皮书推荐但未安装\n${selection.missingIds.map((item) => `- ${item}`).join('\n')}`);
  }
  const disabledItems = [...(disabled.skills || []), ...(disabled.rules || [])];
  const unavailableItems = disabledItems.filter((item) => item && item.availability === 'unavailable');
  const deferredItems = disabledItems.filter((item) => !item || item.availability !== 'unavailable');
  if (unavailableItems.length) {
    sections.push([
      '### 本机未挂载能力',
      ...unavailableItems.map((item) => `- ${capabilityDisplayName(item)}${item.fallback ? `；降级：${item.fallback}` : ''}`),
      '',
      '这些能力不是前置条件，不要读取或安装；按当前命令的内置步骤继续。',
    ].join('\n'));
  }
  if (deferredItems.length) {
    sections.push([
      '### 本步骤未启用能力',
      ...deferredItems.map((item) => `- ${capabilityDisplayName(item)}`),
      '',
      '未启用能力不要使用；如果你判断当前步骤确实需要其中某个能力，必须先说明原因并暂停等待人工确认。',
    ].join('\n'));
  }
  return sections.length ? sections.join('\n\n') : '- 当前步骤未命中能力库';
}

async function buildPrompt(workspacePathValue, stepId, taskId, configOverride = null, capabilities = { skills: [], rules: [], notes: '' }) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  const workflow = await readWorkflowDefinition(workspacePath);
  const definition = workflow.steps[stepId];
  if (!definition) {
    throw new Error(`未知步骤：${stepId}`);
  }
  if (stepId === '06-implement-task' && !/^T\d{3}$/i.test(String(taskId || '').trim())) {
    throw new Error('06 单任务实现必须先填写任务编号，例如 T001');
  }
  if (stepId === '06-implement-task') {
    await assertTaskAllowedForImplementation(workspacePath, taskId);
  }

  if (definition.kind === 'local') {
    return [
      `请在本地控制台完成步骤：${definition.title}`,
      '',
      definition.description || '',
      '',
      `Workspace: ${workspacePath || '未选择'}`,
    ].join('\n');
  }

  if (definition.kind === 'manual') {
    return [
      `当前需要人工确认：${definition.title}`,
      '',
      definition.description || '',
      '',
      `Workspace: ${workspacePath}`,
      '请将确认结果写回对应产物文件，不要只在对话中口头确认。',
    ].join('\n');
  }

  const normalizedTaskId = String(taskId || '').trim().toUpperCase();
  const taskLine = stepId === '06-implement-task'
    ? `\n用户确认的任务编号：${normalizedTaskId}\n`
    : '';
  const config = configOverride || await readWorkspaceConfig(workspacePath);
  const perspectiveRules = {
    backend: '后端视角：重点核对接口契约、权限与数据范围、批量/导入导出、事务、异步任务、数据库影响及回滚。',
    frontend: '前端视角：重点核对页面流程、交互状态、接口契约、兼容性、异常提示及可访问性。',
    qa: '测试视角：重点核对可验收场景、边界、回归范围、测试数据与可追溯证据。',
    ops: '运维视角：重点核对发布步骤、配置、观测、容量、回滚和依赖可用性。',
  };
  const perspectiveLine = perspectiveRules[config.perspective || 'backend'] || perspectiveRules.backend;
  const appPathLines = (config.appPaths || [])
    .filter((item) => item && item.path)
    .map((item) => `- ${item.name || path.basename(item.path)}: ${item.path}`)
    .join('\n');
  const knowledgeLines = (config.knowledge || [])
    .filter((item) => item && item.path)
    .map((item) => `- ${item.name || path.basename(item.path)}: ${item.path}${item.description ? `（${item.description}）` : ''}`)
    .join('\n');
  const domain = config.domainContext && config.domainContext.root
    ? config.domainContext
    : (config.domain || {});
  const domainLines = domain.root ? [
    `- 领域 Harness: ${domain.name || domain.id || path.basename(domain.root)}`,
    `- 本地目录: ${domain.root}`,
    domain.revision ? `- 知识库版本: ${domain.revision}` : '',
    domain.codeRepositories && domain.codeRepositories.length
      ? `- 候选代码入口: ${domain.codeRepositories.map((item) => item.name).join('、')}`
      : '',
    '- 先读 `context/domain-summary.md`，按其中最小路径读取领域资料与当前代码。',
    '- 结论优先级：PRD / 人工确认 > 当前代码 > 领域知识库；冲突必须记录并转人工确认。',
  ].filter(Boolean).join('\n') : '';
  return [
    `请进入 workspace 并执行阶段：${definition.title}`,
    '',
    `Workspace: ${workspacePath}`,
    `命令文件: ${definition.commandFile}`,
    taskLine.trim(),
    '',
    '执行要求：',
    '1. 先读取 AGENTS.md 和 CLAUDE.md。',
    `2. 严格按 ${definition.commandFile} 的允许读取、禁止事项和输出文件执行。`,
    '3. 不要跳过人工 checkpoint；遇到 Must Pause 条件立即停下。',
    '4. 阶段产物必须写入命令文件指定路径。',
    '5. 所有面向用户和写入 workspace 的内容必须使用中文；代码符号、路径、类名、方法名、协议字段保持原样。',
    '6. 输出保持简洁，只写当前阶段需要支撑下一步的信息；不要写泛泛兜底、无意义免责声明或重复总结。',
    '7. 证据不足时只记录具体缺失输入或阻塞问题，不要扩写成宽泛风险段落。',
    '8. Harness 内置边界不可被团队模板或用户补充说明覆盖：必须回写文件、必须维护进度、必须遵守人工确认点。',
    '9. 用户可补充的是 PRD、技术定位、人工确认和业务上下文；不要要求用户修改系统生成的 handoff 或 workflow 定义。',
    '',
    appPathLines ? `本地应用目录参考：\n${appPathLines}\n` : '',
    knowledgeLines ? `背景知识参考：\n${knowledgeLines}\n` : '',
    domainLines ? `领域 Harness 上下文：\n${domainLines}\n` : '',
    `当前交付视角：\n- ${perspectiveLine}\n`,
    config.branchPattern ? `分支命名规则：${config.branchPattern}\n` : '',
    '交付配置能力：',
    formatCapabilitiesForPrompt(capabilities),
    '',
    '命令文件内容：',
    '```md',
    await getCommandText(workspacePath, stepId),
    '```',
  ].filter(Boolean).join('\n');
}

async function readWorkspaceFile(workspacePathValue, relativePathValue) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  const relativePath = String(relativePathValue || '').replace(/\\/g, '/');
  const fullPath = path.join(workspacePath, relativePath);
  assertWithin(workspacePath, fullPath);
  if (!(await exists(fullPath))) {
    throw new Error(`文件不存在：${relativePath}`);
  }
  const stat = await fsp.stat(fullPath);
  if (!stat.isFile()) {
    throw new Error(`不是文件：${relativePath}`);
  }
  if (stat.size > 2 * 1024 * 1024) {
    throw new Error('文件过大，暂不支持预览');
  }
  return fsp.readFile(fullPath, 'utf8');
}

function assertEditableWorkspaceFile(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  const readOnlyFiles = new Set([
    '.workflow/workspace.json',
    '.workflow/progress.json',
    '.workflow/progress.md',
  ]);
  if (readOnlyFiles.has(normalized)) {
    throw new Error(`该文件由页面或流程状态维护，暂不支持直接编辑：${normalized}`);
  }
  const ext = path.extname(relativePath).toLowerCase();
  const allowed = new Set(['.md', '.txt', '.json', '.yml', '.yaml']);
  if (!allowed.has(ext)) {
    throw new Error(`暂不支持编辑该类型文件：${relativePath}`);
  }
}

async function clearCheckpointStateForReviewFile(workspacePath, relativePath) {
  const cleared = [];
  const workflow = await readWorkflowDefinition(workspacePath);
  for (const [stepId, definition] of Object.entries(workflow.steps)) {
    if (definition.kind !== 'manual') {
      continue;
    }
    const reviewFiles = definition.reviewFiles || [];
    const matches = reviewFiles.some((item) => (typeof item === 'string' ? item : item.path) === relativePath);
    if (!matches) {
      continue;
    }
    await unlinkWorkspaceFileIfExists(workspacePath, definition.approvalFile);
    await unlinkWorkspaceFileIfExists(workspacePath, definition.rejectionFile);
    cleared.push(stepId);
  }
  return cleared;
}

async function writeWorkspaceFile(body) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  const relativePath = String(body.path || '').replace(/\\/g, '/');
  const content = String(body.content ?? '');
  const fullPath = path.join(workspacePath, relativePath);
  assertWithin(workspacePath, fullPath);
  assertEditableWorkspaceFile(relativePath);
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) {
    throw new Error('文件内容过大，暂不支持保存');
  }
  await ensureDir(path.dirname(fullPath));
  await fsp.writeFile(fullPath, content, 'utf8');
  const clearedCheckpoints = await clearCheckpointStateForReviewFile(workspacePath, relativePath);
  return {
    path: relativePath,
    savedAt: nowIso(),
    clearedCheckpoints,
  };
}

async function readKnownFacts(workspacePathValue) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  const content = await readWorkspaceTextFileIfExists(workspacePath, KNOWN_FACTS_FILE);
  return {
    path: KNOWN_FACTS_FILE,
    exists: Boolean(content),
    content: content || KNOWN_FACTS_TEMPLATE,
  };
}

async function saveKnownFacts(body) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  const content = String(body.content ?? '');
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) {
    throw new Error('文件内容过大，暂不支持保存');
  }
  await writeWorkspaceTextFile(workspacePath, KNOWN_FACTS_FILE, content);
  return { path: KNOWN_FACTS_FILE, savedAt: nowIso() };
}

async function readTechnicalReview(workspacePathValue) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  const content = await readWorkspaceTextFileIfExists(workspacePath, TECHNICAL_REVIEW_FILE);
  return {
    path: TECHNICAL_REVIEW_FILE,
    exists: Boolean(content),
    content: content || TECHNICAL_REVIEW_TEMPLATE,
  };
}

async function saveTechnicalReview(body) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  const content = String(body.content ?? '');
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) {
    throw new Error('文件内容过大，暂不支持保存');
  }
  await writeWorkspaceTextFile(workspacePath, TECHNICAL_REVIEW_FILE, content);
  const clearedCheckpoints = await clearCheckpointStateForReviewFile(workspacePath, TECHNICAL_REVIEW_FILE);
  return { path: TECHNICAL_REVIEW_FILE, savedAt: nowIso(), clearedCheckpoints };
}

function getTaskField(block, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^- ${escaped}：\\s*([\\s\\S]*?)(?=\\n- [^\\n]+：|\\n## |$)`, 'm');
  const match = pattern.exec(block);
  return match ? match[1].trim().replace(/\n\s*/g, ' ') : '';
}

function parseTaskList(content) {
  const tasks = [];
  const pattern = /^#{2,3}\s+(T\d{3,})\s*[:：]?\s*(.*)$/gm;
  const matches = [...content.matchAll(pattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index;
    const next = matches[index + 1];
    const end = next ? next.index : content.length;
    const block = content.slice(start, end).trim();
    tasks.push({
      id: match[1].toUpperCase(),
      title: match[2].trim() || match[1].toUpperCase(),
      goal: getTaskField(block, '目标'),
      summary: getTaskField(block, '摘要') || getTaskField(block, '任务摘要'),
      apps: getTaskField(block, '涉及应用'),
      files: getTaskField(block, '涉及文件'),
      changes: getTaskField(block, '变更内容'),
      acceptance: getTaskField(block, '验收标准'),
      aiNeedsConfirmation: getTaskField(block, '是否需要人工确认'),
      aiConfirmationReason: getTaskField(block, '确认原因'),
      aiImplementable: getTaskField(block, '是否可由 AI 实施'),
      dependencies: getTaskField(block, '依赖任务'),
      recommendedSkills: getTaskField(block, '推荐 skills') || getTaskField(block, '推荐 skill') || getTaskField(block, '推荐能力'),
    });
  }
  return tasks;
}

function tableCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function allowedTaskIdsFromConfirmation(content) {
  const allowed = new Set();
  const text = String(content || '');
  const allowLine = /^-\s*本轮允许 AI 实施任务：\s*(.+)$/m.exec(text);
  if (allowLine) {
    for (const match of allowLine[1].matchAll(/\bT\d{3,}\b/gi)) {
      allowed.add(match[0].toUpperCase());
    }
  }
  const tableLines = text.split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
  for (const line of tableLines) {
    const cells = line.split('|').map((cell) => cell.trim());
    const taskId = cells.find((cell) => /^T\d{3,}$/i.test(cell));
    if (taskId && /允许\s*AI\s*实施|允许实施/i.test(line)) {
      allowed.add(taskId.toUpperCase());
    }
  }
  return [...allowed];
}

async function assertTaskAllowedForImplementation(workspacePath, taskId) {
  const normalizedTaskId = String(taskId || '').trim().toUpperCase();
  if (!normalizedTaskId) {
    throw new Error('06 单任务实现必须先指定任务编号，例如 T001');
  }
  const content = await readWorkspaceTextFileIfExists(workspacePath, TASK_CONFIRMATION_FILE);
  const allowed = allowedTaskIdsFromConfirmation(content);
  if (!allowed.includes(normalizedTaskId)) {
    throw new Error(`任务 ${normalizedTaskId} 尚未在 ${TASK_CONFIRMATION_FILE} 中明确允许 AI 实施`);
  }
}

function buildTaskConfirmationTemplate(taskListContent) {
  const tasks = parseTaskList(taskListContent);
  if (!tasks.length) {
    return TASK_CONFIRMATION_TEMPLATE;
  }
  const lines = [
    '# 任务确认结果',
    '',
    '## 执行口径',
    '',
    '- `tasks/task-list.md` 保存 AI 拆出的任务事实、涉及文件、验收标准和依赖关系。',
    '- `tasks/process/task-confirmation.md` 保存人工确认后的实施准入结论。',
    '- 后续单任务实现必须同时读取两个文件：先按本文件判断任务是否允许实施，再回到任务清单读取完整任务细节。',
    '- 如果两个文件结论冲突、任务编号缺失或允许范围不明确，AI 必须停止实施并等待人工确认。',
    '- 默认不允许全量执行。只有“人工确认结果”为“允许 AI 实施”的任务，才能进入 06 实现阶段。',
    '',
    '## 本轮确认结论',
    '',
    '- 任务清单整体结论：部分实施',
    '- 本轮允许 AI 实施任务：',
    '- 本轮暂缓任务：',
    '- 确认人：',
    '- 确认时间：',
    '',
    '## 任务确认明细',
    '',
    '| 任务 | 摘要 | AI 判断 | 依赖 | 人工确认结果 | 实施前提 | 备注 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const task of tasks) {
    lines.push(
      `| ${tableCell(task.id)} | ${tableCell(task.summary || task.goal || task.title || '')} | ${tableCell(`需确认：${task.aiNeedsConfirmation || '未填写'}；可实施：${task.aiImplementable || '未填写'}`)} | ${tableCell(task.dependencies || '无')} | 待人工确认 |  |  |`
    );
  }

  lines.push(
    '',
    '## 暂缓原因',
    '',
    '- ',
    '',
    '## 任务清单调整意见',
    '',
    '- ',
    ''
  );
  return lines.join('\n');
}

async function readTaskConfirmation(workspacePathValue) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  const content = await readWorkspaceTextFileIfExists(workspacePath, TASK_CONFIRMATION_FILE);
  if (content) {
    return {
      path: TASK_CONFIRMATION_FILE,
      exists: true,
      content,
    };
  }
  const taskListContent = await readWorkspaceTextFileIfExists(workspacePath, 'tasks/task-list.md');
  return {
    path: TASK_CONFIRMATION_FILE,
    exists: false,
    content: taskListContent ? buildTaskConfirmationTemplate(taskListContent) : TASK_CONFIRMATION_TEMPLATE,
  };
}

async function saveTaskConfirmation(body) {
  const workspacePath = normalizeUserPath(body.workspacePath);
  const content = String(body.content ?? '');
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
    throw new Error('当前目录不是有效 workspace');
  }
  if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) {
    throw new Error('文件内容过大，暂不支持保存');
  }
  await writeWorkspaceTextFile(workspacePath, TASK_CONFIRMATION_FILE, content);
  const clearedCheckpoints = await clearCheckpointStateForReviewFile(workspacePath, TASK_CONFIRMATION_FILE);
  return { path: TASK_CONFIRMATION_FILE, savedAt: nowIso(), clearedCheckpoints };
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  const relative = path.relative(PUBLIC_DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    sendError(res, 403, '禁止访问');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendError(res, 404, '页面不存在');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

async function route(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/definition') {
      const workspacePath = normalizeUserPath(url.searchParams.get('workspacePath'));
      const workflow = await readWorkflowDefinition(workspacePath);
      sendJson(res, 200, {
        units: workflow.units,
        steps: workflow.steps,
        workflow: {
          version: workflow.version,
          source: workflow.source,
          description: workflow.description,
        },
        workflowDir: WORKFLOW_DIR,
        defaultOutputRoot: DEFAULT_OUTPUT_ROOT,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      sendJson(res, 200, await readState());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/system/update-status') {
      sendJson(res, 200, await getPackageUpdateStatus(ROOT_DIR));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/system/update') {
      const body = await readJson(req);
      if (body.confirm !== true) throw new Error('更新客户端需要显式确认');
      sendJson(res, 200, await installPackageUpdate(ROOT_DIR));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/state') {
      sendJson(res, 200, await writeState(await readJson(req)));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/system/select-directory') {
      sendJson(res, 200, await selectLocalDirectory(await readJson(req)));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/system/select-file') {
      sendJson(res, 200, await selectLocalFile(await readJson(req)));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/system/git-identity') {
      const readConfig = async (key) => {
        try {
          return await gitOutput(['config', '--get', key], ROOT_DIR);
        } catch {
          return '';
        }
      };
      const [name, configuredId] = await Promise.all([
        readConfig('user.name'),
        readConfig('user.username'),
      ]);
      sendJson(res, 200, {
        name,
        id: configuredId || name,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/tools/config') {
      const tools = await readToolsConfig();
      const teamProfile = await readTeamProfileConfig(tools);
      sendJson(res, 200, {
        tools: redactToolsConfigForApi(tools),
        teamProfile: {
          available: teamProfile.available,
          reason: teamProfile.reason,
          root: teamProfile.root,
          profileName: teamProfile.profileName,
          profilePath: teamProfile.profilePath || '',
          appCount: Array.isArray(teamProfile.profile.apps) ? teamProfile.profile.apps.length : 0,
          skillCount: normalizeTextList(teamProfile.profile.skills).length,
          ruleCount: normalizeTextList(teamProfile.profile.rules).length,
        },
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/tools/config') {
      const body = await readJson(req);
      const currentTools = await readToolsConfig();
      const requestedTools = body.tools || body || {};
      const currentIntegrations = currentTools.integrations || {};
      const requestedIntegrations = requestedTools.integrations || {};
      const requestedHarnessClient = requestedIntegrations.harnessClient || null;
      const { authorized: _authorized, ...safeRequestedHarnessClient } = requestedHarnessClient || {};
      const tools = await saveToolsConfig({
        ...body,
        tools: {
          ...currentTools,
          ...requestedTools,
          integrations: {
            ...currentIntegrations,
            ...requestedIntegrations,
            ...(requestedHarnessClient ? {
              harnessClient: {
                ...(currentIntegrations.harnessClient || {}),
                ...safeRequestedHarnessClient,
              },
            } : {}),
          },
        },
      });
      const teamProfile = await readTeamProfileConfig(tools);
      sendJson(res, 200, {
        tools: redactToolsConfigForApi(tools),
        teamProfile: {
          available: teamProfile.available,
          reason: teamProfile.reason,
          root: teamProfile.root,
          profileName: teamProfile.profileName,
          profilePath: teamProfile.profilePath || '',
          appCount: Array.isArray(teamProfile.profile.apps) ? teamProfile.profile.apps.length : 0,
          skillCount: normalizeTextList(teamProfile.profile.skills).length,
          ruleCount: normalizeTextList(teamProfile.profile.rules).length,
        },
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/integration/feishu/authorize-cli') {
      sendJson(res, 200, await authorizeFeishuCli(await readJson(req)));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/apps/available') {
      const tools = await readToolsConfig();
      sendJson(res, 200, { apps: await listAvailableApps(tools) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/whitepaper/catalog') {
      const tools = await readToolsConfig();
      const catalog = await readWhitepaperCatalog(whitepaperRootForTools(tools));
      sendJson(res, 200, {
        ...catalog,
        functions: matchFunctions(catalog, url.searchParams.get('query') || ''),
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/workspaces') {
      sendJson(res, 200, { workspaces: await listWorkspaces(url.searchParams.get('outputRoot')) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspaces/init') {
      const body = await readJson(req);
      const domainSources = normalizeDomainSources(body.domainRoots || body.domainSources || body.domainRoot || body.domain);
      if (!domainSources.length) throw new Error('创建需求必须绑定至少一个领域 Harness');
      for (const source of domainSources.filter((item) => !isGitRemote(item))) {
        const domain = await inspectDomainHarness(source);
        if (!domain.available) throw new Error(domain.reason || '领域 Harness 不可用');
      }
      const demand = validateDemand(body.demand);
      const workspacePath = await initWorkspace(body.demandName, body.outputRoot, body.workspacePath, demand);
      await writeWorkspaceConfig(workspacePath, { perspective: body.perspective || 'backend' });
      const domains = await materializeDomainSources(workspacePath, domainSources);
      let attached = null;
      for (const [index, domain] of domains.entries()) {
        attached = await attachDomainHarness({ workspacePath, domainRoot: domain.root, primary: index === 0, source: domain.source });
      }
      const capabilities = await refreshWorkspaceCapabilities(workspacePath);
      sendJson(res, 200, { workspacePath, domain: attached.context, domains, capabilities });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/domain-harness/inspect') {
      sendJson(res, 200, await inspectDomainHarness(url.searchParams.get('root') || ''));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/workspace/status') {
      sendJson(res, 200, await getWorkspaceStatus(url.searchParams.get('workspacePath')));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/whitepaper-context') {
      sendJson(res, 200, await resolveWhitepaperWorkspaceContext(await readJson(req)));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/domain-context') {
      const body = await readJson(req);
      const attached = await attachDomainHarness(body);
      const capabilities = await refreshWorkspaceCapabilities(body.workspacePath);
      sendJson(res, 200, { ...attached, capabilities });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/capabilities/refresh') {
      const body = await readJson(req);
      sendJson(res, 200, await refreshWorkspaceCapabilities(body.workspacePath));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/app-source/fetch') {
      sendJson(res, 200, await fetchWhitepaperApplicationSource(await readJson(req)));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/quality-summary/refresh') {
      const body = await readJson(req);
      sendJson(res, 200, await refreshQualitySummary(body.workspacePath));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/design-baselines/verify') {
      const body = await readJson(req);
      sendJson(res, 200, await verifyDesignBaselines(normalizeUserPath(body.workspacePath)));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/delivery-report/complete') {
      const body = await readJson(req);
      const result = await completeDeliveryReport(body.workspacePath);
      result.submission = await submitDeliveryReport(body.workspacePath);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/delivery-report/submit') {
      const body = await readJson(req);
      sendJson(res, 200, await submitDeliveryReport(body.workspacePath));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/harness-client/status') {
      sendJson(res, 200, await getHarnessClientStatus());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/harness-client/configure') {
      const body = await readJson(req);
      const serverUrl = String(body.serverUrl || '').trim().replace(/\/+$/, '');
      let parsed;
      try {
        parsed = new URL(serverUrl);
      } catch {
        throw new Error('Harness Server 地址必须是有效的 HTTP 或 HTTPS 地址。');
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Harness Server 地址必须是有效的 HTTP 或 HTTPS 地址。');
      }
      const authorizeUrl = String(body.authorizeUrl || `${parsed.origin}/#/harness/authorize`).trim();
      const currentTools = await readToolsConfig();
      const currentClient = (currentTools.integrations || {}).harnessClient || {};
      await saveToolsConfig({
        tools: {
          ...currentTools,
          integrations: {
            ...(currentTools.integrations || {}),
            harnessClient: {
              ...currentClient,
              enabled: true,
              authMode: 'browser-pkce',
              serverUrl,
              authorizeUrl,
              clientId: String(body.clientId || currentClient.clientId || 'delivery-workflow-desktop').trim() || 'delivery-workflow-desktop',
            },
          },
        },
      });
      sendJson(res, 200, await getHarnessClientStatus());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/harness-client/login') {
      const pending = await startHarnessAuthorization();
      sendJson(res, 200, { status: 'pending', authorizationUrl: pending.authorizationUrl });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/harness-client/logout') {
      sendJson(res, 200, await logoutHarnessClient());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/gates/check') {
      const body = await readJson(req);
      sendJson(res, 200, await evaluateQualityGates(body.workspacePath));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/gates/approve') {
      const body = await readJson(req);
      sendJson(res, 200, await submitQualityGate({ ...body, action: 'approve' }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/gates/reject') {
      const body = await readJson(req);
      sendJson(res, 200, await submitQualityGate({ ...body, action: 'reject' }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/gates/exception') {
      const body = await readJson(req);
      sendJson(res, 200, await submitQualityGate({ ...body, action: 'exception' }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/knowledge-update-proposal') {
      const body = await readJson(req);
      sendJson(res, 200, await createKnowledgeUpdateProposal(body.workspacePath));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/config') {
      const body = await readJson(req);
      const workspacePath = normalizeUserPath(body.workspacePath);
      const nextConfig = {};
      if (Object.prototype.hasOwnProperty.call(body, 'feishuDocs')) {
        nextConfig.feishuDocs = Array.isArray(body.feishuDocs) ? body.feishuDocs : [];
      }
      if (Object.prototype.hasOwnProperty.call(body, 'appPaths')) {
        nextConfig.appPaths = Array.isArray(body.appPaths) ? body.appPaths : [];
      }
      if (Object.prototype.hasOwnProperty.call(body, 'demand')) {
        nextConfig.demand = validateDemand(body.demand, { requireStartedAt: true });
      }
      if (Object.prototype.hasOwnProperty.call(body, 'apps')) {
        nextConfig.apps = Array.isArray(body.apps) ? body.apps : [];
      }
      if (Object.prototype.hasOwnProperty.call(body, 'knowledge')) {
        nextConfig.knowledge = Array.isArray(body.knowledge) ? body.knowledge : [];
      }
      if (Object.prototype.hasOwnProperty.call(body, 'skills')) {
        nextConfig.skills = Array.isArray(body.skills) ? body.skills : [];
      }
      if (Object.prototype.hasOwnProperty.call(body, 'rules')) {
        nextConfig.rules = Array.isArray(body.rules) ? body.rules : [];
      }
      if (Object.prototype.hasOwnProperty.call(body, 'branchPattern')) {
        nextConfig.branchPattern = body.branchPattern || '';
      }
      if (Object.prototype.hasOwnProperty.call(body, 'perspective')) {
        nextConfig.perspective = body.perspective || 'backend';
      }
      if (Object.prototype.hasOwnProperty.call(body, 'loadAppContextForClarification')) {
        nextConfig.loadAppContextForClarification = Boolean(body.loadAppContextForClarification);
      }
      if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
        nextConfig.notes = body.notes || '';
      }
      if (Object.prototype.hasOwnProperty.call(body, 'profile')) {
        nextConfig.profile = body.profile && typeof body.profile === 'object' ? body.profile : {};
      }
      if (Object.prototype.hasOwnProperty.call(body, 'functionPoint')) {
        nextConfig.functionPoint = body.functionPoint && typeof body.functionPoint === 'object' ? body.functionPoint : {};
      }
      if (Object.prototype.hasOwnProperty.call(body, 'whitepaperContext')) {
        nextConfig.whitepaperContext = body.whitepaperContext && typeof body.whitepaperContext === 'object' ? body.whitepaperContext : {};
      }
      const config = await writeWorkspaceConfig(workspacePath, nextConfig);
      sendJson(res, 200, { config });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/workspace/known-facts') {
      sendJson(res, 200, await readKnownFacts(url.searchParams.get('workspacePath')));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/known-facts') {
      sendJson(res, 200, await saveKnownFacts(await readJson(req)));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/workspace/technical-review') {
      sendJson(res, 200, await readTechnicalReview(url.searchParams.get('workspacePath')));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/technical-review') {
      sendJson(res, 200, await saveTechnicalReview(await readJson(req)));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/workspace/task-confirmation') {
      sendJson(res, 200, await readTaskConfirmation(url.searchParams.get('workspacePath')));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/task-confirmation') {
      sendJson(res, 200, await saveTaskConfirmation(await readJson(req)));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/import-local-prd') {
      const body = await readJson(req);
      const result = await importLocalPaths(body.workspacePath, body.sourcePaths, body.targetSubdir);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/import-feishu-prd') {
      sendJson(res, 200, await importFeishuPrd(await readJson(req)));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/upload-prd') {
      const imported = await importUploadedFiles(req);
      sendJson(res, 200, { imported });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/prompt') {
      const workspacePath = normalizeUserPath(url.searchParams.get('workspacePath'));
      const tools = await readToolsConfig();
      const stepId = url.searchParams.get('stepId');
      const config = workspacePath && await exists(path.join(workspacePath, 'AGENTS.md'))
        ? await readWorkspaceConfig(workspacePath)
        : null;
      const capabilities = config
        ? await linkConfiguredCapabilities(workspacePath, tools, config)
        : {
          skills: normalizeTextList(tools.globalSkills),
          rules: normalizeTextList(tools.globalRules),
          notes: [
            tools.teamName ? `团队：${tools.teamName}` : '',
            normalizeTextList(tools.templates).length ? `团队模板：\n${normalizeTextList(tools.templates).map((item) => `- ${item}`).join('\n')}` : '',
            tools.globalNotes || '',
          ].filter(Boolean).join('\n'),
        };
      const workflow = await readWorkflowDefinition(workspacePath);
      const routedCapabilities = await routeCapabilitiesForStep(workspacePath, stepId, capabilities, workflow);
      const promptConfig = config && shouldExposeAppContextForStep(stepId, config)
        ? config
        : config
          ? { ...config, appPaths: [], apps: [] }
          : null;
      const prompt = await buildPrompt(workspacePath, stepId, url.searchParams.get('taskId'), promptConfig, routedCapabilities);
      sendJson(res, 200, { prompt });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/command-template') {
      sendJson(res, 200, await readCommandTemplate(url.searchParams.get('workspacePath'), url.searchParams.get('stepId')));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/command-template/reset') {
      sendJson(res, 200, await resetCommandTemplate(await readJson(req)));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/file') {
      const content = await readWorkspaceFile(url.searchParams.get('workspacePath'), url.searchParams.get('path'));
      sendJson(res, 200, { content });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/file/save') {
      const data = await writeWorkspaceFile(await readJson(req));
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/checkpoint/approve') {
      const data = await submitCheckpoint(await readJson(req), 'approve');
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/checkpoint/reject') {
      const data = await submitCheckpoint(await readJson(req), 'reject');
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/runs/start') {
      const data = await startAgentRun(await readJson(req));
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/ai-adjust/start') {
      const data = await startAiAdjustmentRun(await readJson(req));
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/ai-adjust/diff') {
      const data = await readWorkspaceDiff(await readJson(req));
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/ide/open-app') {
      const data = await openAppInIdea(await readJson(req));
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/open-folder') {
      const data = await openWorkspaceFolder(await readJson(req));
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/open-path') {
      const data = await openWorkspacePath(await readJson(req));
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/open-domain-folder') {
      const data = await openConfiguredFolder(await readJson(req), 'domain');
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/open-app-folder') {
      const data = await openConfiguredFolder(await readJson(req), 'app');
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/agent/prompt') {
      const prompt = await buildAgentCollaborationPrompt(
        url.searchParams.get('workspacePath'),
        url.searchParams.get('stepId'),
        url.searchParams.get('taskId'),
        url.searchParams.get('agent'),
        { port: url.searchParams.get('port') }
      );
      sendJson(res, 200, { prompt });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/handoff') {
      const data = await prepareAgentHandoff(await readJson(req));
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/open-cli') {
      const data = await openAgentCli(await readJson(req));
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/runs/get') {
      const data = await readRun(url.searchParams.get('workspacePath'), url.searchParams.get('runId'));
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/runs/list') {
      const runs = await listRuns(url.searchParams.get('workspacePath'));
      sendJson(res, 200, { runs });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/runs/log') {
      const workspacePath = normalizeUserPath(url.searchParams.get('workspacePath'));
      const runId = String(url.searchParams.get('runId') || '').replace(/[^a-zA-Z0-9._-]/g, '');
      const runsDir = path.join(workspacePath, '.workflow', RUNS_DIR_NAME);
      const runFile = path.join(runsDir, `${runId}.json`);
      const logFile = path.join(runsDir, `${runId}.log`);
      assertWithin(workspacePath, runFile);
      assertWithin(workspacePath, logFile);
      if (!(await exists(runFile))) {
        throw new Error(`运行记录不存在：${runId}`);
      }
      const meta = JSON.parse(await fsp.readFile(runFile, 'utf8'));
      const log = await readLogPreview(logFile);
      sendJson(res, 200, { meta, log });
      return;
    }

    if (req.method === 'GET') {
      serveStatic(req, res, url.pathname);
      return;
    }

    sendError(res, 405, '不支持的请求方法');
  } catch (error) {
    sendError(res, 500, error.message);
  }
}

function createAppServer() {
  return http.createServer(route);
}

function startServer(options = {}) {
  const port = options.port !== undefined ? Number(options.port) : Number(process.env.PORT || PORT);
  const host = options.host || process.env.HOST || '127.0.0.1';
  const server = createAppServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      const actualPort = address && typeof address === 'object' ? address.port : port;
      activePort = actualPort;
      const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actualPort}`;
      console.log(`Delivery workflow console listening on ${url}`);
      resolve({ server, url, port: actualPort, host });
    });
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  createAppServer,
  startServer,
  readState,
  writeState,
  readToolsConfig,
  saveToolsConfig,
  readTeamProfileConfig,
  initWorkspace,
  getWorkspaceStatus,
  importFeishuPrd,
  prepareAgentHandoff,
  completeAgentHandoff,
  async matchWhitepaperFunctions(query) {
    const tools = await readToolsConfig();
    const catalog = await readWhitepaperCatalog(whitepaperRootForTools(tools));
    return {
      catalog,
      functions: matchFunctions(catalog, query || ''),
    };
  },
  resolveWhitepaperWorkspaceContext,
  inspectDomainHarness,
  attachDomainHarness,
  materializeDomainSources,
  refreshWorkspaceCapabilities,
  fetchWhitepaperApplicationSource,
  refreshQualitySummary,
  completeDeliveryReport,
  submitDeliveryReport,
  startHarnessAuthorization,
  authorizeHarnessClient,
  getHarnessClientStatus,
  logoutHarnessClient,
  evaluateQualityGates,
  submitQualityGate,
  createKnowledgeUpdateProposal,
};
