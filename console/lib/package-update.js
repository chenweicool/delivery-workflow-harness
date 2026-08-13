const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

function parseVersion(value) {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return { numbers: match.slice(1, 4).map(Number), prerelease: match[4] || '' };
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < a.numbers.length; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] > b.numbers[index] ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

async function readPackageInfo(rootDir) {
  return JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf8'));
}

function releaseChannel(version) {
  return String(version || '').includes('-') ? 'beta' : 'latest';
}

async function getPackageUpdateStatus(rootDir, options = {}) {
  const packageInfo = await readPackageInfo(rootDir);
  const packageName = packageInfo.name;
  const currentVersion = packageInfo.version;
  const channel = options.channel || releaseChannel(currentVersion);
  const registry = String(options.registry || 'https://registry.npmjs.org').replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 5000);
  try {
    const response = await fetch(`${registry}/${encodeURIComponent(packageName)}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
    const metadata = await response.json();
    const latestVersion = metadata['dist-tags'] && (metadata['dist-tags'][channel] || metadata['dist-tags'].latest);
    if (!latestVersion) throw new Error(`npm registry does not have a ${channel} release`);
    const comparison = compareVersions(latestVersion, currentVersion);
    return { packageName, currentVersion, latestVersion, channel, updateAvailable: comparison > 0, status: comparison > 0 ? 'update-available' : comparison === 0 ? 'current' : 'local-newer' };
  } finally {
    clearTimeout(timeout);
  }
}

async function installPackageUpdate(rootDir, options = {}) {
  const status = await getPackageUpdateStatus(rootDir, options);
  if (!status.updateAvailable) return { ...status, updated: false };
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  await new Promise((resolve, reject) => {
    // The console runs detached on Windows and has no usable terminal handles.
    // `stdio: 'inherit'` therefore makes CreateProcess fail with spawn EINVAL.
    const child = spawn(npmCommand, ['install', '--global', `${status.packageName}@${status.channel}`], {
      stdio: 'pipe',
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => reject(new Error(`无法启动 npm 更新：${error.message}`)));
    child.on('exit', (code) => code === 0
      ? resolve()
      : reject(new Error(`npm 更新失败（退出码 ${code}）${stderr.trim() ? `：${stderr.trim()}` : ''}`)));
  });
  return { ...status, updated: true, restartRequired: true };
}

module.exports = { compareVersions, getPackageUpdateStatus, installPackageUpdate };
