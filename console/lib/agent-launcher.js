const fsp = require('fs/promises');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const {
  assertWithin,
  ensureDir,
  exists,
} = require('./fs-utils');

const execFileAsync = promisify(execFile);
const LAUNCHER_FILE = '.workflow/handoff/launch-agent.ps1';

async function writeWindowsLauncherScript(cwd, commandLine) {
  const launcherPath = path.join(cwd, LAUNCHER_FILE);
  assertWithin(cwd, launcherPath);
  await ensureDir(path.dirname(launcherPath));
  const content = [
    '$ErrorActionPreference = "Stop"',
    '[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()',
    '$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
    '$env:PYTHONUTF8 = "1"',
    '$env:PYTHONIOENCODING = "utf-8"',
    '$env:LC_ALL = "C.UTF-8"',
    '$env:LANG = "C.UTF-8"',
    'chcp 65001 | Out-Null',
    `Set-Location -LiteralPath ${quotePowerShellArg(cwd)}`,
    commandLine,
    '',
  ].join('\r\n');
  await fsp.writeFile(launcherPath, content, 'utf8');
  return launcherPath;
}

async function resolveWindowsPowerShell() {
  if (process.platform !== 'win32') {
    return '';
  }
  for (const candidate of ['pwsh.exe', 'powershell.exe']) {
    try {
      const { stdout } = await execFileAsync('where.exe', [candidate], {
        windowsHide: true,
        timeout: 5000,
      });
      const first = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      if (first) {
        return first;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

async function openTerminalCommand(commandLine, cwd) {
  const launcherPath = process.platform === 'win32'
    ? await writeWindowsLauncherScript(cwd, commandLine)
    : '';
  const windowsShell = process.platform === 'win32'
    ? await resolveWindowsPowerShell()
    : '';
  return new Promise((resolve, reject) => {
    let command;
    let args;
    if (process.platform === 'win32') {
      command = 'wt.exe';
      args = [
        '-w',
        'new',
        'new-tab',
        '--title',
        'Delivery Workflow AI',
        '-d',
        cwd,
        windowsShell,
        '-NoExit',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        launcherPath,
      ];
    } else if (process.platform === 'darwin') {
      command = 'osascript';
      args = ['-e', `tell application "Terminal" to do script "cd ${cwd.replace(/"/g, '\\"')} && ${commandLine.replace(/"/g, '\\"')}"`];
    } else {
      command = 'sh';
      args = ['-lc', `x-terminal-emulator -e 'cd "${cwd}" && ${commandLine}; exec sh'`];
    }
    const spawnOptions = {
      windowsHide: false,
      detached: true,
      stdio: 'ignore',
    };
    const child = spawn(command, args, spawnOptions);
    child.on('error', (error) => {
      if (process.platform === 'win32' && command === 'wt.exe') {
        const escapedLauncherPath = String(launcherPath).replace(/'/g, "''");
        const escapedCwd = String(cwd).replace(/'/g, "''");
        const escapedShell = String(windowsShell).replace(/'/g, "''");
        const fallback = spawn(windowsShell, [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `Start-Process -FilePath '${escapedShell}' -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '${escapedLauncherPath}') -WorkingDirectory '${escapedCwd}' -WindowStyle Normal`,
        ], spawnOptions);
        fallback.on('error', reject);
        fallback.unref();
        resolve();
        return;
      }
      reject(error);
    });
    child.unref();
    resolve();
  });
}

function quoteShellArg(value) {
  const text = String(value || '');
  if (process.platform === 'win32') {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function quotePowerShellArg(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

async function resolvePowerShellExecutable(executable) {
  const value = String(executable || '').trim();
  if (process.platform !== 'win32') {
    return value;
  }
  if (/\.cmd$/i.test(value)) {
    const ps1Path = value.replace(/\.cmd$/i, '.ps1');
    if (await exists(ps1Path)) {
      return ps1Path;
    }
  }
  return value;
}

function buildAgentStartupPrompt(handoff) {
  return [
    handoff.agentRoleName ? `Agent Role: ${handoff.agentRoleName}` : '',
    `Workspace: ${handoff.workspacePath}`,
    `Step: ${handoff.stepId}${handoff.taskId ? ` / Task: ${handoff.taskId}` : ''}`,
    `Read AGENTS.md, CLAUDE.md, .workflow/progress.md, and ${handoff.handoffFile}.`,
    'Then take over this Delivery Workflow step and write outputs back to the workspace.',
    `When ready for review, run: delivery-workflow done --workspace ${quoteShellArg(handoff.workspacePath)} --step ${quoteShellArg(handoff.stepId)} --summary ${quoteShellArg('ready for review')}`,
    `Then run: delivery-workflow open --workspace ${quoteShellArg(handoff.workspacePath)} --step ${quoteShellArg(handoff.returnStepId || handoff.stepId)}`,
  ].filter(Boolean).join('\n');
}

function buildInteractiveAgentCommand(executable, handoff, options = {}) {
  const agentName = handoff.agent === 'claude' ? 'Claude Code' : 'Codex';
  const startupPrompt = buildAgentStartupPrompt(handoff);
  const resume = Boolean(options.resume);
  if (process.platform === 'win32') {
    const executableArg = quotePowerShellArg(executable);
    const promptArg = quotePowerShellArg(startupPrompt);
    const command = handoff.agent === 'claude'
      ? resume
        ? `& ${executableArg} --continue ${promptArg}`
        : `& ${executableArg} --name ${quotePowerShellArg(handoff.sessionName)} ${promptArg}`
      : resume
        ? `& ${executableArg} --cd ${quotePowerShellArg(handoff.workspacePath)} resume --last ${promptArg}`
        : `& ${executableArg} --cd ${quotePowerShellArg(handoff.workspacePath)} ${promptArg}`;
    return [
      `Write-Host ${quotePowerShellArg(`Delivery Workflow handoff: ${handoff.handoffFile}`)}`,
      `Write-Host ${quotePowerShellArg(`${resume ? 'Resuming' : 'Starting'} ${agentName} with handoff prompt...`)}`,
      command,
    ].join('; ');
  }
  const executableArg = quoteShellArg(executable);
  const promptArg = quoteShellArg(startupPrompt);
  const command = handoff.agent === 'claude'
    ? resume
      ? `${executableArg} --continue ${promptArg}`
      : `${executableArg} --name ${quoteShellArg(handoff.sessionName)} ${promptArg}`
    : resume
      ? `${executableArg} --cd ${quoteShellArg(handoff.workspacePath)} resume --last ${promptArg}`
      : `${executableArg} --cd ${quoteShellArg(handoff.workspacePath)} ${promptArg}`;
  return [
    `printf '%s\\n' ${quoteShellArg(`Delivery Workflow handoff: ${handoff.handoffFile}`)} ${quoteShellArg(`${resume ? 'Resuming' : 'Starting'} ${agentName} with handoff prompt...`)}`,
    command,
  ].join(' ; ');
}

function createAgentLauncherRuntime(deps) {
  const {
    prepareAgentHandoff,
    readToolsConfig,
    configuredCommand,
    readAgentSessionIndex,
    findAgentSession,
    upsertAgentSession,
  } = deps;

  async function openAgentCli(body) {
    const handoff = await prepareAgentHandoff(body);
    const tools = await readToolsConfig();
    const configuredExecutable = handoff.agent === 'claude'
      ? configuredCommand(tools.claudePath, process.platform === 'win32' ? 'claude.cmd' : 'claude')
      : configuredCommand(tools.codexPath, process.platform === 'win32' ? 'codex.cmd' : 'codex');
    const executable = await resolvePowerShellExecutable(configuredExecutable);
    const agentSessions = await readAgentSessionIndex(handoff.workspacePath);
    const previous = findAgentSession(agentSessions, handoff.unitId, handoff.stepId, handoff.taskId, handoff.agent);
    const forceNew = Boolean(body.forceNew);
    const shouldResume = Boolean(previous && previous.status !== 'ready-for-review' && !forceNew);
    const commandLine = buildInteractiveAgentCommand(executable, handoff, { resume: shouldResume });
    await openTerminalCommand(commandLine, handoff.workspacePath);
    const session = await upsertAgentSession(handoff.workspacePath, {
      key: handoff.sessionKey,
      agent: handoff.agent,
      unitId: handoff.unitId,
      agentRoleId: handoff.agentRoleId,
      agentRoleName: handoff.agentRoleName,
      stepId: handoff.stepId,
      taskId: handoff.taskId,
      returnStepId: handoff.returnStepId,
      sessionName: handoff.sessionName,
      sessionId: previous && previous.sessionId ? previous.sessionId : '',
      status: 'working',
      handoffFile: handoff.handoffFile,
      doneFile: handoff.doneFile,
      mode: shouldResume ? 'resume' : 'new',
      resumeStrategy: handoff.agent === 'claude' ? 'continue-current-directory' : 'resume-last-in-workspace',
    });
    return {
      ...handoff,
      opened: true,
      resumed: shouldResume,
      session,
      command: commandLine,
    };
  }

  return {
    openAgentCli,
  };
}

module.exports = {
  LAUNCHER_FILE,
  createAgentLauncherRuntime,
  openTerminalCommand,
  quoteShellArg,
  quotePowerShellArg,
  buildInteractiveAgentCommand,
};
