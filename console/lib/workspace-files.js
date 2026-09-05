const fsp = require('fs/promises');
const path = require('path');
const {
  assertWithin,
  ensureDir,
  exists,
} = require('./fs-utils');

async function listFiles(rootDir, relativeDir = '', limit = 200) {
  const result = [];
  const baseDir = path.join(rootDir, relativeDir);
  if (!(await exists(baseDir))) {
    return result;
  }

  async function walk(currentDir) {
    if (result.length >= limit) {
      return;
    }
    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    for (const entry of entries) {
      if (result.length >= limit) {
        return;
      }
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        result.push({ path: relativePath, type: 'dir' });
        await walk(fullPath);
      } else {
        const stat = await fsp.stat(fullPath);
        result.push({ path: relativePath, type: 'file', size: stat.size, modifiedAt: stat.mtime.toISOString() });
      }
    }
  }

  await walk(baseDir);
  return result;
}

async function pathExistsInWorkspace(workspacePath, relativePath) {
  const fullPath = path.join(workspacePath, relativePath);
  assertWithin(workspacePath, fullPath);
  return exists(fullPath);
}

async function readJsonFileIfExists(workspacePath, relativePath) {
  if (!relativePath) {
    return null;
  }
  const fullPath = path.join(workspacePath, relativePath);
  assertWithin(workspacePath, fullPath);
  if (!(await exists(fullPath))) {
    return null;
  }
  try {
    return JSON.parse(await fsp.readFile(fullPath, 'utf8'));
  } catch (error) {
    throw new Error(`Workspace JSON 文件不是合法 JSON：${relativePath}；${error.message}`);
  }
}

async function unlinkWorkspaceFileIfExists(workspacePath, relativePath) {
  if (!relativePath) {
    return;
  }
  const fullPath = path.join(workspacePath, relativePath);
  assertWithin(workspacePath, fullPath);
  if (await exists(fullPath)) {
    await fsp.unlink(fullPath);
  }
}

async function writeWorkspaceJsonFile(workspacePath, relativePath, data) {
  const fullPath = path.join(workspacePath, relativePath);
  assertWithin(workspacePath, fullPath);
  await ensureDir(path.dirname(fullPath));
  await fsp.writeFile(fullPath, JSON.stringify(data, null, 2), 'utf8');
}

async function readWorkspaceTextFileIfExists(workspacePath, relativePath) {
  const fullPath = path.join(workspacePath, relativePath);
  assertWithin(workspacePath, fullPath);
  if (!(await exists(fullPath))) {
    return '';
  }
  const stat = await fsp.stat(fullPath);
  if (!stat.isFile()) {
    throw new Error(`涓嶆槸鏂囦欢锛?{relativePath}`);
  }
  return fsp.readFile(fullPath, 'utf8');
}

async function writeWorkspaceTextFile(workspacePath, relativePath, content) {
  const fullPath = path.join(workspacePath, relativePath);
  assertWithin(workspacePath, fullPath);
  await ensureDir(path.dirname(fullPath));
  await fsp.writeFile(fullPath, content, 'utf8');
}

async function appendWorkspaceTextFile(workspacePath, relativePath, content) {
  const fullPath = path.join(workspacePath, relativePath);
  assertWithin(workspacePath, fullPath);
  await ensureDir(path.dirname(fullPath));
  await fsp.appendFile(fullPath, content, 'utf8');
}

module.exports = {
  listFiles,
  pathExistsInWorkspace,
  readJsonFileIfExists,
  unlinkWorkspaceFileIfExists,
  writeWorkspaceJsonFile,
  readWorkspaceTextFileIfExists,
  writeWorkspaceTextFile,
  appendWorkspaceTextFile,
};
