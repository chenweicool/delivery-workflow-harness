#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
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

async function main() {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
  await fsp.mkdir(tmpRoot, { recursive: true });

  run(['help'], { includes: 'delivery-workflow start' });
  run(['init', demandName, '--output-root', tmpRoot], { includes: 'Workspace created' });
  assertFile('AGENTS.md');
  assertFile('.workflow/workspace.json');
  assertFile('.workflow/progress.json');
  assertFile('.workflow/workflow.json');

  run(['status', '--workspace', workspacePath], { includes: 'valid: true' });
  run(['next', '--workspace', workspacePath], { includes: 'step: import-prd' });
  run(['handoff', '--workspace', workspacePath, '--step', 'import-prd', '--port', '3161'], { includes: '--port 3161' });
  assertFile('.workflow/handoff/current.md');
  const handoff = await fsp.readFile(path.join(workspacePath, '.workflow/handoff/current.md'), 'utf8');
  if (!handoff.includes('http://127.0.0.1:3161/')) {
    throw new Error('Expected handoff return URL to use the requested port.');
  }

  run(['done', '--workspace', workspacePath, '--step', 'import-prd', '--summary', 'smoke ready', '--port', '3161'], {
    includes: 'done:',
  });
  assertFile('.workflow/handoff/done.json');
  const done = await readJson('.workflow/handoff/done.json');
  if (!String(done.nextUrl || '').startsWith('http://127.0.0.1:3161/')) {
    throw new Error('Expected done nextUrl to use the requested port.');
  }
  run(['status', '--workspace', workspacePath], { includes: 'handoff: ready-for-review' });

  await fsp.mkdir(path.join(workspacePath, 'design'), { recursive: true });
  await fsp.mkdir(path.join(workspacePath, 'tasks'), { recursive: true });
  await fsp.mkdir(path.join(workspacePath, 'review'), { recursive: true });
  await fsp.writeFile(path.join(workspacePath, 'design', 'requirement-confirmation.md'), '# 需求确认\n\n- 覆盖边界条件\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'design', 'technical-design.md'), '# 技术方案\n\n- 修改 Service 分支逻辑\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'tasks', 'task-list.md'), '# 任务清单\n\n- T001 覆盖核心改动\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'review', 'change-log.md'), '# 变更记录\n\n- 修改目标代码\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'review', 'self-check.md'), '# 自检\n\n- 已自检主路径\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'review', 'ai-review.md'), '# AI Review\n\n## 发现问题\n\n- 边界场景需要补测\n', 'utf8');
  await fsp.writeFile(path.join(workspacePath, 'review', 'risk-list.md'), '# 风险清单\n\n## 测试缺口\n\n- 异常路径\n', 'utf8');
  run(['handoff', '--workspace', workspacePath, '--step', '06-generate-unit-tests', '--port', '3161'], { includes: 'step: 06-generate-unit-tests' });
  const qualityHandoff = await fsp.readFile(path.join(workspacePath, '.workflow/handoff/current.md'), 'utf8');
  for (const expected of ['质量门禁上下文包', '单测必须优先覆盖', 'AI Review', '风险清单']) {
    if (!qualityHandoff.includes(expected)) {
      throw new Error(`Expected quality handoff to include "${expected}".`);
    }
  }

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
