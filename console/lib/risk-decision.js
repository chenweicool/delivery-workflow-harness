const fsp = require('fs/promises');
const path = require('path');
const { assertWithin, ensureDir, exists, normalizeUserPath } = require('./fs-utils');

const RISK_INDEX_FILE = '.workflow/risks/index.json';
const RISK_TYPES = new Set([
  'database',
  'financial',
  'api-contract',
  'deletion',
  'shared-component',
  'external-write',
  'ownership-unknown',
]);

function riskFile(id) {
  return `.workflow/risks/${id}.json`;
}

async function readJson(filePath, fallback) {
  if (!(await exists(filePath))) return fallback;
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

async function readRiskIndex(workspacePathValue) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  const filePath = path.join(workspacePath, RISK_INDEX_FILE);
  assertWithin(workspacePath, filePath);
  const index = await readJson(filePath, { version: 1, nextSequence: 1, risks: [] });
  index.risks = Array.isArray(index.risks) ? index.risks : [];
  index.nextSequence = Number(index.nextSequence || index.risks.length + 1);
  return { workspacePath, filePath, index };
}

async function writeRiskIndex(workspacePath, filePath, index) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

async function reportRisk(input) {
  const { workspacePath, filePath, index } = await readRiskIndex(input.workspacePath);
  if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) throw new Error('当前目录不是有效 Workspace');
  const type = String(input.type || '').trim();
  if (!RISK_TYPES.has(type)) throw new Error(`未知风险类型：${type || '(empty)'}`);
  const scope = String(input.scope || '').trim();
  const impact = String(input.impact || '').trim();
  const rollback = String(input.rollback || '').trim();
  if (!scope || !impact || !rollback) throw new Error('风险上报必须填写 scope、impact 和 rollback');
  const id = `R-${String(index.nextSequence).padStart(3, '0')}`;
  const record = {
    id,
    type,
    status: 'waiting',
    scope,
    impact,
    rollback,
    recommendation: String(input.recommendation || '').trim(),
    reporter: String(input.reporter || '').trim() || 'agent',
    reportedAt: new Date().toISOString(),
    decision: null,
  };
  const recordPath = path.join(workspacePath, riskFile(id));
  assertWithin(workspacePath, recordPath);
  await ensureDir(path.dirname(recordPath));
  await fsp.writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  index.nextSequence += 1;
  index.risks.push(record);
  index.updatedAt = record.reportedAt;
  await writeRiskIndex(workspacePath, filePath, index);
  return record;
}

async function listRisks(workspacePath) {
  const { index } = await readRiskIndex(workspacePath);
  return index.risks;
}

async function decideRisk(input) {
  const action = String(input.action || '').trim();
  if (!['approve', 'reject'].includes(action)) throw new Error('风险决策仅支持 approve 或 reject');
  const { workspacePath, filePath, index } = await readRiskIndex(input.workspacePath);
  const id = String(input.riskId || input.id || '').trim();
  const position = index.risks.findIndex((risk) => risk.id === id);
  if (position < 0) throw new Error(`风险记录不存在：${id}`);
  const note = String(input.note || '').trim();
  if (!note) throw new Error('风险决策必须填写 note');
  const record = {
    ...index.risks[position],
    status: action === 'approve' ? 'approved' : 'rejected',
    decision: {
      action,
      note,
      operator: String(input.operator || '').trim() || 'local-user',
      decidedAt: new Date().toISOString(),
    },
  };
  index.risks[position] = record;
  index.updatedAt = record.decision.decidedAt;
  const recordPath = path.join(workspacePath, riskFile(id));
  assertWithin(workspacePath, recordPath);
  await fsp.writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await writeRiskIndex(workspacePath, filePath, index);
  return record;
}

async function riskSummary(workspacePath) {
  const risks = await listRisks(workspacePath);
  const unresolved = risks.filter((risk) => risk.status !== 'approved');
  return {
    risks,
    total: risks.length,
    approved: risks.filter((risk) => risk.status === 'approved').length,
    waiting: risks.filter((risk) => risk.status === 'waiting').length,
    rejected: risks.filter((risk) => risk.status === 'rejected').length,
    unresolved,
    clear: unresolved.length === 0,
  };
}

async function assertNoUnresolvedRisks(workspacePath) {
  const summary = await riskSummary(workspacePath);
  if (!summary.clear) {
    throw new Error(`仍有未批准的风险决策：${summary.unresolved.map((risk) => `${risk.id}/${risk.status}`).join('、')}`);
  }
  return summary;
}

module.exports = {
  RISK_INDEX_FILE,
  RISK_TYPES,
  reportRisk,
  listRisks,
  decideRisk,
  riskSummary,
  assertNoUnresolvedRisks,
};
