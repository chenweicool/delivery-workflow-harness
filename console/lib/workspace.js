const path = require('path');
const { normalizeUserPath } = require('./fs-utils');

function defaultAppConfig(app) {
  const sourcePath = normalizeUserPath(app.sourcePath || app.path || '');
  const name = String(app.name || (sourcePath ? path.basename(sourcePath) : '')).trim();
  const safeName = name || 'app';
  return {
    name: safeName,
    sourcePath,
    worktreePath: app.worktreePath || `apps/${safeName}`,
    baseBranch: app.baseBranch || '',
    featureBranch: app.featureBranch || `ewan/feature-${safeName}-0616`,
    type: app.type || 'java-backend',
  };
}

function normalizeAppPaths(appPaths) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(appPaths) ? appPaths : []) {
    const rawPath = item && item.path ? String(item.path).trim() : '';
    if (!rawPath) {
      continue;
    }
    const rawName = item && item.name ? String(item.name).trim() : '';
    const normalizedPath = normalizeUserPath(rawPath);
    const name = rawName || path.basename(normalizedPath);
    const key = `${name.toLowerCase()}|${normalizedPath.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ name, path: normalizedPath });
  }
  return result;
}

function normalizeApps(apps, appPaths = []) {
  const seen = new Set();
  const source = Array.isArray(apps) && apps.length
    ? apps
    : normalizeAppPaths(appPaths).map((item) => ({
      name: item.name,
      sourcePath: item.path,
    }));
  const result = [];
  for (const raw of source) {
    const app = defaultAppConfig(raw || {});
    if (!app.sourcePath) {
      continue;
    }
    const key = `${app.name.toLowerCase()}|${app.sourcePath.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(app);
  }
  return result;
}

module.exports = {
  defaultAppConfig,
  normalizeAppPaths,
  normalizeApps,
};
