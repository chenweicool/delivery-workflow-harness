const fsp = require('fs/promises');
const path = require('path');
const { exists } = require('./fs-utils');

const WORKFLOW_UNITS = [
  {
    id: 'workspace',
    title: '准备',
    summary: '建立需求 Workspace，接入需求材料、代码和可选领域上下文。',
    inputs: ['需求名称', '需求负责人', '需求链接'],
    outputs: ['AGENTS.md', '.workflow/workspace.json', 'context/demand-context.md'],
    steps: ['init-workspace'],
  },
  {
    id: 'work-run',
    title: '自主交付',
    summary: 'Agent 自主完成理解、设计、实现、Review 和验证；只有命中高风险触发项时才暂停。',
    inputs: ['input/**', 'context/**', '应用代码', '用户反馈'],
    outputs: ['delivery/unit-test-report.md', 'delivery/coverage-report.md', 'delivery/release-config.yaml'],
    steps: ['execute-delivery'],
  },
  {
    id: 'release',
    title: '发布确认',
    summary: '人工核对三份正式交付物和风险决策，确认是否允许发布。',
    inputs: ['delivery/unit-test-report.md', 'delivery/coverage-report.md', 'delivery/release-config.yaml'],
    outputs: ['.workflow/approvals/release.approved.json'],
    steps: ['manual-release'],
  },
];

const STEP_DEFINITIONS = {
  'init-workspace': {
    title: '创建 Workspace',
    kind: 'local',
    description: '创建精简 Workspace，并生成需求与领域上下文快照。',
    outputs: [
      'AGENTS.md',
      'CLAUDE.md',
      '.workflow/workspace.json',
      '.workflow/workflow.json',
      '.workflow/progress.md',
      '.workflow/progress.json',
      '.workflow/commands/execute-delivery.md',
      'context/knowledge-version.md',
      'context/demand-context.md',
    ],
  },
  'execute-delivery': {
    title: '自主完成需求',
    kind: 'agent',
    commandFile: '.workflow/commands/execute-delivery.md',
    description: '根据当前目标和代码事实循环实施、验证与修复，并生成可复核的交付证据。',
    outputs: [
      'delivery/unit-test-report.md',
      'delivery/coverage-report.md',
      'delivery/release-config.yaml',
    ],
    metadata: {
      capabilityTypes: ['rule', 'general', 'unit-test', 'code-review', 'api-doc', 'prd-convert'],
    },
  },
  'manual-release': {
    title: '人工确认发布',
    kind: 'manual',
    description: '核对交付证据、代码指纹、配置和回滚信息；发布动作始终由人决定。',
    inputs: [
      'delivery/unit-test-report.md',
      'delivery/coverage-report.md',
      'delivery/release-config.yaml',
    ],
    reviewFiles: [
      'delivery/unit-test-report.md',
      'delivery/coverage-report.md',
      'delivery/release-config.yaml',
    ],
    checklist: [
      { id: 'tests-reviewed', label: '已核对单元测试结果和失败数' },
      { id: 'coverage-reviewed', label: '已核对 JaCoCo 字节码覆盖率和覆盖范围' },
      { id: 'config-reviewed', label: '已核对发布应用、提交、配置、观测和回滚信息' },
      { id: 'risks-reviewed', label: '所有高风险决策均已批准且没有待处理项' },
      { id: 'allow-release', label: '允许按发布配置执行发布' },
    ],
    approvalFile: '.workflow/approvals/release.approved.json',
    rejectionFile: '.workflow/approvals/release.rejected.json',
    outputs: ['.workflow/approvals/release.approved.json'],
  },
};

function defaultWorkflowDefinition() {
  return {
    version: 3,
    description: 'Delivery Workflow V3：结果驱动、风险触发、证据交付。',
    units: WORKFLOW_UNITS,
    steps: STEP_DEFINITIONS,
    source: 'built-in',
  };
}

function normalizeWorkflowDefinition(raw = {}, source = 'custom') {
  const defaults = defaultWorkflowDefinition();
  const rawSteps = raw && raw.steps && typeof raw.steps === 'object' ? raw.steps : {};
  const steps = {};
  for (const [stepId, defaultStep] of Object.entries(defaults.steps)) {
    steps[stepId] = { ...defaultStep, ...(rawSteps[stepId] || {}) };
  }
  for (const [stepId, step] of Object.entries(rawSteps)) {
    if (!steps[stepId]) steps[stepId] = step;
  }
  const rawUnits = Array.isArray(raw.units) ? raw.units : defaults.units;
  const units = rawUnits
    .filter((unit) => unit && unit.id && Array.isArray(unit.steps))
    .map((unit) => ({
      ...unit,
      inputs: Array.isArray(unit.inputs) ? unit.inputs : [],
      outputs: Array.isArray(unit.outputs) ? unit.outputs : [],
      steps: unit.steps.filter((stepId) => steps[stepId]),
    }))
    .filter((unit) => unit.steps.length);
  return {
    version: Number(raw.version || 3),
    description: String(raw.description || defaults.description),
    units: units.length ? units : defaults.units,
    steps,
    source,
  };
}

async function readWorkflowDefinition(workspacePath = '', options = {}) {
  const workflowDefinitionFile = options.workflowDefinitionFile || '.workflow/workflow.json';
  const templateDir = options.templateDir || '';
  const candidates = [
    workspacePath ? { path: path.join(workspacePath, workflowDefinitionFile), source: 'workspace' } : null,
    templateDir ? { path: path.join(templateDir, workflowDefinitionFile), source: 'template' } : null,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!(await exists(candidate.path))) continue;
    try {
      return normalizeWorkflowDefinition(JSON.parse(await fsp.readFile(candidate.path, 'utf8')), candidate.source);
    } catch (error) {
      throw new Error(`Workflow 定义不是合法 JSON 或结构无效：${candidate.path}；${error.message}`);
    }
  }
  return defaultWorkflowDefinition();
}

function workflowStepSequence(workflow) {
  const sequence = [];
  const seen = new Set();
  for (const unit of workflow.units || []) {
    for (const stepId of unit.steps || []) {
      if (seen.has(stepId)) continue;
      const definition = workflow.steps && workflow.steps[stepId] ? workflow.steps[stepId] : {};
      sequence.push({ id: stepId, title: definition.title || stepId, kind: definition.kind || '', unitId: unit.id, unitTitle: unit.title || unit.id });
      seen.add(stepId);
    }
  }
  return sequence;
}

function workflowUnitForStep(workflow, stepId) {
  return (workflow.units || []).find((unit) => (unit.steps || []).includes(stepId)) || null;
}

function workflowStepPosition(workflow, stepId) {
  const sequence = workflowStepSequence(workflow);
  const index = sequence.findIndex((step) => step.id === stepId);
  return { sequence, index, current: index >= 0 ? index + 1 : 0, total: sequence.length, currentStep: index >= 0 ? sequence[index] : null };
}

function progressMarkdown(workflow, existing = null) {
  const sequence = workflowStepSequence(workflow);
  const updatedAt = new Date().toISOString();
  const latest = existing && existing.latest ? existing.latest : {};
  const rows = sequence.map((step, index) => {
    const record = existing && existing.steps && existing.steps[step.id] ? existing.steps[step.id] : {};
    return `| ${index + 1} | ${step.id} | ${step.title} | ${record.status || 'pending'} | ${record.updatedAt || ''} | ${record.summary || ''} |`;
  });
  return [
    '# Workflow Progress', '', `updatedAt: ${updatedAt}`,
    latest.stepId ? `latestStep: ${latest.stepId}` : 'latestStep: ',
    latest.status ? `latestStatus: ${latest.status}` : 'latestStatus: ', '',
    '## 状态', '',
    '- pending：未开始', '- running：自主交付中', '- done：结果已形成', '- blocked：等待风险决策或外部输入', '- rejected：人工退回', '',
    '## 节点', '', '| No. | Step | Title | Status | Updated At | Summary |', '| --- | --- | --- | --- | --- | --- |', ...rows, '',
    '## 回写规则', '',
    '- Agent 只在三份正式交付物均已生成且风险已清零后执行 `dw done --step execute-delivery`。',
    '- 发现高风险时先执行 `dw risk report`，将当前节点标记为 blocked，待人工决策后继续。',
    '- 不直接编辑本文件或 `.workflow/progress.json`。', '',
  ].join('\n');
}

module.exports = {
  WORKFLOW_UNITS,
  STEP_DEFINITIONS,
  defaultWorkflowDefinition,
  normalizeWorkflowDefinition,
  readWorkflowDefinition,
  workflowStepSequence,
  workflowUnitForStep,
  workflowStepPosition,
  progressMarkdown,
};
