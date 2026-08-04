const path = require('path');

const AGENT_CONTRACTS = {
  'requirement-analyst': {
    name: '需求分析 Agent',
    role: '把原始需求材料整理成可确认的 PRD、上下文摘要和需求口径。',
    sessionPolicy: '可在同一会话内多轮澄清；最终以结构化文件回写为准。',
    requiredOutputs: ['prd/document.md', 'design/context-summary.md', 'design/requirement-confirmation.md'],
  },
  'technical-designer': {
    name: '技术方案 Agent',
    role: '基于已确认需求、团队模板和真实代码生成可进入拆分的技术方案。',
    sessionPolicy: '建议独立或延续需求会话；必须先读取需求确认产物。',
    requiredOutputs: ['design/technical-design.md', 'design/unit-test-design.md', 'design/smoke-test-design.md', 'design/technical-confirmation.md'],
  },
  'coding-implementer': {
    name: '编码实现 Agent',
    role: '基于已确认技术方案和任务清单逐项实现，并留下变更证据。',
    sessionPolicy: '可按任务连续会话；每个任务完成后必须回写进度和自检。',
    requiredOutputs: ['tasks/task-progress.md', 'review/change-log.md', 'review/self-check.md'],
  },
  reviewer: {
    name: 'Review Agent',
    role: '围绕当前 diff、方案和任务记录做质量审查，输出风险和修复建议。',
    sessionPolicy: '建议使用独立会话，降低实现阶段上下文偏见。',
    requiredOutputs: ['review/ai-review.md', 'review/risk-list.md'],
  },
  tester: {
    name: '测试 Agent',
    role: '生成测试策略、单测建议和执行记录，补齐质量门禁证据。',
    sessionPolicy: '可接续 Review 会话，也可独立执行。',
    requiredOutputs: ['review/unit-test-result.md', 'review/traceability-matrix.md', 'review/smoke-test-result.md'],
  },
  archivist: {
    name: '归档 Agent',
    role: '整理上线清单、交付总结和可复用知识卡片。',
    sessionPolicy: '建议独立会话，只消费最终交付证据。',
    requiredOutputs: ['delivery/release-checklist.md', 'delivery/delivery-summary.md', 'archive/knowledge-card.md'],
  },
};

function agentContractForStep(stepId) {
  if (['import-prd', '00-load-context', '01-clarify-requirement'].includes(stepId)) {
    return { id: 'requirement-analyst', ...AGENT_CONTRACTS['requirement-analyst'] };
  }
  if (['02-generate-technical-design', '03-design-tests'].includes(stepId)) {
    return { id: 'technical-designer', ...AGENT_CONTRACTS['technical-designer'] };
  }
  if (['05-split-tasks', '06-implement-task'].includes(stepId)) {
    return { id: 'coding-implementer', ...AGENT_CONTRACTS['coding-implementer'] };
  }
  if (stepId === '07-review-code') {
    return { id: 'reviewer', ...AGENT_CONTRACTS.reviewer };
  }
  if (['08-verify-tests', '09-run-smoke'].includes(stepId)) {
    return { id: 'tester', ...AGENT_CONTRACTS.tester };
  }
  if (['09-release-checklist', '08-delivery-summary', '10-archive-knowledge'].includes(stepId)) {
    return { id: 'archivist', ...AGENT_CONTRACTS.archivist };
  }
  return null;
}

function slugifySessionPart(value, fallback = 'session') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return slug || fallback;
}

function workflowStepSequence(workflow) {
  return (workflow.units || [])
    .flatMap((unit) => unit.steps || [])
    .map((stepId) => ({ id: stepId, step: workflow.steps[stepId] }))
    .filter((item) => item.step);
}

function findReturnStepId(workflow, stepId) {
  const sequence = workflowStepSequence(workflow);
  const currentIndex = sequence.findIndex((step) => step.id === stepId);
  const nextStep = currentIndex >= 0 ? sequence[currentIndex + 1] : null;
  if (nextStep && workflow.steps[nextStep.id] && workflow.steps[nextStep.id].kind === 'manual') {
    return nextStep.id;
  }
  return stepId;
}

function agentSessionKey(unitId, stepId, taskId, agent) {
  return [
    slugifySessionPart(unitId || 'workspace'),
    slugifySessionPart(stepId || 'step'),
    slugifySessionPart(taskId || 'stage'),
    agent === 'claude' ? 'claude' : 'codex',
  ].join('|');
}

function buildAgentSessionName(workspacePath, unitId, stepId, taskId, agent) {
  return [
    'dw',
    slugifySessionPart(path.basename(workspacePath), 'workspace'),
    slugifySessionPart(unitId || stepId, 'stage'),
    taskId ? slugifySessionPart(taskId, 'task') : '',
    agent === 'claude' ? 'claude' : 'codex',
  ].filter(Boolean).join('-').slice(0, 120);
}

function findAgentSession(agentSessions, unitId, stepId, taskId, agent) {
  if (!agentSessions || !agentSessions.current) {
    return null;
  }
  const key = agentSessionKey(unitId, stepId, taskId, agent);
  return agentSessions.current[key] || null;
}

module.exports = {
  AGENT_CONTRACTS,
  agentContractForStep,
  findReturnStepId,
  agentSessionKey,
  buildAgentSessionName,
  findAgentSession,
};
