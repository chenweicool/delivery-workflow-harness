const fsp = require('fs/promises');
const path = require('path');

async function exists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(targetPath) {
  await fsp.mkdir(targetPath, { recursive: true });
}

function normalizeUserPath(value) {
  if (!value) {
    return '';
  }
  let text = String(value).trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  return path.resolve(text);
}

function resolveOptionalRootPath(root, value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  if (path.isAbsolute(text)) {
    return normalizeUserPath(text);
  }
  return root ? path.resolve(root, text) : normalizeUserPath(text);
}

function assertWithin(baseDir, targetPath) {
  const relative = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`路径越界：${targetPath}`);
  }
}

module.exports = {
  exists,
  ensureDir,
  normalizeUserPath,
  resolveOptionalRootPath,
  assertWithin,
};
