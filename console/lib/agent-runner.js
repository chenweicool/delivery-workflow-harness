const { spawn } = require('child_process');

function createAgentRunnerRuntime(deps) {
  const {
    assertWithin,
    writeRunMeta,
    appendRunLog,
    nowIso,
  } = deps;

  async function launchAgentProcess({
    workspacePath,
    runId,
    prompt,
    commandSpec,
    runFile,
    logFile,
    meta,
    initialLog,
  }) {
    assertWithin(workspacePath, runFile);
    assertWithin(workspacePath, logFile);
    await writeRunMeta(runFile, meta);
    await appendRunLog(logFile, initialLog);

    const child = spawn(commandSpec.command, commandSpec.args, {
      cwd: workspacePath,
      windowsHide: true,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    meta.pid = child.pid || null;
    await writeRunMeta(runFile, meta);
    child.stdin.end(prompt);
    child.stdout.on('data', (chunk) => {
      appendRunLog(logFile, chunk.toString('utf8')).catch(() => {});
    });
    child.stderr.on('data', (chunk) => {
      appendRunLog(logFile, chunk.toString('utf8')).catch(() => {});
    });
    child.on('error', async (error) => {
      const failed = {
        ...meta,
        status: 'failed',
        endedAt: nowIso(),
        error: error.message,
      };
      await appendRunLog(logFile, `\n[process error] ${error.message}\n`).catch(() => {});
      await writeRunMeta(runFile, failed).catch(() => {});
    });
    child.on('close', async (code) => {
      const ended = {
        ...meta,
        status: code === 0 ? 'success' : 'failed',
        endedAt: nowIso(),
        exitCode: code,
      };
      await appendRunLog(logFile, `\n---\nendedAt: ${ended.endedAt}\nexitCode: ${code}\n`).catch(() => {});
      await writeRunMeta(runFile, ended).catch(() => {});
    });

    return { runId, status: 'running' };
  }

  return {
    launchAgentProcess,
  };
}

module.exports = {
  createAgentRunnerRuntime,
};
