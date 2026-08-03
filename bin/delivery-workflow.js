#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

function defaultDataDir() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'delivery-workflow');
  }
  return path.join(os.homedir(), '.delivery-workflow');
}

process.env.DELIVERY_WORKFLOW_DATA_DIR = process.env.DELIVERY_WORKFLOW_DATA_DIR || defaultDataDir();

const {
  startServer,
  readToolsConfig,
  saveToolsConfig,
  readTeamProfileConfig,
  initWorkspace,
  getWorkspaceStatus,
  prepareAgentHandoff,
  completeAgentHandoff,
  matchWhitepaperFunctions,
  resolveWhitepaperWorkspaceContext,
  inspectDomainHarness,
  attachDomainHarness,
  fetchWhitepaperApplicationSource,
  refreshQualitySummary,
  evaluateQualityGates,
  submitQualityGate,
  createKnowledgeUpdateProposal,
} = require(path.join(
  ROOT_DIR,
  'console',
  'server.js'
));

const DEFAULT_PORT = 3040;

function usage() {
  return [
    'Delivery Workflow',
    '',
    'Usage:',
    '  delivery-workflow start [--port 3040] [--no-open] [--foreground]',
    '  dw start [--port 3040] [--no-open] [--foreground]',
    '  dw stop',
    '  dw restart [--port 3040] [--no-open]',
    '  dw status',
    '  dw logs [--lines 80]',
    '  dw init <demand-name> --domain <domain-harness-path> [--output-root <path>]',
    '  dw prd import <file-or-directory> --workspace <path>',
    '  dw domain inspect --root <domain-harness-path>',
    '  dw domain attach --workspace <path> --root <domain-harness-path>',
    '  dw gate check --workspace <path>',
    '  dw gate approve|reject|exception <gate-id> --workspace <path> [--note "..."]',
    '  dw status --workspace <path>',
    '  dw next --workspace <path>',
    '',
    'Examples:',
    '  npx delivery-workflow-harness start',
    '  dw start',
    '  dw stop',
    '  dw init negative-bill-export --domain F:\\code\\harness-project\\spm-harness-module-negative',
    '',
    'The full command name "delivery-workflow" is also supported.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    if (key === 'no-open' || key === 'help' || key === 'daemon' || key === 'foreground') {
      args[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

function openUrl(url) {
  const command = process.platform === 'win32'
    ? 'cmd'
    : process.platform === 'darwin'
      ? 'open'
      : 'xdg-open';
  const args = process.platform === 'win32'
    ? ['/c', 'start', '', url]
    : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function dataFile(name) {
  return path.join(process.env.DELIVERY_WORKFLOW_DATA_DIR, name);
}

function ensureDataDir() {
  fs.mkdirSync(process.env.DELIVERY_WORKFLOW_DATA_DIR, { recursive: true });
}

function serverPidFile() {
  return dataFile('server.pid');
}

function serverInfoFile() {
  return dataFile('server.json');
}

function serverOutLogFile() {
  return dataFile('server.out.log');
}

function serverErrLogFile() {
  return dataFile('server.err.log');
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readPid() {
  try {
    const value = Number(String(fs.readFileSync(serverPidFile(), 'utf8')).trim());
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function isProcessAlive(pid) {
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

function cleanupServerFiles() {
  for (const filePath of [serverPidFile(), serverInfoFile()]) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore stale metadata cleanup failures.
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpStatus(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode || 0);
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolve(0);
    });
    request.on('error', () => resolve(0));
  });
}

async function waitForServer(url, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    const status = await httpStatus(url);
    if (status >= 200 && status < 500) {
      return true;
    }
    await wait(250);
  }
  return false;
}

function pathExists(targetPath) {
  if (!targetPath) {
    return false;
  }
  try {
    fs.accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeCliPath(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }
  return path.resolve(value);
}

function findWorkspaceRoot(startDir) {
  let current = path.resolve(startDir || process.cwd());
  while (true) {
    if (pathExists(path.join(current, 'AGENTS.md')) && pathExists(path.join(current, '.workflow'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return '';
    }
    current = parent;
  }
}

function resolveWorkspaceArg(args) {
  return normalizeCliPath(args.workspace || args.workspacePath) || findWorkspaceRoot(process.cwd());
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function printNextRecommendation(recommendation) {
  if (!recommendation) {
    console.log('No next-step recommendation.');
    return;
  }
  console.log(`${recommendation.status || 'ready'}: ${recommendation.title || recommendation.stepId || 'next step'}`);
  if (recommendation.summary) {
    console.log(recommendation.summary);
  }
  if (recommendation.stepId) {
    console.log(`step: ${recommendation.stepId}`);
  }
  if (recommendation.unitId) {
    console.log(`unit: ${recommendation.unitId}`);
  }
  for (const blocker of recommendation.blockers || []) {
    console.log(`blocker: ${blocker}`);
  }
}

async function startWithPortFallback(port) {
  const maxAttempts = 20;
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = port + offset;
    try {
      return await startServer({ port: candidate });
    } catch (error) {
      if (error && error.code === 'EADDRINUSE') {
        continue;
      }
      throw error;
    }
  }
  throw new Error(`No available port found from ${port} to ${port + maxAttempts - 1}`);
}

async function commandStart(args) {
  const port = Number(args.port || DEFAULT_PORT);
  if (!args.foreground) {
    await commandStartDaemon(args, port);
    return;
  }
  const result = await startWithPortFallback(port);
  if (!args['no-open']) {
    openUrl(result.url);
  }
  console.log('');
  console.log(`Console: ${result.url}`);
  console.log('Press Ctrl+C to stop.');
}

async function commandStartDaemon(args, port) {
  ensureDataDir();
  const existingPid = readPid();
  const existingInfo = readJsonIfExists(serverInfoFile()) || {};
  const url = `http://127.0.0.1:${port}/`;
  if (existingPid && isProcessAlive(existingPid)) {
    const existingUrl = existingInfo.url || url;
    if (!args['no-open']) {
      openUrl(existingUrl);
    }
    console.log(`Delivery Workflow already running: ${existingUrl}`);
    console.log(`pid: ${existingPid}`);
    return;
  }
  if (await httpStatus(url)) {
    if (!args['no-open']) {
      openUrl(url);
    }
    console.log(`Delivery Workflow already responding: ${url}`);
    console.log('pid: unknown (started outside daemon manager)');
    return;
  }
  cleanupServerFiles();
  const out = fs.openSync(serverOutLogFile(), 'a');
  const err = fs.openSync(serverErrLogFile(), 'a');
  const childArgs = [
    __filename,
    'start',
    '--foreground',
    '--port',
    String(port),
    '--no-open',
  ];
  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: ['ignore', out, err],
    windowsHide: true,
    env: {
      ...process.env,
      DELIVERY_WORKFLOW_DATA_DIR: process.env.DELIVERY_WORKFLOW_DATA_DIR,
    },
  });
  child.unref();
  fs.writeFileSync(serverPidFile(), `${child.pid}\n`, 'utf8');
  fs.writeFileSync(serverInfoFile(), `${JSON.stringify({
    pid: child.pid,
    port,
    url,
    startedAt: new Date().toISOString(),
    outLog: serverOutLogFile(),
    errLog: serverErrLogFile(),
  }, null, 2)}\n`, 'utf8');
  const ready = await waitForServer(url);
  if (!ready) {
    console.log('Delivery Workflow daemon started, but health check did not respond yet.');
    console.log(`pid: ${child.pid}`);
    console.log(`logs: ${serverOutLogFile()}`);
    return;
  }
  if (!args['no-open']) {
    openUrl(url);
  }
  console.log(`Delivery Workflow running: ${url}`);
  console.log(`pid: ${child.pid}`);
  console.log('Use `dw stop` to stop it.');
}

async function commandStop() {
  const pid = readPid();
  if (!pid) {
    cleanupServerFiles();
    console.log('Delivery Workflow is not running.');
    return;
  }
  if (!isProcessAlive(pid)) {
    cleanupServerFiles();
    console.log('Delivery Workflow was not running. Stale pid cleaned.');
    return;
  }
  try {
    process.kill(pid);
  } catch (error) {
    throw new Error(`Failed to stop pid ${pid}: ${error.message}`);
  }
  for (let index = 0; index < 20; index += 1) {
    if (!isProcessAlive(pid)) {
      break;
    }
    await wait(150);
  }
  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Best effort; Windows may already have ended it.
    }
  }
  cleanupServerFiles();
  console.log('Delivery Workflow stopped.');
}

async function commandRestart(args) {
  await commandStop();
  await commandStartDaemon(args, Number(args.port || DEFAULT_PORT));
}

async function commandServerStatus(args = {}) {
  const pid = readPid();
  const info = readJsonIfExists(serverInfoFile()) || {};
  const url = args.url || info.url || `http://127.0.0.1:${info.port || args.port || DEFAULT_PORT}/`;
  const alive = isProcessAlive(pid);
  const status = await httpStatus(url);
  console.log(`server: ${status ? 'running' : 'stopped'}`);
  console.log(`pid: ${pid || (status ? 'unknown' : '(none)')}`);
  console.log(`url: ${url}`);
  console.log(`http: ${status || '(no response)'}`);
  console.log(`data: ${process.env.DELIVERY_WORKFLOW_DATA_DIR}`);
  console.log(`logs: ${serverOutLogFile()}`);
}

function tailFile(filePath, lineCount) {
  if (!pathExists(filePath)) {
    return '';
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).slice(-lineCount).join('\n');
}

async function commandLogs(args) {
  const lines = Number(args.lines || 80);
  console.log(`== ${serverOutLogFile()} ==`);
  console.log(tailFile(serverOutLogFile(), lines) || '(empty)');
  const errText = tailFile(serverErrLogFile(), lines);
  if (errText) {
    console.log('');
    console.log(`== ${serverErrLogFile()} ==`);
    console.log(errText);
  }
}

async function commandOpen(args) {
  const port = Number(args.port || DEFAULT_PORT);
  const baseUrl = args.url || `http://127.0.0.1:${port}/`;
  const url = new URL(baseUrl);
  const workspacePath = args.workspace || args.workspacePath;
  const stepId = args.step || args.stepId;
  if (workspacePath) {
    url.searchParams.set('workspace', path.resolve(workspacePath));
  }
  if (stepId) {
    url.searchParams.set('step', stepId);
  }
  openUrl(url.toString());
  console.log(`Opened: ${url.toString()}`);
}

async function commandInit(args) {
  const demandName = args._[1] || args.name;
  if (!demandName) {
    throw new Error('Missing demand name. Usage: dw init <demand-name>');
  }
  const outputRoot = normalizeCliPath(args['output-root'] || args.outputRoot || path.resolve(process.cwd(), '..', 'ai-workspaces'));
  const domainRoot = normalizeCliPath(args.domain || args.domainRoot);
  if (!domainRoot) {
    throw new Error('Missing domain harness. Usage: dw init <demand-name> --domain <domain-harness-path>');
  }
  const inspected = await inspectDomainHarness(domainRoot);
  if (!inspected.available) {
    throw new Error(inspected.reason || '领域 Harness 不可用');
  }
  const workspacePath = await initWorkspace(demandName, outputRoot);
  const result = await attachDomainHarness({ workspacePath, domainRoot });
  console.log(`Domain Harness attached: ${result.context.root}`);
  console.log(`Domain snapshot: ${path.join(workspacePath, 'context', 'domain-summary.md')}`);
  console.log(`Workspace created: ${workspacePath}`);
  console.log(`Open: dw open --workspace ${workspacePath}`);
}

async function commandSetup(args) {
  const current = await readToolsConfig();
  const next = await saveToolsConfig({
    tools: {
      ...current,
      codexDesktopPath: current.codexDesktopPath,
      teamConfigRoot: normalizeCliPath(args['team-config-root'] || args.teamConfigRoot) || current.teamConfigRoot,
      whitepaperRoot: normalizeCliPath(args['whitepaper-root'] || args.whitepaperRoot) || current.whitepaperRoot,
      repoRoot: normalizeCliPath(args['repo-root'] || args.repoRoot) || current.repoRoot,
      teamProfile: args.profile || args.teamProfile || current.teamProfile || 'default',
    },
  });
  console.log('Local config saved.');
  console.log(`teamConfigRoot: ${next.teamConfigRoot || '(not set)'}`);
  console.log(`whitepaperRoot: ${next.whitepaperRoot || '(not set)'}`);
  console.log(`repoRoot: ${next.repoRoot || '(not set)'}`);
  console.log(`teamProfile: ${next.teamProfile || 'default'}`);
}

async function commandConfig(args) {
  const action = args._[1] || 'show';
  if (action === 'show' || action === 'get') {
    const current = await readToolsConfig();
    console.log(JSON.stringify({
      teamConfigRoot: current.teamConfigRoot || '',
      whitepaperRoot: current.whitepaperRoot || '',
      repoRoot: current.repoRoot || '',
      teamProfile: current.teamProfile || 'default',
      codexPath: current.codexPath || '',
      codexDesktopPath: current.codexDesktopPath || '',
      claudePath: current.claudePath || '',
      ideaPath: current.ideaPath || '',
      defaultSkillsRoot: current.defaultSkillsRoot || '',
    }, null, 2));
    return;
  }
  if (action === 'set') {
    await commandSetup(args);
    return;
  }
  throw new Error('Usage: dw config [show|set] [--team-config-root <path>] [--whitepaper-root <path>] [--repo-root <path>] [--profile default]');
}

async function commandFunction(args) {
  const action = args._[1] || 'match';
  if (action !== 'match') {
    throw new Error('Usage: dw function match <keyword>');
  }
  const query = args._.slice(2).join(' ') || args.query || '';
  const result = await matchWhitepaperFunctions(query);
  if (!result.catalog.available) {
    throw new Error(result.catalog.reason || 'Whitepaper catalog is not available.');
  }
  if (!result.functions.length) {
    console.log('No function points matched.');
    return;
  }
  for (const item of result.functions) {
    console.log(`${item.id}\t${item.name}\t${item.domain || ''}`);
  }
}

async function commandContext(args) {
  const action = args._[1] || 'resolve';
  if (action !== 'resolve') {
    throw new Error('Usage: dw context resolve --workspace <path> --function <function-id>');
  }
  const workspacePath = resolveWorkspaceArg(args);
  const functionId = args.function || args.functionId;
  if (!workspacePath || !functionId) {
    throw new Error('Missing workspace or function id. Usage: dw context resolve --workspace <path> --function <function-id>');
  }
  const result = await resolveWhitepaperWorkspaceContext({
    workspacePath,
    primaryFunctionId: functionId,
    relatedFunctionIds: splitList(args.related || args.relatedFunctionIds),
  });
  console.log(`function: ${result.context.primaryFunction.id}`);
  console.log(`whitepaper: ${result.context.whitepaperRefs.join(', ') || '(none)'}`);
  console.log(`snapshot: ${path.join(workspacePath, 'context', 'whitepaper-context.md')}`);
  console.log(`lock: ${path.join(workspacePath, '.workflow', 'whitepaper.lock.json')}`);
}

async function commandDomain(args) {
  const action = args._[1] || 'inspect';
  const domainRoot = normalizeCliPath(args.root || args.domain || args.domainRoot);
  if (!domainRoot) {
    throw new Error('Missing domain harness path. Usage: dw domain inspect --root <domain-harness-path>');
  }
  if (action === 'inspect') {
    const result = await inspectDomainHarness(domainRoot);
    console.log(JSON.stringify(result, null, 2));
    if (!result.available) {
      process.exitCode = 1;
    }
    return;
  }
  if (action === 'attach') {
    const workspacePath = resolveWorkspaceArg(args);
    if (!workspacePath) {
      throw new Error('Missing workspace. Usage: dw domain attach --workspace <path> --root <domain-harness-path>');
    }
    const result = await attachDomainHarness({ workspacePath, domainRoot });
    console.log(`Domain Harness attached: ${result.context.root}`);
    console.log(`Domain snapshot: ${path.join(workspacePath, 'context', 'domain-summary.md')}`);
    console.log(`Domain lock: ${path.join(workspacePath, '.workflow', 'domain.lock.json')}`);
    return;
  }
  throw new Error('Usage: dw domain [inspect|attach] --root <domain-harness-path> [--workspace <path>]');
}

async function copyPrdSource(sourcePath, targetPath) {
  const stat = await fsp.stat(sourcePath);
  if (stat.isDirectory()) {
    await fsp.mkdir(targetPath, { recursive: true });
    const entries = await fsp.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      await copyPrdSource(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    }
    return;
  }
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.copyFile(sourcePath, targetPath);
}

async function commandPrd(args) {
  const action = args._[1] || 'import';
  if (action !== 'import') {
    throw new Error('Usage: dw prd import <file-or-directory> --workspace <path>');
  }
  const sourceValue = args._[2] || args.source || args.path;
  const workspacePath = resolveWorkspaceArg(args);
  if (!sourceValue || !workspacePath) {
    throw new Error('Usage: dw prd import <file-or-directory> --workspace <path>');
  }
  if (!pathExists(path.join(workspacePath, 'AGENTS.md'))) {
    throw new Error('当前目录不是有效 Workspace');
  }
  const sourcePath = normalizeCliPath(sourceValue);
  if (!pathExists(sourcePath)) {
    throw new Error(`PRD 来源不存在：${sourcePath}`);
  }
  const targetPath = path.join(workspacePath, 'prd', path.basename(sourcePath));
  await copyPrdSource(sourcePath, targetPath);
  console.log(`prd: ${targetPath}`);
  console.log(`next: dw gate check --workspace "${workspacePath}"`);
}

async function commandGate(args) {
  const action = args._[1] || 'check';
  const workspacePath = resolveWorkspaceArg(args);
  if (!workspacePath) {
    throw new Error('Missing workspace. Usage: dw gate check --workspace <path>');
  }
  if (action === 'check') {
    const result = await evaluateQualityGates(workspacePath);
    console.log(`gates: ${result.status}`);
    for (const gate of Object.values(result.gates || {})) {
      console.log(`${gate.id}\t${gate.status}\t${gate.missing.length ? `缺少：${gate.missing.join('、')}` : '证据齐备'}`);
    }
    return;
  }
  if (!['approve', 'reject', 'exception'].includes(action)) {
    throw new Error('Usage: dw gate check|approve|reject|exception <gate-id> --workspace <path>');
  }
  const gateId = args._[2] || args.gate || args.gateId;
  if (!gateId) {
    throw new Error(`Missing gate id. Usage: dw gate ${action} <gate-id> --workspace <path>`);
  }
  const result = await submitQualityGate({
    workspacePath,
    gateId,
    action,
    note: args.note,
    operator: args.operator,
    exceptionExpiresAt: args['expires-at'] || args.expiresAt,
  });
  const gate = result.gates[gateId];
  console.log(`gate: ${gate.id} / ${gate.status}`);
  console.log(`snapshot: ${path.join(workspacePath, '.workflow', 'gates.json')}`);
}

async function commandApp(args) {
  const action = args._[1] || 'fetch';
  if (action !== 'fetch') {
    throw new Error('Usage: dw app fetch --workspace <path> --app <application-id>');
  }
  const workspacePath = resolveWorkspaceArg(args);
  const appId = args.app || args.appId;
  if (!workspacePath || !appId) {
    throw new Error('Missing workspace or application id. Usage: dw app fetch --workspace <path> --app <application-id>');
  }
  const result = await fetchWhitepaperApplicationSource({
    workspacePath,
    appId,
    confirm: true,
  });
  console.log(`${result.status}: ${result.sourcePath || ''}`);
}

async function commandArchive(args) {
  const action = args._[1] || 'propose';
  if (action !== 'propose') {
    throw new Error('Usage: dw archive propose --workspace <path>');
  }
  const workspacePath = resolveWorkspaceArg(args);
  if (!workspacePath) {
    throw new Error('Missing workspace. Usage: dw archive propose --workspace <path>');
  }
  const proposal = await createKnowledgeUpdateProposal(workspacePath);
  console.log(`knowledge-proposal: ${proposal.status}`);
  console.log(`proposal: ${path.join(workspacePath, 'archive', 'knowledge-update-proposal.json')}`);
  console.log(`patch: ${path.join(workspacePath, 'archive', 'knowledge-patch.md')}`);
}

async function commandStatus(args) {
  const workspacePath = resolveWorkspaceArg(args);
  if (!workspacePath) {
    await commandServerStatus(args);
    return;
  }
  const status = await getWorkspaceStatus(workspacePath);
  console.log(`workspace: ${workspacePath}`);
  console.log(`valid: ${Boolean(status.isWorkspace)}`);
  if (!status.isWorkspace) {
    console.log(status.message || 'Not a delivery workflow workspace.');
    return;
  }
  const latest = status.progress && status.progress.latest ? status.progress.latest : null;
  if (latest && latest.stepId) {
    console.log(`latest: ${latest.stepId} / ${latest.status || ''}`);
  }
  const gates = await evaluateQualityGates(workspacePath);
  console.log(`gates: ${gates.status}`);
  printNextRecommendation(status.nextRecommendation);
}

async function commandNext(args) {
  const workspacePath = resolveWorkspaceArg(args);
  if (!workspacePath) {
    throw new Error('Missing workspace. Run inside a workspace or pass --workspace <path>.');
  }
  const status = await getWorkspaceStatus(workspacePath);
  if (!status.isWorkspace) {
    throw new Error(status.message || 'Not a delivery workflow workspace.');
  }
  printNextRecommendation(status.nextRecommendation);
}

async function commandHandoff(args) {
  const workspacePath = resolveWorkspaceArg(args);
  if (!workspacePath) {
    throw new Error('Missing workspace. Run inside a workspace or pass --workspace <path>.');
  }
  let stepId = args.step || args.stepId;
  if (!stepId) {
    const status = await getWorkspaceStatus(workspacePath);
    stepId = status.nextRecommendation && status.nextRecommendation.stepId;
  }
  if (!stepId) {
    throw new Error('Missing step. Pass --step <step-id> or run with a workspace that has a next step.');
  }
  const handoff = await prepareAgentHandoff({
    workspacePath,
    stepId,
    taskId: args.task || args.taskId,
    agent: args.agent || args.executor || 'codex',
    port: args.port,
  });
  console.log(`handoff: ${path.join(handoff.workspacePath, handoff.handoffFile)}`);
  console.log(`step: ${handoff.stepId}`);
  console.log(`return: ${handoff.returnStepId}`);
  console.log('');
  console.log(`Ask AI to read ${handoff.handoffFile}, complete the step, then run:`);
  const portArg = args.port ? ` --port ${args.port}` : '';
  console.log(`dw done --workspace "${handoff.workspacePath}" --step ${handoff.stepId} --summary "ready for review"${portArg}`);
}

async function commandDone(args) {
  const workspacePath = resolveWorkspaceArg(args);
  if (!workspacePath) {
    throw new Error('Missing workspace. Run inside a workspace or pass --workspace <path>.');
  }
  const stepId = args.step || args.stepId;
  if (!stepId) {
    throw new Error('Missing step. Usage: dw done --step <step-id>');
  }
  const result = await completeAgentHandoff({
    workspacePath,
    stepId,
    taskId: args.task || args.taskId,
    summary: args.summary,
    status: args.status,
    returnStepId: args.returnStep || args.returnStepId,
    outputs: splitList(args.outputs),
    port: args.port,
  });
  if (['07-review-code', '06-generate-unit-tests'].includes(result.payload.stepId)) {
    const quality = await refreshQualitySummary(result.workspacePath);
    console.log(`quality: ${quality.status}`);
  }
  if (result.payload.stepId === '10-archive-knowledge') {
    const proposal = await createKnowledgeUpdateProposal(result.workspacePath);
    console.log(`knowledge-proposal: ${proposal.status}`);
  }
  console.log(`done: ${path.join(result.workspacePath, result.doneFile)}`);
  console.log(`return: ${result.payload.returnStepId}`);
  console.log(result.payload.nextUrl);
}

function statusMark(ok) {
  return ok ? 'OK ' : 'WARN';
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value) {
    return [];
  }
  return [value];
}

function resolveConfigPath(root, value) {
  const text = typeof value === 'string' ? value : value && value.path ? value.path : '';
  if (!text || /^[a-z]+:\/\//i.test(text)) {
    return '';
  }
  return path.isAbsolute(text) ? text : path.resolve(root, text);
}

function capabilityChecks(tools, teamProfile) {
  const root = teamProfile.root || tools.teamConfigRoot || '';
  if (!root || !teamProfile.available) {
    return [];
  }
  const profile = teamProfile.profile || {};
  const checks = [];
  const schemaPath = path.join(root, 'capabilities', 'capability.schema.json');
  checks.push(['capability schema', pathExists(schemaPath), pathExists(schemaPath) ? schemaPath : 'not found']);
  const references = [
    ['skill', normalizeList(profile.skills)],
    ['rule', normalizeList(profile.rules)],
    ['template', normalizeList(profile.templates)],
    ['knowledge', normalizeList(profile.knowledge)],
  ];
  for (const [kind, items] of references) {
    for (const item of items) {
      const targetPath = resolveConfigPath(root, item);
      if (!targetPath) {
        continue;
      }
      checks.push([`${kind} ref`, pathExists(targetPath), targetPath]);
    }
  }
  return checks;
}

async function commandDoctor() {
  const tools = await readToolsConfig();
  const teamProfile = await readTeamProfileConfig(tools);
  const checks = [
    ['Codex CLI', Boolean(tools.codexPath), tools.codexPath || 'not found'],
    ['Codex Desktop', Boolean(tools.codexDesktopPath), tools.codexDesktopPath || 'not found'],
    ['Claude Code', Boolean(tools.claudePath), tools.claudePath || 'not found'],
    ['IntelliJ IDEA', Boolean(tools.ideaPath), tools.ideaPath || 'not found'],
    ['teamConfigRoot', pathExists(tools.teamConfigRoot), tools.teamConfigRoot || 'not set'],
    ['whitepaperRoot', pathExists(tools.whitepaperRoot), tools.whitepaperRoot || 'not set'],
    ['repoRoot', pathExists(tools.repoRoot), tools.repoRoot || 'not set'],
    ['teamProfile', teamProfile.available, teamProfile.available ? teamProfile.profilePath : teamProfile.reason],
  ].concat(capabilityChecks(tools, teamProfile));
  console.log('Delivery Workflow doctor');
  console.log('');
  for (const [name, ok, detail] of checks) {
    console.log(`[${statusMark(ok)}] ${name}: ${detail}`);
  }
  console.log('');
  console.log(`Config data: ${process.env.DELIVERY_WORKFLOW_DATA_DIR}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'start';
  if (args.help || command === 'help') {
    console.log(usage());
    return;
  }
  if (command === 'start') {
    await commandStart(args);
    return;
  }
  if (command === 'stop') {
    await commandStop(args);
    return;
  }
  if (command === 'restart') {
    await commandRestart(args);
    return;
  }
  if (command === 'logs') {
    await commandLogs(args);
    return;
  }
  if (command === 'open') {
    await commandOpen(args);
    return;
  }
  if (command === 'init') {
    await commandInit(args);
    return;
  }
  if (command === 'setup') {
    await commandSetup(args);
    return;
  }
  if (command === 'config') {
    await commandConfig(args);
    return;
  }
  if (command === 'function') {
    await commandFunction(args);
    return;
  }
  if (command === 'context') {
    await commandContext(args);
    return;
  }
  if (command === 'domain') {
    await commandDomain(args);
    return;
  }
  if (command === 'prd') {
    await commandPrd(args);
    return;
  }
  if (command === 'gate') {
    await commandGate(args);
    return;
  }
  if (command === 'app') {
    await commandApp(args);
    return;
  }
  if (command === 'archive') {
    await commandArchive(args);
    return;
  }
  if (command === 'status') {
    await commandStatus(args);
    return;
  }
  if (command === 'next') {
    await commandNext(args);
    return;
  }
  if (command === 'handoff') {
    await commandHandoff(args);
    return;
  }
  if (command === 'done') {
    await commandDone(args);
    return;
  }
  if (command === 'doctor') {
    await commandDoctor(args);
    return;
  }
  console.error(`Unknown command: ${command}`);
  console.error('');
  console.error(usage());
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
