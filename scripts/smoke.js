#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const cliPath = path.join(rootDir, 'bin', 'delivery-workflow.js');
const tmpRoot = path.join(os.tmpdir(), 'delivery-workflow-smoke');
const demandName = `smoke-${Date.now()}`;
const workspacePath = path.join(tmpRoot, demandName);

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      DELIVERY_WORKFLOW_DATA_DIR: path.join(tmpRoot, '.data'),
    },
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw new Error(`Command failed: delivery-workflow ${args.join(' ')}\n${output}`);
  }
  if (options.includes && !result.stdout.includes(options.includes)) {
    throw new Error(`Expected command output to include "${options.includes}". Output:\n${result.stdout}`);
  }
  return result.stdout;
}

function assertFile(relativePath) {
  const targetPath = path.join(workspacePath, relativePath);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Expected file to exist: ${targetPath}`);
  }
}

async function readJson(relativePath) {
  return JSON.parse(await fsp.readFile(path.join(workspacePath, relativePath), 'utf8'));
}

async function lockBaseline(relativePath, baseline) {
  const content = await fsp.readFile(path.join(workspacePath, relativePath), 'utf8');
  await fsp.mkdir(path.join(workspacePath, '.workflow', 'baselines'), { recursive: true });
  await fsp.writeFile(
    path.join(workspacePath, '.workflow', 'baselines', `${baseline}.lock.json`),
    JSON.stringify({ version: 1, baseline, path: relativePath, sha256: crypto.createHash('sha256').update(content, 'utf8').digest('hex') }, null, 2),
    'utf8',
  );
}

async function createDomainHarnessFixture(root) {
  await fsp.mkdir(path.join(root, 'docs', 'domain'), { recursive: true });
  await fsp.writeFile(path.join(root, '.module-manifest.yaml'), [
    'name: smoke-domain',
    'description: Smoke domain Harness',
    'bound_repositories:',
    '  - name: smoke-service',
    '    directory: codes/smoke-service',
    '',
  ].join('\n'), 'utf8');
  await fsp.writeFile(path.join(root, 'docs', 'domain', 'whitepaper.md'), '# Smoke Domain\n', 'utf8');
}

async function main() {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
  await fsp.mkdir(tmpRoot, { recursive: true });
  const domainRoot = path.join(tmpRoot, 'smoke-domain');
  await createDomainHarnessFixture(domainRoot);

  run(['help'], { includes: 'delivery-workflow start' });
  run(['init', demandName, '--output-root', tmpRoot, '--domain', domainRoot, '--owner', 'Smoke', '--owner-id', 'smoke', '--demand-url', 'https://example.internal/demand/smoke'], { includes: 'Workspace created' });
  assertFile('AGENTS.md');
  assertFile('.workflow/workspace.json');
  assertFile('.workflow/progress.json');
  assertFile('.workflow/workflow.json');
  assertFile('.workflow/quality-policy.yaml');
  run(['report', 'complete', '--workspace', workspacePath], { includes: 'status: created' });
  assertFile('delivery/delivery-report.json');
  const report = await readJson('delivery/delivery-report.json');
  if (report.schemaVersion !== '1.0' || report.demand.owner.id !== 'smoke') {
    throw new Error('Expected delivery report v1 to contain demand statistics.');
  }

  run(['status', '--workspace', workspacePath], { includes: 'valid: true' });
  run(['next', '--workspace', workspacePath], { includes: 'step: import-prd' });
  run(['gate', 'check', '--workspace', workspacePath], { includes: 'requirement-confirmed\tblocked' });
  assertFile('.workflow/quality-policy.lock.json');
  assertFile('.workflow/gates.json');

  const sourcePrd = path.join(tmpRoot, 'source-prd.md');
  await fsp.writeFile(sourcePrd, '# Smoke PRD\n', 'utf8');
  run(['prd', 'import', sourcePrd, '--workspace', workspacePath], { includes: 'prd:' });
  assertFile('prd/source/source-prd.md');
  assertFile('prd/document.md');
  assertFile('prd/metadata/ingestion.json');

  await fsp.mkdir(path.join(workspacePath, 'design'), { recursive: true });
  await fsp.mkdir(path.join(workspacePath, 'tasks'), { recursive: true });
  await fsp.mkdir(path.join(workspacePath, 'review'), { recursive: true });
  await fsp.writeFile(path.join(workspacePath, 'design', 'process', 'requirement-confirmation.md'), '# 需求确认\n\n- 覆盖边界条件\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'prd', 'document.md'), '# 解析后的 PRD\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'design', 'technical-design.md'), '# 技术方案\n\n- 修改 Service 分支逻辑\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'design', 'unit-test-design.md'), '# 单测设计\n\n- UT-001 覆盖边界\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'design', 'smoke-test-design.md'), '# 冒烟测试设计\n\n- ST-001 覆盖主路径\n', 'utf8');
  await lockBaseline('design/technical-design.md', 'technical-design');
  await lockBaseline('design/unit-test-design.md', 'unit-test-design');
  await lockBaseline('design/smoke-test-design.md', 'smoke-test-design');
  await fsp.writeFile(path.join(workspacePath, 'tasks', 'task-list.md'), '# 任务清单\n\n- T001 覆盖核心改动\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'review', 'process', 'change-log.md'), '# 变更记录\n\n- 修改目标代码\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'review', 'process', 'self-check.md'), '# 自检\n\n- 已自检主路径\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'review', 'quality-report.md'), '# AI Review\n\n## 发现问题\n\n- 边界场景需要补测\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'review', 'evidence', 'risk-list.md'), '# 风险清单\n\n## 测试缺口\n\n- 异常路径\n', 'utf8');
  run(['gate', 'check', '--workspace', workspacePath], { includes: 'design-ready\tready-for-approval' });
  run(['gate', 'approve', 'design-ready', '--workspace', workspacePath, '--note', 'smoke reviewed'], { includes: 'design-ready / approved' });

  const localSkillPath = path.join(tmpRoot, 'local-smoke-skill');
  await fsp.mkdir(localSkillPath, { recursive: true });
  await fsp.writeFile(path.join(localSkillPath, 'SKILL.md'), '# Local Smoke Skill\n', 'utf8');
  run(['skill', 'install', localSkillPath, '--workspace', workspacePath], { includes: 'installed: local-smoke-skill' });
  run(['skill', 'disable', 'local-smoke-skill', '--workspace', workspacePath], { includes: 'disable: local-smoke-skill' });
  run(['skill', 'enable', 'local-smoke-skill', '--workspace', workspacePath], { includes: 'enable: local-smoke-skill' });
  run(['change', 'create', '--type', 'defect', '--reason', 'smoke defect', '--workspace', workspacePath], { includes: 'change: BUG-001' });
  run(['change', 'impact', 'BUG-001', '--workspace', workspacePath], { includes: 'steps: 06-implement-task' });
  run(['candidate', 'create', '--change', 'BUG-001', '--workspace', workspacePath], { includes: 'candidate: C-001' });
  run(['candidate', 'verify', 'C-001', '--workspace', workspacePath], { includes: 'status: valid' });
  run(['evidence', 'record', '--candidate', 'C-001', '--kind', 'review', '--path', 'review/quality-report.md', '--workspace', workspacePath], { includes: 'candidate: C-001' });

  const stateFile = path.join(tmpRoot, '.data', 'state.json');
  await fsp.writeFile(stateFile, JSON.stringify({
    outputRoot: path.join(tmpRoot, 'missing-output-root'),
    workspacePath: path.join(tmpRoot, 'missing-workspace'),
    selectedUnitId: 'design-to-code',
    tools: {
      workspaceRoot: tmpRoot,
    },
  }, null, 2), 'utf8');
  const stateOutput = run(['config', 'show']);
  if (stateOutput.includes('missing-workspace') || stateOutput.includes('missing-output-root')) {
    throw new Error('Expected stale workspace state to be ignored.');
  }

  console.log(`Smoke passed: ${workspacePath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
