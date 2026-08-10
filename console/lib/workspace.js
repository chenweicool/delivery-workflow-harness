const path = require('path');
const { normalizeUserPath } = require('./fs-utils');

function defaultAppConfig(app) {
  const sourcePath = normalizeUserPath(app.sourcePath || app.path || '');
  const name = String(app.name || (sourcePath ? path.basename(sourcePath) : '')).trim();
  const safeName = name || 'app';
  return {
    name: safeName,
    projectId: String(app.projectId || '').trim(),
    sourcePath,
    worktreePath: app.worktreePath || `apps/${safeName}`,
    baseBranch: app.baseBranch || '',
    // 分支必须在研发确认后由需求配置显式提供，禁止注入个人名称作为默认值。
    featureBranch: app.featureBranch || '',
    suggestedFeatureBranch: app.suggestedFeatureBranch || '',
    branchConfirmedBy: app.branchConfirmedBy || '',
    branchConfirmedAt: app.branchConfirmedAt || '',
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
