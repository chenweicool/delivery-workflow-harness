const WORKFLOW_UNITS = [
  {
    id: 'workspace',
    title: 'Workspace 准备',
    summary: '创建需求工作区，并生成基础目录和上下文快照。',
    inputs: ['需求名称', '工作区目录'],
    outputs: ['AGENTS.md', 'CLAUDE.md', 'context/knowledge-version.md', '.workflow/workspace.json'],
    steps: ['init-workspace'],
  },
  {
    id: 'prd-to-design',
    title: 'PRD 到技术方案',
    summary: '导入并解析 PRD，按配置选择是否加载应用上下文，再完成需求和技术方案确认。',
    inputs: ['PRD 文件或飞书链接', '交付配置中的应用上下文', 'design/known-facts.md（可选技术定位输入）'],
    outputs: [
      'prd/**',
      '.workflow/workspace.json',
      'design/context-summary.md',
      'design/requirement-confirmation.md',
      'design/technical-design.md',
      'design/technical-confirmation.md',
    ],
    steps: [
      'import-prd',
      '00-load-context',
      '01-clarify-requirement',
      'manual-requirement',
      '02-generate-technical-design',
      'manual-technical',
    ],
  },
  {
    id: 'design-to-code',
    title: '技术方案到代码实现',
    summary: '基于已确认技术方案拆分实施任务，确认任务后按单任务方式实现代码。',
    inputs: ['design/technical-design.md', 'design/technical-confirmation.md', '已确认应用代码', '任务编号'],
    outputs: ['tasks/task-list.md', 'tasks/task-progress.md', '代码 diff', 'review/change-log.md', 'review/self-check.md'],
    steps: ['05-split-tasks', 'manual-task', '06-implement-task'],
  },
  {
    id: 'quality-gate',
    title: '质量检查',
    summary: '基于实现结果做 AI Review、单测补齐和发布前质量门禁。平台定义检查标准，具体分析和修复交给 Codex / Claude。',
    inputs: ['代码 diff', 'tasks/task-list.md', 'design/**', 'review/change-log.md', 'review/self-check.md'],
    outputs: ['review/ai-review.md', 'review/risk-list.md', 'review/unit-test-plan.md', 'review/unit-test-result.md'],
    steps: ['07-review-code', '06-generate-unit-tests'],
  },
  {
    id: 'release-and-archive',
    title: '上线准备与归档',
    summary: '生成上线 checklist，沉淀交付总结和归档材料；远端知识库推送只生成计划，不自动执行。',
    inputs: ['design/**', 'tasks/**', 'review/**', '代码 diff'],
    outputs: [
      'delivery/release-checklist.md',
      'delivery/delivery-summary.md',
      'delivery/knowledge-improvement.md',
      'archive/index.md',
      'archive/knowledge-card.md',
    ],
    steps: ['09-release-checklist', '08-delivery-summary', '10-archive-knowledge'],
  },
];

const STEP_DEFINITIONS = {
  'init-workspace': {
    title: '创建 Workspace',
    kind: 'local',
    description: '从 delivery-workflow 模板复制出一个需求工作区，并生成上下文快照。',
    outputs: [
      'AGENTS.md',
      'CLAUDE.md',
      '.workflow/workspace.json',
      '.workflow/workflow.json',
      '.workflow/progress.md',
      '.workflow/progress.json',
      '.workflow/commands/00-load-context.md',
      'context/knowledge-version.md',
    ],
  },
  'import-prd': {
    title: '导入并解析 PRD',
    kind: 'agent',
    commandFile: '.workflow/commands/00-import-and-parse-prd.md',
    description: '先在页面选择本地 PRD 或记录外部链接，再调用可用的文档解析 skill 产出 Markdown 版 PRD。',
    outputs: ['prd/document.md'],
  },
  '00-load-context': {
    title: '00 加载上下文',
    kind: 'agent',
    commandFile: '.workflow/commands/00-load-context.md',
    requires: ['prd/document.md'],
    outputs: ['design/context-summary.md'],
  },
  '01-clarify-requirement': {
    title: '01 需求澄清',
    kind: 'agent',
    commandFile: '.workflow/commands/01-clarify-requirement.md',
    outputs: ['design/requirement-confirmation.md'],
  },
  'manual-requirement': {
    title: '人工确认需求口径',
    kind: 'manual',
    description: '确认结果应写回 design/requirement-confirmation.md。',
    inputs: ['design/requirement-confirmation.md'],
    reviewFiles: ['design/requirement-confirmation.md'],
    checklist: [
      { id: 'reviewed-requirement-file', label: '已预览并确认需求澄清文档' },
      { id: 'scope-clear', label: '需求口径和本次范围已明确，或未明确项已记录' },
      { id: 'risks-recorded', label: '关键风险、待澄清问题和 Must Pause 项已知悉' },
      { id: 'allow-next-step', label: '允许进入 02 生成技术方案' },
    ],
    approvalFile: 'design/requirement-confirmation.approved.json',
    rejectionFile: 'design/requirement-confirmation.rejected.json',
    outputs: ['design/requirement-confirmation.approved.json'],
  },
  '02-generate-technical-design': {
    title: '02 生成技术方案',
    kind: 'agent',
    commandFile: '.workflow/commands/02-generate-technical-design.md',
    requires: ['design/requirement-confirmation.approved.json'],
    outputs: ['design/technical-design.md', 'design/technical-confirmation.md', 'design/technical-design.changelog.md'],
  },
  'manual-technical': {
    title: '人工确认技术方案',
    kind: 'manual',
    description: '多轮评审技术方案；可退回写入评审意见，修订完成后再确认终版。',
    inputs: ['design/technical-design.md', 'design/technical-confirmation.md', 'design/technical-review.md'],
    reviewFiles: [
      'design/technical-design.md',
      'design/technical-confirmation.md',
      { path: 'design/technical-review.md', optional: true },
      { path: 'design/technical-design.changelog.md', optional: true },
    ],
    checklist: [
      { id: 'reviewed-technical-files', label: '已预览技术方案、确认文档和评审记录' },
      { id: 'app-scope-confirmed', label: '应用范围、接口边界和数据边界已确认' },
      { id: 'risk-accepted', label: '权限、资金、结算、兼容性风险已知悉' },
      { id: 'review-comments-resolved', label: '本轮评审意见已处理或已明确保留原因' },
      { id: 'allow-task-split', label: '允许进入实施任务拆分' },
    ],
    approvalFile: 'design/technical-design.approved.json',
    rejectionFile: 'design/technical-design.rejected.json',
    outputs: ['design/technical-design.approved.json'],
  },
  '05-split-tasks': {
    title: '05 拆分实施任务',
    kind: 'agent',
    commandFile: '.workflow/commands/05-split-tasks.md',
    requires: ['design/technical-design.approved.json'],
    outputs: ['tasks/task-list.md'],
  },
  'manual-task': {
    title: '人工确认任务',
    kind: 'manual',
    description: '确认任务拆分和本轮允许实施的任务。tasks/task-list.md 保存任务事实，tasks/task-confirmation.md 保存人工准入结论，后续实施会同时读取两个文件。',
    inputs: ['tasks/task-list.md', 'tasks/task-confirmation.md'],
    reviewFiles: ['tasks/task-list.md', 'tasks/task-confirmation.md'],
    checklist: [
      { id: 'reviewed-task-list', label: '已预览任务拆分清单' },
      { id: 'task-confirmation-written', label: '已填写任务确认结果，明确允许实施和暂缓任务' },
      { id: 'task-boundary-clear', label: '任务边界、顺序、依赖和验收标准已确认' },
      { id: 'single-task-ready', label: '已确认下一步可按单任务方式实施指定任务' },
      { id: 'allow-implementation', label: '允许进入 06 单任务实现' },
    ],
    approvalFile: 'tasks/task-list.approved.json',
    rejectionFile: 'tasks/task-list.rejected.json',
    outputs: ['tasks/task-list.approved.json'],
  },
  '06-implement-task': {
    title: '06 单任务实现',
    kind: 'agent',
    commandFile: '.workflow/commands/06-implement-task.md',
    requires: ['tasks/task-list.approved.json'],
    outputs: ['tasks/task-progress.md', 'review/change-log.md', 'review/self-check.md'],
  },
  '07-review-code': {
    title: '07 AI Review',
    kind: 'agent',
    commandFile: '.workflow/commands/07-review-code.md',
    outputs: ['review/ai-review.md', 'review/risk-list.md'],
  },
  '06-generate-unit-tests': {
    title: '08 生成单测',
    kind: 'agent',
    commandFile: '.workflow/commands/06-generate-unit-tests.md',
    outputs: ['review/unit-test-plan.md', 'review/unit-test-result.md'],
  },
  '09-release-checklist': {
    title: '09 上线 Checklist',
    kind: 'agent',
    commandFile: '.workflow/commands/09-release-checklist.md',
    outputs: ['delivery/release-checklist.md'],
  },
  '08-delivery-summary': {
    title: '10 交付总结',
    kind: 'agent',
    commandFile: '.workflow/commands/08-delivery-summary.md',
    outputs: ['delivery/delivery-summary.md', 'delivery/knowledge-improvement.md'],
  },
  '10-archive-knowledge': {
    title: '11 交付归档',
    kind: 'agent',
    commandFile: '.workflow/commands/10-archive-knowledge.md',
    outputs: ['archive/index.md', 'archive/knowledge-card.md', 'archive/platform-push-plan.md'],
  },
};


const fsp = require('fs/promises');
const path = require('path');
const { exists } = require('./fs-utils');

function defaultWorkflowDefinition() {
  return {
    version: 1,
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
    steps[stepId] = {
      ...defaultStep,
      ...(rawSteps[stepId] || {}),
    };
  }
  for (const [stepId, step] of Object.entries(rawSteps)) {
    if (!steps[stepId]) {
      steps[stepId] = step;
    }
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
    version: Number(raw.version || 1),
    description: String(raw.description || ''),
    units: units.length ? units : defaults.units,
    steps,
    source,
  };
}

async function readWorkflowDefinition(workspacePath = '', options = {}) {
  const workflowDefinitionFile = options.workflowDefinitionFile || '.workflow/workflow.json';
  const templateDir = options.templateDir || '';
  if (workspacePath) {
    const filePath = path.join(workspacePath, workflowDefinitionFile);
    try {
      if (await exists(filePath)) {
        return normalizeWorkflowDefinition(JSON.parse(await fsp.readFile(filePath, 'utf8')), 'workspace');
      }
    } catch {
      return defaultWorkflowDefinition();
    }
  }
  const templatePath = templateDir ? path.join(templateDir, workflowDefinitionFile) : '';
  try {
    if (templatePath && await exists(templatePath)) {
      return normalizeWorkflowDefinition(JSON.parse(await fsp.readFile(templatePath, 'utf8')), 'template');
    }
  } catch {
    return defaultWorkflowDefinition();
  }
  return defaultWorkflowDefinition();
}

function workflowStepSequence(workflow) {
  const sequence = [];
  const seen = new Set();
  for (const unit of workflow.units || []) {
    for (const stepId of unit.steps || []) {
      if (seen.has(stepId)) {
        continue;
      }
      const definition = workflow.steps && workflow.steps[stepId] ? workflow.steps[stepId] : {};
      sequence.push({
        id: stepId,
        title: definition.title || stepId,
        kind: definition.kind || '',
        unitId: unit.id,
        unitTitle: unit.title || unit.id,
      });
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
  return {
    sequence,
    index,
    current: index >= 0 ? index + 1 : 0,
    total: sequence.length,
    currentStep: index >= 0 ? sequence[index] : null,
  };
}

function progressMarkdown(workflow, existing = null) {
  const sequence = workflowStepSequence(workflow);
  const updatedAt = new Date().toISOString();
  const latest = existing && existing.latest ? existing.latest : {};
  const rows = sequence.map((step, index) => {
    const record = existing && existing.steps && existing.steps[step.id] ? existing.steps[step.id] : {};
    return `| ${String(index + 1).padStart(2, '0')} | ${step.id} | ${step.title} | ${record.status || 'pending'} | ${record.updatedAt || ''} | ${record.summary || ''} |`;
  });
  return [
    '# Workflow Progress',
    '',
    `updatedAt: ${updatedAt}`,
    latest.stepId ? `latestStep: ${latest.stepId}` : 'latestStep: ',
    latest.status ? `latestStatus: ${latest.status}` : 'latestStatus: ',
    '',
    '## Status Values',
    '',
    '- pending: 未开始',
    '- running: 处理中',
    '- done: 已完成',
    '- blocked: 阻塞或等待人工确认',
    '- rejected: 已退回',
    '',
    '## Steps',
    '',
    '| No. | Step | Title | Status | Updated At | Summary |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## AI Update Rule',
    '',
    '- AI 完成当前步骤后，必须更新本文档和 `.workflow/progress.json`。',
    '- 如果需要人工确认，将当前步骤标记为 done，并把下一人工步骤标记为 blocked。',
    '- 如果无法继续，将当前步骤标记为 blocked，并在 Summary 写明具体缺失输入。',
    '',
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
