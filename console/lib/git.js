const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function gitHead(rootDir) {
  return new Promise((resolve) => {
    execFile('git', ['-C', rootDir, 'rev-parse', 'HEAD'], { windowsHide: true }, (error, stdout) => {
      resolve(error ? 'unknown' : stdout.trim() || 'unknown');
    });
  });
}

async function gitOutput(args, cwd) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

async function gitOutputSafe(args, cwd) {
  try {
    return await gitOutput(args, cwd);
  } catch (error) {
    return `[git command failed] git ${args.join(' ')}\n${error.message}`;
  }
}

module.exports = {
  gitHead,
  gitOutput,
  gitOutputSafe,
};
