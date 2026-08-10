const crypto = require('crypto');
const path = require('path');

const DELIVERY_REPORT_FILE = 'delivery/delivery-report.json';
const DELIVERY_REPORT_SCHEMA_VERSION = '1.0';

function normalizeDemand(value = {}) {
  const owner = value.owner && typeof value.owner === 'object' ? value.owner : {};
  return {
    startedAt: String(value.startedAt || '').trim(),
    owner: {
      name: String(owner.name || '').trim(),
      id: String(owner.id || '').trim(),
    },
    url: String(value.url || '').trim(),
  };
}

function validateDemand(value, { requireStartedAt = false } = {}) {
  const demand = normalizeDemand(value);
  if (requireStartedAt && !demand.startedAt) {
    throw new Error('当前 Workspace 缺少需求开始时间，无法生成交付报告。');
  }
  if (!demand.owner.name) {
    throw new Error('请填写需求负责人后再生成交付报告。');
  }
  if (!demand.url) {
    throw new Error('请填写需求链接后再生成交付报告。');
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(demand.url);
  } catch {
    throw new Error('需求链接必须是有效的 HTTP 或 HTTPS 地址。');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('需求链接必须是有效的 HTTP 或 HTTPS 地址。');
  }
  if (demand.startedAt && Number.isNaN(Date.parse(demand.startedAt))) {
    throw new Error('需求开始时间格式无效。');
  }
  return demand;
}

function applicationScope(config = {}) {
  const seen = new Set();
  const applications = [];
  for (const app of Array.isArray(config.apps) ? config.apps : []) {
    const name = String(app && app.name || '').trim();
    if (!name) continue;
    const projectId = String(app.projectId || '').trim();
    const key = `${projectId.toLowerCase()}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    applications.push({ projectId, name });
  }
  return { version: '1.0', applications };
}

function createDeliveryReportRuntime(deps) {
  const {
    normalizeUserPath,
    exists,
    readWorkspaceConfig,
    readJsonFileIfExists,
    writeWorkspaceJsonFile,
    nowIso,
  } = deps;

  async function completeDeliveryReport(workspacePathValue) {
    const workspacePath = normalizeUserPath(workspacePathValue || '');
    if (!workspacePath || !(await exists(path.join(workspacePath, 'AGENTS.md')))) {
      throw new Error('当前目录不是有效的 Delivery Workflow workspace');
    }
    const existing = await readJsonFileIfExists(workspacePath, DELIVERY_REPORT_FILE);
    if (existing) {
      return { report: existing, reportFile: DELIVERY_REPORT_FILE, created: false };
    }
    const config = await readWorkspaceConfig(workspacePath);
    const demand = validateDemand(config.demand, { requireStartedAt: true });
    const completedAt = nowIso();
    const report = {
      schemaVersion: DELIVERY_REPORT_SCHEMA_VERSION,
      reportId: `dvr_${crypto.randomUUID()}`,
      generatedAt: completedAt,
      demand: {
        startedAt: demand.startedAt,
        completedAt,
        owner: demand.owner,
        url: demand.url,
      },
      extensions: {
        applicationScope: applicationScope(config),
      },
    };
    await writeWorkspaceJsonFile(workspacePath, DELIVERY_REPORT_FILE, report);
    return { report, reportFile: DELIVERY_REPORT_FILE, created: true };
  }

  return {
    completeDeliveryReport,
  };
}

module.exports = {
  DELIVERY_REPORT_FILE,
  DELIVERY_REPORT_SCHEMA_VERSION,
  normalizeDemand,
  validateDemand,
  applicationScope,
  createDeliveryReportRuntime,
};
