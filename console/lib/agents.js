const path = require('path');

const AGENT_CONTRACTS = {
  delivery: {
    name: '交付 Agent',
    role: '围绕用户目标自主理解、实现、Review、测试和修复，以真实工具证据生成三份正式交付物。',
    sessionPolicy: '同一 Work Run 内可反复修改和验证；只有高风险决策或缺少外部权限时暂停。',
    requiredOutputs: ['delivery/unit-test-report.md', 'delivery/coverage-report.md', 'delivery/release-config.yaml'],
  },
};

function agentContractForStep(stepId) {
  return stepId === 'execute-delivery' ? { id: 'delivery', ...AGENT_CONTRACTS.delivery } : null;
}

function slugifySessionPart(value, fallback = 'session') {
  const slug = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42);
  return slug || fallback;
}

function workflowStepSequence(workflow) {
  return (workflow.units || []).flatMap((unit) => unit.steps || []).map((stepId) => ({ id: stepId, step: workflow.steps[stepId] })).filter((item) => item.step);
}

function findReturnStepId(workflow, stepId) {
  const sequence = workflowStepSequence(workflow);
  const currentIndex = sequence.findIndex((step) => step.id === stepId);
  const nextStep = currentIndex >= 0 ? sequence[currentIndex + 1] : null;
  return nextStep && nextStep.step.kind === 'manual' ? nextStep.id : stepId;
}

function agentSessionKey(unitId, stepId, taskId, agent) {
  return [slugifySessionPart(unitId || 'workspace'), slugifySessionPart(stepId || 'step'), slugifySessionPart(taskId || 'run'), agent === 'claude' ? 'claude' : 'codex'].join('|');
}

function buildAgentSessionName(workspacePath, unitId, stepId, taskId, agent) {
  return ['dw', slugifySessionPart(path.basename(workspacePath), 'workspace'), slugifySessionPart(unitId || stepId, 'run'), taskId ? slugifySessionPart(taskId, 'task') : '', agent === 'claude' ? 'claude' : 'codex'].filter(Boolean).join('-').slice(0, 120);
}

function findAgentSession(agentSessions, unitId, stepId, taskId, agent) {
  if (!agentSessions || !agentSessions.current) return null;
  return agentSessions.current[agentSessionKey(unitId, stepId, taskId, agent)] || null;
}

module.exports = { AGENT_CONTRACTS, agentContractForStep, findReturnStepId, agentSessionKey, buildAgentSessionName, findAgentSession };
