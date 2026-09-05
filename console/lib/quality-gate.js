const crypto = require('crypto');
const path = require('path');

const QUALITY_POLICY_FILE = '.workflow/quality-policy.yaml';
const QUALITY_POLICY_LOCK_FILE = '.workflow/quality-policy.lock.json';
const GATES_FILE = '.workflow/gates.json';

const DEFAULT_QUALITY_POLICY = {
  version: 2,
  gates: {
    'requirement-confirmed': {
      title: '需求口径确认',
      approval: 'product-or-demand-owner',
      requires: ['prd/document.md', 'design/process/requirement-confirmation.md'],
    },
    'design-ready': {
      title: '技术方案准入',
      approval: 'tech-owner',
      requires: [
        'design/technical-design.md',
        'design/unit-test-design.md',
        'design/smoke-test-design.md',
        '.workflow/baselines/technical-design.lock.json',
        '.workflow/baselines/unit-test-design.lock.json',
        '.workflow/baselines/smoke-test-design.lock.json',
      ],
    },
    'delivery-verified': {
      title: '交付验证',
      approval: 'quality-or-tech-owner',
      candidateEvidence: ['review', 'unit-test', 'smoke-test'],
      requires: [
        'review/quality-report.md',
        'review/evidence/risk-list.md',
        'review/evidence/unit-test-result.md',
        'review/evidence/traceability-matrix.md',
        'review/evidence/smoke-test-case.md',
        'review/evidence/smoke-test-result.md',
      ],
    },
  },
};

function parseScalar(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text.replace(/\s+#.*$/, '').trim();
}

function parseQualityPolicy(text) {
  const policy = { version: 2, gates: {} };
  let currentGate = null;
  let listField = '';
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    if (indent === 0) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match && match[1] === 'version') policy.version = Number(parseScalar(match[2])) || 2;
      currentGate = null;
      listField = '';
      continue;
    }
    if (indent === 2 && /^gates:\s*$/.test(line)) {
      currentGate = null;
      listField = '';
      continue;
    }
    if (indent === 2) {
      const match = line.match(/^([\w-]+):\s*$/);
      if (match) {
        currentGate = match[1];
        policy.gates[currentGate] = { title: currentGate, approval: '', requires: [], candidateEvidence: [] };
        listField = '';
      }
      continue;
    }
    if (!currentGate) continue;
    if (indent === 4) {
      const match = line.match(/^(title|approval|requires|candidateEvidence):(?:\s*(.*))?$/);
      if (!match) continue;
      if (match[1] === 'requires' || match[1] === 'candidateEvidence') {
        policy.gates[currentGate][match[1]] = [];
        listField = match[1];
      } else {
        policy.gates[currentGate][match[1]] = parseScalar(match[2]);
        listField = '';
      }
      continue;
    }
    if (indent >= 6 && (listField === 'requires' || listField === 'candidateEvidence')) {
      const match = line.match(/^-\s*(.*)$/);
      if (match) policy.gates[currentGate][listField].push(parseScalar(match[1]));
    }
  }
  return policy;
}

function normalizedPolicy(policy) {
  const gates = {};
  for (const [id, raw] of Object.entries((policy && policy.gates) || {})) {
    const requires = Array.isArray(raw.requires) ? raw.requires.map((item) => String(item || '').trim()).filter(Boolean) : [];
    if (!requires.length) continue;
    gates[id] = {
      title: String(raw.title || id).trim(),
      approval: String(raw.approval || '').trim(),
      requires,
      candidateEvidence: Array.isArray(raw.candidateEvidence)
        ? raw.candidateEvidence.map((item) => String(item || '').trim()).filter(Boolean)
        : id === 'delivery-verified'
          ? ['review', 'unit-test', 'smoke-test']
          : [],
    };
  }
  return { version: Number(policy && policy.version) || 2, gates };
}

function policyDigest(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function contentDigest(content) {
  return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
}

function sameApprovalSnapshot(previous, current) {
  if (!previous || previous.policyDigest !== current.policyDigest) return false;
  const before = previous.evidence && typeof previous.evidence === 'object' ? previous.evidence : {};
  const after = current.evidence && typeof current.evidence === 'object' ? current.evidence : {};
  const beforeKeys = Object.keys(before).sort();
  const afterKeys = Object.keys(after).sort();
  if (beforeKeys.join('|') !== afterKeys.join('|')) return false;
  if (beforeKeys.some((key) => before[key] !== after[key])) return false;
  return previous.baselineStatus === current.baselineStatus
    && previous.candidateId === current.candidateId
    && previous.candidateFingerprint === current.candidateFingerprint
    && previous.candidateEvidenceDigest === current.candidateEvidenceDigest;
}

function exceptionIsExpired(exception, now = Date.now()) {
  if (!exception || !exception.expiresAt) return false;
  const expiresAt = Date.parse(exception.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

function createQualityGateRuntime(deps) {
  const {
    normalizeUserPath,
    exists,
    readJsonFileIfExists,
    writeWorkspaceJsonFile,
    readWorkspaceTextFileIfExists,
    verifyDesignBaselines,
    readIterationStatus,
  } = deps;

  async function readQualityPolicy(workspacePathValue) {
    const workspacePath = normalizeUserPath(workspacePathValue || '');
    if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
      throw new Error('当前目录不是有效的 Delivery Workflow workspace');
    }
    const text = await readWorkspaceTextFileIfExists(workspacePath, QUALITY_POLICY_FILE);
    const parsed = text.trim() ? normalizedPolicy(parseQualityPolicy(text)) : DEFAULT_QUALITY_POLICY;
    return {
      workspacePath,
      policy: normalizedPolicy(parsed),
      source: text.trim() ? QUALITY_POLICY_FILE : 'built-in-default',
      digest: policyDigest(text.trim() ? text : JSON.stringify(DEFAULT_QUALITY_POLICY)),
    };
  }

  async function evaluateQualityGates(workspacePathValue) {
    const { workspacePath, policy, source, digest } = await readQualityPolicy(workspacePathValue);
    const previous = await readJsonFileIfExists(workspacePath, GATES_FILE) || { gates: {} };
    const gates = {};
    const designBaselines = Object.prototype.hasOwnProperty.call(policy.gates, 'design-ready')
      ? await verifyDesignBaselines(workspacePath)
      : null;
    const requiresCandidate = Object.values(policy.gates).some((gate) => (gate.candidateEvidence || []).length);
    const iteration = requiresCandidate && readIterationStatus ? await readIterationStatus(workspacePath) : null;
    for (const [id, definition] of Object.entries(policy.gates)) {
      const evidence = [];
      for (const relativePath of definition.requires) {
        const content = await readWorkspaceTextFileIfExists(workspacePath, relativePath);
        evidence.push({ path: relativePath, exists: Boolean(content.trim()), sha256: content.trim() ? contentDigest(content) : '' });
      }
      const missing = evidence.filter((item) => !item.exists).map((item) => item.path);
      const prior = previous.gates && previous.gates[id] ? previous.gates[id] : {};
      const priorStatus = String(prior.status || 'pending');
      const baselineStatus = id === 'design-ready' && designBaselines ? designBaselines.status : 'not-applicable';
      const candidateRequirements = definition.candidateEvidence || [];
      const candidateIssues = [];
      let candidateBinding = { candidateId: '', fingerprint: '', evidence: [] };
      if (candidateRequirements.length) {
        if (!iteration || !iteration.activeCandidate) {
          candidateIssues.push('缺少当前 Candidate；Review、单测和冒烟证据不能脱离代码候选单独放行。');
        } else if (iteration.candidateStatus !== 'valid') {
          candidateIssues.push(`当前 Candidate 已失效：${iteration.activeCandidate.candidateId}`);
        } else {
          const candidate = iteration.activeCandidate;
          const boundEvidence = [];
          for (const kind of candidateRequirements) {
            const matched = (candidate.evidence || []).filter((item) => item.kind === kind && ['passed', 'waived-with-approval'].includes(item.status));
            if (!matched.length) {
              candidateIssues.push(`缺少绑定 ${candidate.candidateId} 的 ${kind} 证据。`);
              continue;
            }
            for (const item of matched) {
              const currentEvidence = await readWorkspaceTextFileIfExists(workspacePath, item.path);
              if (!currentEvidence.trim() || contentDigest(currentEvidence) !== item.sha256) {
                candidateIssues.push(`已绑定的 ${kind} 证据已变化或缺失：${item.path}`);
              }
              boundEvidence.push({ evidenceId: item.evidenceId, kind: item.kind, path: item.path, sha256: item.sha256, status: item.status });
            }
          }
          candidateBinding = { candidateId: candidate.candidateId, fingerprint: candidate.fingerprint, evidence: boundEvidence };
        }
      }
      const approvalSnapshot = {
        policyDigest: digest,
        evidence: Object.fromEntries(evidence.map((item) => [item.path, item.sha256])),
        baselineStatus,
        candidateId: candidateBinding.candidateId,
        candidateFingerprint: candidateBinding.fingerprint,
        candidateEvidenceDigest: contentDigest(JSON.stringify(candidateBinding.evidence)),
      };
      const wasApproved = ['approved', 'exception-approved'].includes(priorStatus);
      const staleReasons = [];
      if (wasApproved && !sameApprovalSnapshot(prior.approvalSnapshot, approvalSnapshot)) {
        staleReasons.push('门禁策略或已确认的证据内容已变化。');
      }
      if (priorStatus === 'exception-approved' && exceptionIsExpired(prior.exception)) {
        staleReasons.push('例外放行已过期。');
      }
      if (id === 'design-ready' && baselineStatus !== 'valid') {
        staleReasons.push('技术方案、单测设计或冒烟测试设计基线已漂移。');
      }
      const status = missing.length || candidateIssues.length
        ? 'blocked'
        : staleReasons.length
          ? 'stale'
        : ['approved', 'exception-approved'].includes(priorStatus)
          ? priorStatus
          : priorStatus === 'rejected'
            ? 'rejected'
            : priorStatus === 'stale'
              ? 'stale'
            : 'ready-for-approval';
      gates[id] = {
        id,
        title: definition.title,
        approval: definition.approval,
        status,
        evidence,
        missing,
        candidate: {
          requiredEvidence: candidateRequirements,
          binding: candidateBinding,
          issues: candidateIssues,
        },
        staleReasons,
        baselineVerification: id === 'design-ready' ? designBaselines : null,
        approvalSnapshot,
        approvalRecord: prior.approvalRecord || null,
        rejectionRecord: prior.rejectionRecord || null,
        exception: prior.exception || null,
      };
    }
    const summary = {
      generatedAt: new Date().toISOString(),
      policy: { version: policy.version, source, digest },
      gates,
      status: Object.values(gates).some((gate) => ['blocked', 'rejected', 'stale'].includes(gate.status))
        ? 'blocked'
        : Object.values(gates).every((gate) => ['approved', 'exception-approved'].includes(gate.status))
          ? 'approved'
          : 'waiting-for-approval',
    };
    await writeWorkspaceJsonFile(workspacePath, QUALITY_POLICY_LOCK_FILE, {
      version: policy.version,
      source,
      digest,
      lockedAt: summary.generatedAt,
    });
    await writeWorkspaceJsonFile(workspacePath, GATES_FILE, summary);
    return summary;
  }

  async function submitQualityGate({ workspacePath: workspacePathValue, gateId, action, note, operator, exceptionExpiresAt }) {
    const workspacePath = normalizeUserPath(workspacePathValue || '');
    const current = await evaluateQualityGates(workspacePath);
    const id = String(gateId || '').trim();
    const gate = current.gates[id];
    if (!gate) throw new Error(`未知质量门禁：${id}`);
    const normalizedAction = String(action || '').trim();
    if (!['approve', 'reject', 'exception'].includes(normalizedAction)) {
      throw new Error('质量门禁操作仅支持 approve、reject 或 exception');
    }
    if (normalizedAction === 'approve' && (gate.missing.length || gate.staleReasons.length || gate.candidate.issues.length)) {
      throw new Error(`门禁当前不可批准：${[...gate.missing, ...gate.staleReasons, ...gate.candidate.issues].join('、')}`);
    }
    if (normalizedAction === 'exception' && (!String(note || '').trim() || !String(exceptionExpiresAt || '').trim())) {
      throw new Error('例外放行必须填写原因和过期时间');
    }
    if (normalizedAction === 'exception' && exceptionIsExpired({ expiresAt: String(exceptionExpiresAt).trim() })) {
      throw new Error('例外放行的过期时间必须晚于当前时间');
    }
    const record = { operator: String(operator || '').trim() || 'local-user', note: String(note || '').trim(), at: new Date().toISOString() };
    if (normalizedAction === 'approve') {
      gate.status = 'approved';
      gate.approvalRecord = record;
      gate.rejectionRecord = null;
      gate.exception = null;
    } else if (normalizedAction === 'reject') {
      gate.status = 'rejected';
      gate.rejectionRecord = record;
      gate.approvalRecord = null;
      gate.exception = null;
    } else {
      gate.status = 'exception-approved';
      gate.exception = { ...record, expiresAt: String(exceptionExpiresAt).trim() };
    }
    current.generatedAt = record.at;
    current.status = Object.values(current.gates).some((item) => ['blocked', 'rejected', 'stale'].includes(item.status))
      ? 'blocked'
      : Object.values(current.gates).every((item) => ['approved', 'exception-approved'].includes(item.status))
        ? 'approved'
        : 'waiting-for-approval';
    await writeWorkspaceJsonFile(workspacePath, GATES_FILE, current);
    return current;
  }

  return { QUALITY_POLICY_FILE, QUALITY_POLICY_LOCK_FILE, GATES_FILE, parseQualityPolicy, readQualityPolicy, evaluateQualityGates, submitQualityGate };
}

module.exports = { QUALITY_POLICY_FILE, QUALITY_POLICY_LOCK_FILE, GATES_FILE, DEFAULT_QUALITY_POLICY, createQualityGateRuntime };
