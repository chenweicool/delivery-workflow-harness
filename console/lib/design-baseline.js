const crypto = require('crypto');

const BASELINE_DIRECTORY = '.workflow/baselines';
const BASELINE_SPECS = [
  { id: 'technical-design', path: 'design/technical-design.md', lock: `${BASELINE_DIRECTORY}/technical-design.lock.json` },
  { id: 'unit-test-design', path: 'design/unit-test-design.md', lock: `${BASELINE_DIRECTORY}/unit-test-design.lock.json` },
  { id: 'smoke-test-design', path: 'design/smoke-test-design.md', lock: `${BASELINE_DIRECTORY}/smoke-test-design.lock.json` },
];

function digest(content) {
  return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
}

function createDesignBaselineRuntime(deps) {
  const { readWorkspaceTextFileIfExists, readJsonFileIfExists, writeWorkspaceJsonFile } = deps;

  async function freezeDesignBaselines(workspacePath, approval = {}) {
    const lockedAt = approval.createdAt || new Date().toISOString();
    const locks = [];
    for (const spec of BASELINE_SPECS) {
      const content = await readWorkspaceTextFileIfExists(workspacePath, spec.path);
      if (!content.trim()) {
        throw new Error(`不能确认技术方案：缺少冻结产物 ${spec.path}`);
      }
      const lock = {
        version: 1,
        baseline: spec.id,
        path: spec.path,
        sha256: digest(content),
        lockedAt,
        approvedBy: approval.operator || 'local-user',
        approvalFile: 'design/technical-design.approved.json',
      };
      await writeWorkspaceJsonFile(workspacePath, spec.lock, lock);
      locks.push(lock);
    }
    return locks;
  }

  async function verifyDesignBaselines(workspacePath) {
    const baselines = [];
    for (const spec of BASELINE_SPECS) {
      const lock = await readJsonFileIfExists(workspacePath, spec.lock);
      const content = await readWorkspaceTextFileIfExists(workspacePath, spec.path);
      const currentDigest = content.trim() ? digest(content) : '';
      const status = !lock
        ? 'missing-lock'
        : !currentDigest
          ? 'missing-source'
          : lock.sha256 === currentDigest
            ? 'unchanged'
            : 'changed';
      baselines.push({ ...spec, status, lock, currentSha256: currentDigest });
    }
    return {
      verifiedAt: new Date().toISOString(),
      status: baselines.every((item) => item.status === 'unchanged') ? 'valid' : 'deviation-required',
      baselines,
    };
  }

  return { BASELINE_DIRECTORY, BASELINE_SPECS, freezeDesignBaselines, verifyDesignBaselines };
}

module.exports = { BASELINE_DIRECTORY, BASELINE_SPECS, createDesignBaselineRuntime };
