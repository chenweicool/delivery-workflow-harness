#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const cliPath = path.join(rootDir, 'bin', 'delivery-workflow.js');
const tmpRoot = path.join(os.tmpdir(), 'delivery-workflow-v3-smoke');
const demandName = `smoke-${Date.now()}`;
const workspacePath = path.join(tmpRoot, demandName);
const appPath = path.join(tmpRoot, 'sample-service');

function runCli(args, expected = '') {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, DELIVERY_WORKFLOW_DATA_DIR: path.join(tmpRoot, '.data') },
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  if (result.status !== 0) throw new Error(`Command failed: dw ${args.join(' ')}\n${output}`);
  if (expected && !output.includes(expected)) throw new Error(`Expected "${expected}" in:\n${output}`);
  return output;
}

function runCliFailure(args, expected = '') {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, DELIVERY_WORKFLOW_DATA_DIR: path.join(tmpRoot, '.data') },
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  if (result.status === 0) throw new Error(`Expected failure: dw ${args.join(' ')}`);
  if (expected && !output.includes(expected)) throw new Error(`Expected failure output "${expected}" in:\n${output}`);
  return output;
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed:\n${result.stderr}`);
}

function assertFile(relativePath) {
  const filePath = path.join(workspacePath, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`Expected file: ${filePath}`);
}

async function createAppFixture() {
  await fsp.mkdir(path.join(appPath, 'src'), { recursive: true });
  await fsp.writeFile(path.join(appPath, 'src', 'App.java'), 'class App {}\n', 'utf8');
  runGit(['init'], appPath);
  runGit(['config', 'user.name', 'Smoke'], appPath);
  runGit(['config', 'user.email', 'smoke@example.com'], appPath);
  runGit(['add', '.'], appPath);
  runGit(['commit', '-m', 'fixture'], appPath);
  await fsp.mkdir(path.join(appPath, 'target', 'surefire-reports'), { recursive: true });
  await fsp.mkdir(path.join(appPath, 'target', 'site', 'jacoco'), { recursive: true });
  await fsp.writeFile(path.join(appPath, 'target', 'surefire-reports', 'TEST-AppTest.xml'), '<testsuite name="AppTest" tests="4" failures="0" errors="0" skipped="1" time="0.125"></testsuite>\n', 'utf8');
  await fsp.writeFile(path.join(appPath, 'target', 'site', 'jacoco', 'jacoco.xml'), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<report name="sample">',
    '<counter type="INSTRUCTION" missed="20" covered="80"/>',
    '<counter type="BRANCH" missed="3" covered="7"/>',
    '<counter type="LINE" missed="4" covered="16"/>',
    '</report>',
  ].join('\n'), 'utf8');
}

async function configureWorkspaceApp() {
  const configPath = path.join(workspacePath, '.workflow', 'workspace.json');
  const config = JSON.parse(await fsp.readFile(configPath, 'utf8'));
  config.apps = [{ name: 'sample-service', sourcePath: appPath, worktreePath: 'apps/sample-service', type: 'java-backend' }];
  config.appPaths = [{ name: 'sample-service', path: appPath }];
  await fsp.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

async function main() {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
  await fsp.mkdir(tmpRoot, { recursive: true });
  await createAppFixture();
  runCli(['help'], 'Delivery Workflow V3');
  runCli(['init', demandName, '--output-root', tmpRoot, '--owner', 'Smoke', '--demand-url', 'https://example.internal/demand/smoke'], 'Workspace created');
  assertFile('AGENTS.md');
  assertFile('.workflow/commands/execute-delivery.md');
  assertFile('.workflow/workflow.json');
  const workflow = JSON.parse(await fsp.readFile(path.join(workspacePath, '.workflow', 'workflow.json'), 'utf8'));
  if (workflow.version !== 3 || Object.keys(workflow.steps).join(',') !== 'init-workspace,execute-delivery,manual-release') throw new Error('Expected V3 three-step workflow');
  await configureWorkspaceApp();

  const requestFile = path.join(tmpRoot, 'request.md');
  await fsp.writeFile(requestFile, '# Smoke requirement\n', 'utf8');
  runCli(['input', 'import', requestFile, '--workspace', workspacePath], 'input:');
  assertFile('input/source/request.md');
  assertFile('input/request.md');
  runCli(['next', '--workspace', workspacePath], 'step: execute-delivery');

  runCli(['risk', 'report', '--type', 'database', '--scope', 'sample table', '--impact', 'schema change', '--rollback', 'revert migration', '--workspace', workspacePath], 'risk: R-001');
  runCli(['risk', 'list', '--workspace', workspacePath], 'R-001\twaiting');
  runCli(['risk', 'approve', 'R-001', '--note', 'fixture approved', '--workspace', workspacePath], 'status: approved');

  runCli(['delivery', 'collect', '--workspace', workspacePath], 'delivery: collected');
  assertFile('delivery/unit-test-report.md');
  assertFile('delivery/coverage-report.md');
  assertFile('delivery/release-config.yaml');
  const testReport = await fsp.readFile(path.join(workspacePath, 'delivery', 'unit-test-report.md'), 'utf8');
  const coverageReport = await fsp.readFile(path.join(workspacePath, 'delivery', 'coverage-report.md'), 'utf8');
  if (!testReport.includes('| 4 | 0 | 0 | 1 |')) throw new Error('Unit test report totals are incorrect');
  if (!coverageReport.includes('| sample-service | 80.00% | 70.00% | 80.00% |')) throw new Error('Coverage report totals are incorrect');
  runCli(['delivery', 'validate', '--workspace', workspacePath], 'delivery: ready');
  runCli(['done', '--step', 'execute-delivery', '--summary', 'fixture ready', '--workspace', workspacePath], 'return: manual-release');
  runCli(['next', '--workspace', workspacePath], 'step: manual-release');
  runCli(['release', 'approve', '--note', 'fixture release approved', '--workspace', workspacePath], 'release: approved');
  assertFile('.workflow/approvals/release.approved.json');
  runCli(['next', '--workspace', workspacePath], '交付流程已完成');
  await fsp.appendFile(path.join(appPath, 'src', 'App.java'), '// changed after approval\n', 'utf8');
  runCliFailure(['delivery', 'validate', '--workspace', workspacePath], '代码指纹不匹配');
  runCli(['next', '--workspace', workspacePath], 'step: execute-delivery');

  const workspaceConfig = JSON.parse(await fsp.readFile(path.join(workspacePath, '.workflow', 'workspace.json'), 'utf8'));
  const enabledSkills = (workspaceConfig.capabilities || []).filter((item) => item.type === 'skill' && item.enabled === true);
  if (enabledSkills.length) throw new Error('Workspace skills must not be enabled by default');
  console.log(`Smoke passed: ${workspacePath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
