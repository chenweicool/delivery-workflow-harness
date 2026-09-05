const crypto = require('crypto');
const path = require('path');

const CHANGESET_INDEX_FILE = '.workflow/changesets/index.json';
const CHANGESET_DIR = '.workflow/changesets';
const CANDIDATE_INDEX_FILE = '.workflow/candidates/index.json';
const CANDIDATE_DIR = '.workflow/candidates';

const CHANGE_TYPES = new Set(['feature', 'requirement-change', 'design-change', 'defect', 'verification-only', 'hotfix']);
const EVIDENCE_KINDS = new Set(['review', 'unit-test', 'smoke-test', 'uat', 'traceability', 'capacity', 'release-approval']);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function normalizeStringList(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(new Set(source.map((item) => String(item || '').trim()).filter(Boolean)));
}

function nextId(index, prefix) {
  const next = Number(index.nextSequence || 0) + 1;
  index.nextSequence = next;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

function changePrefix(type) {
  return {
    feature: 'FEAT',
    'requirement-change': 'CR',
    'design-change': 'DESIGN',
    defect: 'BUG',
    'verification-only': 'VERIFY',
    hotfix: 'HOTFIX',
  }[type] || 'CS';
}

function emptyChangeIndex() {
  return { schemaVersion: 1, revision: 0, nextSequence: 0, activeChangeSetId: '', changeSets: [] };
}

function emptyCandidateIndex() {
  return { schemaVersion: 1, revision: 0, nextSequence: 0, activeCandidateId: '', candidates: [] };
}

function recordPath(directory, id) {
  return `${directory}/${id}.json`;
}

function createChangeCandidateRuntime(deps) {
  const {
    normalizeUserPath,
    exists,
    readJsonFileIfExists,
    writeWorkspaceJsonFile,
    readWorkspaceTextFileIfExists,
    readWorkspaceConfig,
    readWorkflowDefinition,
    transitionSteps,
    workflowStepSequence,
    verifyDesignBaselines,
    gitHead,
    gitOutputSafe,
    nowIso,
  } = deps;

  async function assertWorkspace(workspacePathValue) {
    const workspacePath = normalizeUserPath(workspacePathValue || '');
    if (!workspacePath || !(await exists(path.join(workspacePath, 'AGENTS.md')))) {
      throw new Error('请选择有效的 Delivery Workflow workspace');
    }
    return workspacePath;
  }

  async function readChangeIndex(workspacePath) {
    const stored = await readJsonFileIfExists(workspacePath, CHANGESET_INDEX_FILE);
    return {
      ...emptyChangeIndex(),
      ...(stored && typeof stored === 'object' ? stored : {}),
      changeSets: Array.isArray(stored && stored.changeSets) ? stored.changeSets : [],
    };
  }

  async function readCandidateIndex(workspacePath) {
    const stored = await readJsonFileIfExists(workspacePath, CANDIDATE_INDEX_FILE);
    return {
      ...emptyCandidateIndex(),
      ...(stored && typeof stored === 'object' ? stored : {}),
      candidates: Array.isArray(stored && stored.candidates) ? stored.candidates : [],
    };
  }

  async function writeChangeRecord(workspacePath, record, index) {
    await writeWorkspaceJsonFile(workspacePath, recordPath(CHANGESET_DIR, record.changeSetId), record);
    await writeWorkspaceJsonFile(workspacePath, CHANGESET_INDEX_FILE, index);
  }

  async function writeCandidateRecord(workspacePath, record, index) {
    await writeWorkspaceJsonFile(workspacePath, recordPath(CANDIDATE_DIR, record.candidateId), record);
    await writeWorkspaceJsonFile(workspacePath, CANDIDATE_INDEX_FILE, index);
  }

  async function getChangeSet(workspacePathValue, changeSetId) {
    const workspacePath = await assertWorkspace(workspacePathValue);
    const id = String(changeSetId || '').trim();
    if (!id) return null;
    return readJsonFileIfExists(workspacePath, recordPath(CHANGESET_DIR, id));
  }

  async function getCandidate(workspacePathValue, candidateId) {
    const workspacePath = await assertWorkspace(workspacePathValue);
    const id = String(candidateId || '').trim();
    if (!id) return null;
    return readJsonFileIfExists(workspacePath, recordPath(CANDIDATE_DIR, id));
  }

  async function listChangeSets(workspacePathValue) {
    const workspacePath = await assertWorkspace(workspacePathValue);
    const index = await readChangeIndex(workspacePath);
    return { workspacePath, ...index };
  }

  async function listCandidates(workspacePathValue) {
    const workspacePath = await assertWorkspace(workspacePathValue);
    const index = await readCandidateIndex(workspacePath);
    return { workspacePath, ...index };
  }

  async function createChangeSet(body = {}) {
    const workspacePath = await assertWorkspace(body.workspacePath);
    const type = String(body.type || 'feature').trim();
    const reason = String(body.reason || '').trim();
    if (!CHANGE_TYPES.has(type)) throw new Error(`不支持的 ChangeSet 类型：${type}`);
    if (!reason) throw new Error('创建 ChangeSet 必须填写变更原因');
    const index = await readChangeIndex(workspacePath);
    const basedOnCandidateId = String(body.basedOnCandidateId || body.candidateId || index.activeCandidateId || '').trim();
    if (basedOnCandidateId && !(await getCandidate(workspacePath, basedOnCandidateId))) {
      throw new Error(`未找到基于的 Candidate：${basedOnCandidateId}`);
    }
    const workflow = await readWorkflowDefinition(workspacePath);
    const sequence = workflowStepSequence(workflow);
    const requestedAffectedSteps = normalizeStringList(body.affectedSteps);
    const startStep = {
      feature: 'import-prd',
      'requirement-change': '01-clarify-requirement',
      'design-change': '02-generate-technical-design',
      defect: '06-implement-task',
      'verification-only': '07-review-code',
      hotfix: '06-implement-task',
    }[type];
    const startIndex = sequence.findIndex((item) => item.id === startStep);
    const affectedSteps = requestedAffectedSteps.length
      ? requestedAffectedSteps
      : sequence.slice(Math.max(0, startIndex)).map((item) => item.id);
    const createdAt = nowIso();
    const changeSetId = nextId(index, changePrefix(type));
    const record = {
      schemaVersion: 1,
      changeSetId,
      type,
      status: 'open',
      reason,
      source: String(body.source || '').trim(),
      operator: String(body.operator || '').trim() || 'local-user',
      basedOnCandidateId,
      targetCandidateId: '',
      affectedSteps,
      createdAt,
      updatedAt: createdAt,
    };
    index.revision = Number(index.revision || 0) + 1;
    index.changeSets = [...index.changeSets, {
      changeSetId,
      type,
      status: record.status,
      reason,
      basedOnCandidateId,
      targetCandidateId: '',
      createdAt,
      updatedAt: createdAt,
    }];
    if (body.activate !== false) index.activeChangeSetId = changeSetId;
    await writeChangeRecord(workspacePath, record, index);
    return { workspacePath, record, index };
  }

  async function getChangeImpact(workspacePathValue, changeSetId) {
    const workspacePath = await assertWorkspace(workspacePathValue);
    const record = await getChangeSet(workspacePath, changeSetId);
    if (!record) throw new Error(`未找到 ChangeSet：${changeSetId}`);
    const workflow = await readWorkflowDefinition(workspacePath);
    const affectedSteps = record.affectedSteps || [];
    const manualApprovals = affectedSteps
      .map((stepId) => workflow.steps[stepId])
      .filter((definition) => definition && definition.kind === 'manual' && definition.approvalFile)
      .map((definition) => definition.approvalFile);
    const gateByStep = {
      'manual-requirement': 'requirement-confirmed',
      'manual-technical': 'design-ready',
      '07-review-code': 'delivery-verified',
    };
    const gates = Array.from(new Set(affectedSteps.map((stepId) => gateByStep[stepId]).filter(Boolean)));
    return {
      workspacePath,
      changeSet: record,
      impact: {
        affectedSteps,
        approvalsToSupersede: manualApprovals,
        gatesToRecheck: gates,
        candidateAction: record.type === 'verification-only'
          ? '复用基于 Candidate 并补充绑定证据；若候选快照变化则新建 Candidate。'
          : '生成新的 Candidate；旧 Candidate 与证据保留并标记为已替代。',
      },
    };
  }

  async function collectRepositorySnapshot(workspacePath, config) {
    const repositories = {};
    for (const app of Array.isArray(config.apps) ? config.apps : []) {
      const name = String(app.name || app.repoKey || path.basename(app.sourcePath || '')).trim();
      if (!name) continue;
      const workspaceWorktree = app.worktreePath ? path.join(workspacePath, app.worktreePath) : '';
      const repositoryPath = workspaceWorktree && await exists(path.join(workspaceWorktree, '.git'))
        ? workspaceWorktree
        : String(app.sourcePath || '').trim();
      const isGit = repositoryPath && await exists(path.join(repositoryPath, '.git'));
      if (!isGit) {
        repositories[name] = { path: repositoryPath, status: 'not-git-or-unavailable', baseCommit: '', headCommit: '', diffHash: '' };
        continue;
      }
      const headCommit = await gitHead(repositoryPath);
      const baseBranch = String(app.baseBranch || '').trim();
      const baseCommit = baseBranch
        ? await gitOutputSafe(['merge-base', 'HEAD', baseBranch], repositoryPath)
        : '';
      const workingTree = await gitOutputSafe(['status', '--porcelain=v1'], repositoryPath);
      const unstagedDiff = await gitOutputSafe(['diff', '--binary', 'HEAD'], repositoryPath);
      const stagedDiff = await gitOutputSafe(['diff', '--binary', '--cached'], repositoryPath);
      repositories[name] = {
        path: repositoryPath,
        status: 'captured',
        baseCommit: baseCommit.startsWith('[git command failed]') ? '' : baseCommit,
        headCommit,
        workingTree,
        diffHash: sha256(`${workingTree}\n${unstagedDiff}\n${stagedDiff}`),
      };
    }
    return repositories;
  }

  async function collectCandidateSnapshot(workspacePath) {
    const config = await readWorkspaceConfig(workspacePath);
    const prd = await readWorkspaceTextFileIfExists(workspacePath, 'prd/document.md');
    const baselines = await verifyDesignBaselines(workspacePath);
    const designLocks = {};
    for (const baseline of baselines.baselines || []) {
      designLocks[baseline.id] = baseline.lock && baseline.lock.sha256 ? baseline.lock.sha256 : '';
    }
    const repositories = await collectRepositorySnapshot(workspacePath, config);
    const snapshot = {
      prdSha256: prd.trim() ? sha256(prd) : '',
      designBaselineStatus: baselines.status,
      designLocks,
      repositories,
    };
    return { snapshot, fingerprint: sha256(JSON.stringify(snapshot)) };
  }

  async function createCandidate(body = {}) {
    const workspacePath = await assertWorkspace(body.workspacePath);
    const changeIndex = await readChangeIndex(workspacePath);
    const requestedIds = normalizeStringList(body.changeSetIds || body.changeSetId);
    const changeSetIds = requestedIds.length ? requestedIds : (changeIndex.activeChangeSetId ? [changeIndex.activeChangeSetId] : []);
    for (const changeSetId of changeSetIds) {
      const changeSet = await getChangeSet(workspacePath, changeSetId);
      if (!changeSet) throw new Error(`未找到 ChangeSet：${changeSetId}`);
      if (!['open', 'in-progress'].includes(changeSet.status)) throw new Error(`ChangeSet 不能生成 Candidate：${changeSetId} / ${changeSet.status}`);
    }
    const index = await readCandidateIndex(workspacePath);
    const createdAt = nowIso();
    const candidateId = nextId(index, 'C');
    const captured = await collectCandidateSnapshot(workspacePath);
    const record = {
      schemaVersion: 1,
      candidateId,
      status: 'active',
      title: String(body.title || '').trim() || `交付候选 ${candidateId}`,
      changeSetIds,
      prdVersion: String(body.prdVersion || '').trim(),
      snapshot: captured.snapshot,
      fingerprint: captured.fingerprint,
      evidence: [],
      createdBy: String(body.operator || '').trim() || 'local-user',
      createdAt,
      updatedAt: createdAt,
    };
    const previousActiveId = index.activeCandidateId;
    if (previousActiveId && previousActiveId !== candidateId) {
      const previous = await getCandidate(workspacePath, previousActiveId);
      if (previous && previous.status === 'active') {
        previous.status = 'superseded';
        previous.supersededByCandidateId = candidateId;
        previous.updatedAt = createdAt;
        await writeWorkspaceJsonFile(workspacePath, recordPath(CANDIDATE_DIR, previousActiveId), previous);
      }
    }
    index.revision = Number(index.revision || 0) + 1;
    index.activeCandidateId = candidateId;
    index.candidates = [...index.candidates.map((item) => item.candidateId === previousActiveId ? {
      ...item,
      status: 'superseded',
      supersededByCandidateId: candidateId,
      updatedAt: createdAt,
    } : item), {
      candidateId,
      status: record.status,
      title: record.title,
      changeSetIds,
      fingerprint: record.fingerprint,
      createdAt,
      updatedAt: createdAt,
    }];
    for (const changeSetId of changeSetIds) {
      const changeSet = await getChangeSet(workspacePath, changeSetId);
      changeSet.targetCandidateId = candidateId;
      changeSet.status = 'in-progress';
      changeSet.updatedAt = createdAt;
      await writeWorkspaceJsonFile(workspacePath, recordPath(CHANGESET_DIR, changeSetId), changeSet);
      indexChangeSummary(changeIndex, changeSet);
    }
    if (changeSetIds.length) {
      changeIndex.revision = Number(changeIndex.revision || 0) + 1;
      await writeWorkspaceJsonFile(workspacePath, CHANGESET_INDEX_FILE, changeIndex);
    }
    await writeCandidateRecord(workspacePath, record, index);
    return { workspacePath, record, index };
  }

  function indexChangeSummary(index, record) {
    index.changeSets = index.changeSets.map((item) => item.changeSetId === record.changeSetId ? {
      ...item,
      status: record.status,
      targetCandidateId: record.targetCandidateId,
      updatedAt: record.updatedAt,
    } : item);
  }

  async function verifyCandidate(workspacePathValue, candidateId) {
    const workspacePath = await assertWorkspace(workspacePathValue);
    const record = await getCandidate(workspacePath, candidateId);
    if (!record) throw new Error(`未找到 Candidate：${candidateId}`);
    const captured = await collectCandidateSnapshot(workspacePath);
    return {
      workspacePath,
      candidateId: record.candidateId,
      status: record.status === 'active' && record.fingerprint === captured.fingerprint ? 'valid' : 'stale',
      record,
      currentFingerprint: captured.fingerprint,
      currentSnapshot: captured.snapshot,
    };
  }

  async function recordCandidateEvidence(body = {}) {
    const workspacePath = await assertWorkspace(body.workspacePath);
    const candidateId = String(body.candidateId || '').trim();
    const kind = String(body.kind || '').trim();
    const evidencePath = String(body.path || '').trim().replace(/\\/g, '/');
    if (!candidateId || !kind || !evidencePath) throw new Error('记录 Candidate 证据必须提供 candidate、kind 和 path');
    if (!EVIDENCE_KINDS.has(kind)) throw new Error(`不支持的证据类型：${kind}`);
    const verification = await verifyCandidate(workspacePath, candidateId);
    if (verification.status !== 'valid') throw new Error(`Candidate 已失效，不能绑定新证据：${candidateId}`);
    const content = await readWorkspaceTextFileIfExists(workspacePath, evidencePath);
    if (!content.trim()) throw new Error(`证据文件不存在或为空：${evidencePath}`);
    const record = verification.record;
    const createdAt = nowIso();
    const evidence = {
      evidenceId: `${candidateId}-${kind}-${String((record.evidence || []).length + 1).padStart(3, '0')}`,
      kind,
      path: evidencePath,
      sha256: sha256(content),
      status: String(body.status || 'passed').trim() || 'passed',
      environment: String(body.environment || '').trim(),
      scope: String(body.scope || '').trim(),
      operator: String(body.operator || '').trim() || 'local-user',
      note: String(body.note || '').trim(),
      candidateFingerprint: record.fingerprint,
      createdAt,
    };
    const existingEvidence = (record.evidence || []).find((item) => item.kind === evidence.kind
      && item.path === evidence.path
      && item.sha256 === evidence.sha256
      && item.status === evidence.status
      && item.candidateFingerprint === evidence.candidateFingerprint);
    if (existingEvidence) {
      return { workspacePath, candidate: record, evidence: existingEvidence, idempotent: true };
    }
    record.evidence = [...(record.evidence || []), evidence];
    record.updatedAt = createdAt;
    const index = await readCandidateIndex(workspacePath);
    index.revision = Number(index.revision || 0) + 1;
    index.candidates = index.candidates.map((item) => item.candidateId === candidateId ? { ...item, updatedAt: createdAt, evidenceCount: record.evidence.length } : item);
    await writeCandidateRecord(workspacePath, record, index);
    return { workspacePath, candidate: record, evidence };
  }

  async function reopenChange(body = {}) {
    const workspacePath = await assertWorkspace(body.workspacePath);
    const fromStepId = String(body.fromStepId || body.from || '').trim();
    const reason = String(body.reason || '').trim();
    if (!fromStepId || !reason) throw new Error('重开流程必须提供 fromStepId 和 reason');
    const workflow = await readWorkflowDefinition(workspacePath);
    const sequence = workflowStepSequence(workflow);
    const start = sequence.findIndex((item) => item.id === fromStepId);
    if (start < 0) throw new Error(`未知 Workflow 节点：${fromStepId}`);
    const requestedChangeSetId = String(body.changeSetId || body.changeSet || '').trim();
    let changeSet = requestedChangeSetId ? await getChangeSet(workspacePath, requestedChangeSetId) : null;
    if (requestedChangeSetId && !changeSet) throw new Error(`ChangeSet 不存在：${requestedChangeSetId}`);
    const updatedAt = nowIso();
    const gateStartStep = {
      'requirement-confirmed': 'manual-requirement',
      'design-ready': 'manual-technical',
      'delivery-verified': '07-review-code',
    };
    const reopenedSteps = sequence.slice(start).map((item) => item.id);
    const transitions = reopenedSteps.map((stepId) => ({ stepId, status: 'pending', summary: `重开请求：${reason}` }));
    const transition = await transitionSteps({
      workspacePath,
      workflow,
      eventType: 'change-reopen',
      transitions,
      actor: String(body.operator || '').trim() || 'local-user',
      changeSetId: changeSet ? changeSet.changeSetId : '',
      expectedRevision: body.expectedRevision === undefined ? body.revision : body.expectedRevision,
      idempotencyKey: String(body.idempotencyKey || body.idempotency || '').trim(),
      metadata: { reason, fromStepId, reopenedSteps },
      beforeCommit: async () => {
        if (!changeSet) {
          const created = await createChangeSet({
            workspacePath,
            type: body.type || 'design-change',
            reason,
            source: body.source || 'dw reopen',
            operator: body.operator,
            affectedSteps: reopenedSteps,
          });
          changeSet = created.record;
        }
        const summary = `由 ${changeSet.changeSetId} 重开：${reason}`;
        transitions.forEach((item) => { item.summary = summary; });
        for (const step of sequence.slice(start)) {
          const definition = workflow.steps[step.id];
          if (definition && definition.kind === 'manual' && definition.approvalFile) {
            const approval = await readJsonFileIfExists(workspacePath, definition.approvalFile);
            if (approval && approval.status !== 'superseded') {
              await writeWorkspaceJsonFile(workspacePath, definition.approvalFile, {
                ...approval,
                status: 'superseded',
                supersededByChangeSetId: changeSet.changeSetId,
                supersededAt: updatedAt,
                supersedeReason: reason,
              });
            }
          }
        }
        const gates = await readJsonFileIfExists(workspacePath, '.workflow/gates.json');
        if (gates && gates.gates && typeof gates.gates === 'object') {
          for (const [gateId, gate] of Object.entries(gates.gates)) {
            const gateStepIndex = sequence.findIndex((item) => item.id === gateStartStep[gateId]);
            if (gateStepIndex >= start && ['approved', 'exception-approved'].includes(gate.status)) {
              gate.status = 'stale';
              gate.supersededByChangeSetId = changeSet.changeSetId;
              gate.supersededAt = updatedAt;
              gate.staleReasons = Array.from(new Set([...(gate.staleReasons || []), summary]));
            }
          }
          gates.generatedAt = updatedAt;
          await writeWorkspaceJsonFile(workspacePath, '.workflow/gates.json', gates);
        }
        const candidateIndex = await readCandidateIndex(workspacePath);
        if (candidateIndex.activeCandidateId) {
          const candidate = await getCandidate(workspacePath, candidateIndex.activeCandidateId);
          if (candidate && candidate.status === 'active') {
            candidate.status = 'superseded';
            candidate.supersededByChangeSetId = changeSet.changeSetId;
            candidate.supersededAt = updatedAt;
            candidate.updatedAt = updatedAt;
            await writeWorkspaceJsonFile(workspacePath, recordPath(CANDIDATE_DIR, candidate.candidateId), candidate);
          }
          candidateIndex.candidates = candidateIndex.candidates.map((item) => item.candidateId === candidateIndex.activeCandidateId ? { ...item, status: 'superseded', updatedAt } : item);
          candidateIndex.activeCandidateId = '';
          candidateIndex.revision = Number(candidateIndex.revision || 0) + 1;
          await writeWorkspaceJsonFile(workspacePath, CANDIDATE_INDEX_FILE, candidateIndex);
        }
        return { changeSetId: changeSet.changeSetId };
      },
    });
    if (!changeSet && transition.event && transition.event.changeSetId) {
      changeSet = await getChangeSet(workspacePath, transition.event.changeSetId);
    }
    return { workspacePath, changeSet, reopenedSteps, transition };
  }

  async function readIterationStatus(workspacePathValue) {
    const workspacePath = await assertWorkspace(workspacePathValue);
    const changes = await readChangeIndex(workspacePath);
    const candidates = await readCandidateIndex(workspacePath);
    const activeCandidate = candidates.activeCandidateId ? await getCandidate(workspacePath, candidates.activeCandidateId) : null;
    const candidateVerification = activeCandidate ? await verifyCandidate(workspacePath, activeCandidate.candidateId) : null;
    return {
      activeChangeSetId: changes.activeChangeSetId || '',
      activeCandidateId: candidates.activeCandidateId || '',
      activeCandidate: activeCandidate || null,
      candidateStatus: candidateVerification ? candidateVerification.status : 'none',
      changeSetCount: changes.changeSets.length,
      candidateCount: candidates.candidates.length,
    };
  }

  return {
    CHANGESET_INDEX_FILE,
    CANDIDATE_INDEX_FILE,
    CHANGE_TYPES,
    EVIDENCE_KINDS,
    createChangeSet,
    listChangeSets,
    getChangeSet,
    getChangeImpact,
    createCandidate,
    listCandidates,
    getCandidate,
    verifyCandidate,
    recordCandidateEvidence,
    reopenChange,
    readIterationStatus,
  };
}

module.exports = {
  CHANGESET_INDEX_FILE,
  CANDIDATE_INDEX_FILE,
  CHANGE_TYPES,
  EVIDENCE_KINDS,
  createChangeCandidateRuntime,
};
