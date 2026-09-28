const path = require('path');

const PATCH_DIR = '.workflow/patches';
const PATCH_INDEX_FILE = `${PATCH_DIR}/index.json`;
const PATCH_MODES = new Set(['quick', 'controlled']);
const PATCH_STATUSES = new Set(['active', 'completed', 'promoted', 'superseded']);
const HIGH_RISK_TRIGGERS = new Set([
  'database',
  'financial',
  'api-contract',
  'deletion',
  'shared-component',
  'ownership-unknown',
]);
const PROMOTION_STEPS = ['07-review-code', '08-verify-tests', '09-run-smoke'];

function normalizeStringList(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values
    .flatMap((item) => String(item || '').split(','))
    .map((item) => item.trim())
    .filter(Boolean))];
}

function patchRecordPath(patchId) {
  const safeId = String(patchId || '').trim();
  if (!/^P-\d{3,}$/.test(safeId)) {
    throw new Error(`无效修复记录编号：${patchId || '(empty)'}`);
  }
  return `${PATCH_DIR}/${safeId}.json`;
}

function nextPatchId(index) {
  const max = (index.patches || []).reduce((current, patch) => {
    const matched = /^P-(\d+)$/.exec(String(patch && patch.patchId || ''));
    return matched ? Math.max(current, Number(matched[1])) : current;
  }, 0);
  return `P-${String(max + 1).padStart(3, '0')}`;
}

function createPatchWorkRuntime(deps) {
  const {
    normalizeUserPath,
    exists,
    readJsonFileIfExists,
    writeWorkspaceJsonFile,
    nowIso,
    createChangeSet,
  } = deps;

  async function assertWorkspace(workspacePathValue) {
    const workspacePath = normalizeUserPath(workspacePathValue);
    if (!workspacePath || !(await exists(workspacePath))) {
      throw new Error('Workspace 不存在，无法创建修复记录。');
    }
    if (!(await exists(path.join(workspacePath, 'AGENTS.md'))) || !(await exists(path.join(workspacePath, '.workflow')))) {
      throw new Error('目标不是有效的 Delivery Workflow workspace。');
    }
    return workspacePath;
  }

  async function readPatchIndex(workspacePath) {
    const existing = await readJsonFileIfExists(workspacePath, PATCH_INDEX_FILE);
    if (!existing) {
      return { schemaVersion: 1, revision: 0, patches: [] };
    }
    if (!Array.isArray(existing.patches)) {
      throw new Error(`修复记录索引结构无效：${PATCH_INDEX_FILE}`);
    }
    return {
      schemaVersion: Math.max(1, Number(existing.schemaVersion) || 1),
      revision: Math.max(0, Number(existing.revision) || 0),
      patches: existing.patches,
    };
  }

  async function getPatch(workspacePathValue, patchId) {
    const workspacePath = await assertWorkspace(workspacePathValue);
    return readJsonFileIfExists(workspacePath, patchRecordPath(patchId));
  }

  async function writePatch(workspacePath, record, index) {
    await writeWorkspaceJsonFile(workspacePath, patchRecordPath(record.patchId), record);
    await writeWorkspaceJsonFile(workspacePath, PATCH_INDEX_FILE, index);
  }

  function normalizeRiskTriggers(value) {
    const triggers = normalizeStringList(value);
    const unsupported = triggers.filter((trigger) => !HIGH_RISK_TRIGGERS.has(trigger));
    if (unsupported.length) {
      throw new Error(`不支持的风险触发项：${unsupported.join('、')}；可选值：${[...HIGH_RISK_TRIGGERS].join('、')}`);
    }
    return triggers;
  }

  async function createPatch(body = {}) {
    const workspacePath = await assertWorkspace(body.workspacePath);
    const mode = String(body.mode || 'quick').trim();
    const scope = String(body.scope || '').trim();
    const reason = String(body.reason || '').trim();
    const authorization = String(body.authorization || body.authorisation || '').trim();
    const impact = String(body.impact || '').trim();
    const riskTriggers = normalizeRiskTriggers(body.riskTriggers || body.risks || body.risk);
    if (!PATCH_MODES.has(mode)) {
      throw new Error(`不支持的修复模式：${mode}；可选值：${[...PATCH_MODES].join('、')}`);
    }
    if (!scope || !reason || !authorization) {
      throw new Error('创建修复记录必须提供 scope、reason 和 authorization；授权必须能追溯到本次用户指令。');
    }
    if (mode === 'quick' && riskTriggers.length) {
      throw new Error(`快捷修复不能声明高风险触发项：${riskTriggers.join('、')}；请改用 controlled，并补充最小影响说明。`);
    }
    if (mode === 'controlled' && (!riskTriggers.length || !impact)) {
      throw new Error('受控修复必须声明至少一个风险触发项，并提供 impact（最小影响与验证说明）。');
    }

    const index = await readPatchIndex(workspacePath);
    const patchId = nextPatchId(index);
    const timestamp = nowIso();
    const record = {
      schemaVersion: 1,
      patchId,
      mode,
      status: 'active',
      scope,
      reason,
      authorization,
      riskTriggers,
      impact,
      source: String(body.source || '').trim(),
      operator: String(body.operator || '').trim() || 'local-user',
      changedFiles: [],
      testResult: '',
      changeSetId: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: '',
      promotedAt: '',
    };
    const summary = {
      patchId,
      mode,
      status: record.status,
      scope,
      riskTriggers,
      changeSetId: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const nextIndex = {
      ...index,
      revision: index.revision + 1,
      patches: [...index.patches, summary],
    };
    await writePatch(workspacePath, record, nextIndex);
    return { workspacePath, record, index: nextIndex };
  }

  async function listPatches(workspacePathValue) {
    const workspacePath = await assertWorkspace(workspacePathValue);
    const index = await readPatchIndex(workspacePath);
    return { workspacePath, ...index };
  }

  async function completePatch(body = {}) {
    const workspacePath = await assertWorkspace(body.workspacePath);
    const patchId = String(body.patchId || body.patch || '').trim();
    const testResult = String(body.testResult || body.test || '').trim();
    const summary = String(body.summary || '').trim();
    if (!patchId || !testResult || !summary) {
      throw new Error('完成修复记录必须提供 patch、test 和 summary；未执行测试也必须写明原因。');
    }
    const record = await getPatch(workspacePath, patchId);
    if (!record) throw new Error(`未找到修复记录：${patchId}`);
    if (!PATCH_STATUSES.has(record.status)) throw new Error(`修复记录状态无效：${patchId} / ${record.status}`);
    if (['promoted', 'superseded'].includes(record.status)) {
      throw new Error(`修复记录不能直接完成：${patchId} / ${record.status}`);
    }
    const timestamp = nowIso();
    const updated = {
      ...record,
      status: 'completed',
      changedFiles: normalizeStringList(body.changedFiles || body.files),
      testResult,
      completionSummary: summary,
      completedAt: timestamp,
      updatedAt: timestamp,
    };
    const index = await readPatchIndex(workspacePath);
    const nextIndex = {
      ...index,
      revision: index.revision + 1,
      patches: index.patches.map((item) => item.patchId === patchId ? {
        ...item,
        status: updated.status,
        changeSetId: updated.changeSetId || '',
        updatedAt: timestamp,
      } : item),
    };
    await writePatch(workspacePath, updated, nextIndex);
    return { workspacePath, record: updated, index: nextIndex };
  }

  async function promotePatch(body = {}) {
    const workspacePath = await assertWorkspace(body.workspacePath);
    const patchId = String(body.patchId || body.patch || '').trim();
    const record = await getPatch(workspacePath, patchId);
    if (!record) throw new Error(`未找到修复记录：${patchId}`);
    if (record.status === 'promoted' && record.changeSetId) {
      return { workspacePath, record, idempotent: true };
    }
    if (record.status !== 'completed') {
      throw new Error(`只有已完成修复记录可以进入 Review / Candidate：${patchId} / ${record.status}`);
    }
    const change = await createChangeSet({
      workspacePath,
      type: 'defect',
      reason: `修复记录 ${patchId}：${record.reason}`,
      source: record.source || 'patch-promote',
      operator: String(body.operator || '').trim() || record.operator || 'local-user',
      basedOnCandidateId: body.basedOnCandidateId || body.candidateId,
      affectedSteps: PROMOTION_STEPS,
    });
    const timestamp = nowIso();
    const updated = {
      ...record,
      status: 'promoted',
      changeSetId: change.record.changeSetId,
      promotedAt: timestamp,
      updatedAt: timestamp,
    };
    const index = await readPatchIndex(workspacePath);
    const nextIndex = {
      ...index,
      revision: index.revision + 1,
      patches: index.patches.map((item) => item.patchId === patchId ? {
        ...item,
        status: updated.status,
        changeSetId: updated.changeSetId,
        updatedAt: timestamp,
      } : item),
    };
    await writePatch(workspacePath, updated, nextIndex);
    return { workspacePath, record: updated, changeSet: change.record, index: nextIndex };
  }

  async function readPatchStatus(workspacePathValue) {
    const { workspacePath, patches } = await listPatches(workspacePathValue);
    const active = patches.filter((item) => item.status === 'active');
    const completed = patches.filter((item) => item.status === 'completed');
    const actions = active.length
      ? active.map((item) => ({
        id: `continue-patch:${item.patchId}`,
        status: 'ready',
        title: `继续${item.mode === 'controlled' ? '受控' : '快捷'}修复：${item.patchId}`,
        summary: `${item.scope}。主线节点保持原状；完成后回写真实测试结果。`,
        patchId: item.patchId,
        mode: item.mode,
      }))
      : [{
        id: 'start-patch',
        status: 'available',
        title: '可独立创建局部修复',
        summary: '仅限用户明确授权且范围可控的修复。触发金额、库表、接口、删除、共享组件或归属不明时，必须使用受控修复。',
        patchId: '',
        mode: '',
      }];
    if (completed.length) {
      actions.push(...completed.map((item) => ({
        id: `promote-patch:${item.patchId}`,
        status: 'available',
        title: `进入 Review / Candidate：${item.patchId}`,
        summary: '代码已稳定时再提升为 ChangeSet、Candidate 和正式验证证据。',
        patchId: item.patchId,
        mode: item.mode,
      })));
    }
    return {
      workspacePath,
      activeCount: active.length,
      completedUnpromotedCount: completed.length,
      actions,
    };
  }

  return {
    PATCH_DIR,
    PATCH_INDEX_FILE,
    PATCH_MODES,
    HIGH_RISK_TRIGGERS,
    PROMOTION_STEPS,
    createPatch,
    listPatches,
    getPatch,
    completePatch,
    promotePatch,
    readPatchStatus,
  };
}

module.exports = {
  PATCH_DIR,
  PATCH_INDEX_FILE,
  PATCH_MODES,
  HIGH_RISK_TRIGGERS,
  PROMOTION_STEPS,
  createPatchWorkRuntime,
};
