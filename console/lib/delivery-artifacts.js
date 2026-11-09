const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { assertWithin, ensureDir, exists, normalizeUserPath } = require('./fs-utils');
const { normalizeApps } = require('./workspace');
const { riskSummary, assertNoUnresolvedRisks } = require('./risk-decision');

const execFileAsync = promisify(execFile);
const UNIT_TEST_REPORT = 'delivery/unit-test-report.md';
const COVERAGE_REPORT = 'delivery/coverage-report.md';
const RELEASE_CONFIG = 'delivery/release-config.yaml';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function git(args, cwd) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
    return String(stdout || '').trim();
  } catch {
    return '';
  }
}

async function readWorkspaceConfig(workspacePath) {
  const filePath = path.join(workspacePath, '.workflow', 'workspace.json');
  if (!(await exists(filePath))) return {};
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

async function resolveRepositories(workspacePath) {
  const config = await readWorkspaceConfig(workspacePath);
  const apps = normalizeApps(config.apps, config.appPaths);
  const repositories = [];
  for (const app of apps) {
    const worktreePath = path.resolve(workspacePath, app.worktreePath || path.join('apps', app.name));
    const repoPath = await exists(path.join(worktreePath, '.git')) ? worktreePath : app.sourcePath;
    if (!repoPath || !(await exists(repoPath))) continue;
    repositories.push({ name: app.name, path: repoPath, type: app.type || 'java-backend', configuredWorktreePath: app.worktreePath || '' });
  }
  if (!repositories.length) {
    const appsDir = path.join(workspacePath, 'apps');
    if (await exists(appsDir)) {
      for (const entry of await fsp.readdir(appsDir, { withFileTypes: true })) {
        if (entry.isDirectory() && await exists(path.join(appsDir, entry.name, '.git'))) {
          repositories.push({ name: entry.name, path: path.join(appsDir, entry.name), type: 'java-backend', configuredWorktreePath: `apps/${entry.name}` });
        }
      }
    }
  }
  if (!repositories.length) throw new Error('未配置可读取的应用仓库；请先在 Workspace 中关联应用代码');
  return repositories;
}

async function untrackedDigest(repoPath, status) {
  const files = String(status || '').split(/\r?\n/).filter((line) => line.startsWith('?? ')).map((line) => line.slice(3));
  const values = [];
  for (const relativePath of files) {
    const filePath = path.join(repoPath, relativePath);
    try {
      const stat = await fsp.stat(filePath);
      if (stat.isFile()) values.push(`${relativePath}:${sha256(await fsp.readFile(filePath))}`);
    } catch {
      values.push(`${relativePath}:unreadable`);
    }
  }
  return sha256(values.sort().join('\n'));
}

async function repositorySnapshot(repository) {
  const status = await git(['status', '--porcelain=v1'], repository.path);
  const unstaged = await git(['diff', '--binary', '--no-ext-diff'], repository.path);
  const staged = await git(['diff', '--binary', '--cached', '--no-ext-diff'], repository.path);
  const snapshot = {
    name: repository.name,
    path: repository.path,
    type: repository.type || 'java-backend',
    branch: await git(['branch', '--show-current'], repository.path),
    commit: await git(['rev-parse', 'HEAD'], repository.path),
    dirty: Boolean(status),
    status,
    changesDigest: sha256([status, unstaged, staged, await untrackedDigest(repository.path, status)].join('\n---\n')),
  };
  if (!snapshot.commit) throw new Error(`应用不是有效 Git 仓库：${repository.path}`);
  return snapshot;
}

async function deliverySnapshot(workspacePathValue) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  const repositories = await resolveRepositories(workspacePath);
  const apps = [];
  for (const repository of repositories) apps.push(await repositorySnapshot(repository));
  const canonical = apps.map(({ name, type, branch, commit, dirty, changesDigest }) => ({ name, type, branch, commit, dirty, changesDigest }));
  return { workspacePath, apps, fingerprint: sha256(JSON.stringify(canonical)) };
}

async function walkFiles(root, predicate, result = []) {
  if (!(await exists(root))) return result;
  for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) await walkFiles(fullPath, predicate, result);
    else if (predicate(fullPath)) result.push(fullPath);
  }
  return result;
}

function attributes(fragment) {
  const result = {};
  for (const match of String(fragment || '').matchAll(/([\w:-]+)="([^"]*)"/g)) result[match[1]] = match[2];
  return result;
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function collectSurefire(app) {
  const files = [];
  for (const dir of ['target/surefire-reports', 'target/failsafe-reports']) {
    await walkFiles(path.join(app.path, dir), (filePath) => /^TEST-.*\.xml$/i.test(path.basename(filePath)), files);
  }
  if (!files.length) throw new Error(`应用 ${app.name} 未找到 Surefire/Failsafe XML 测试报告`);
  const totals = { tests: 0, failures: 0, errors: 0, skipped: 0, time: 0 };
  const sources = [];
  for (const filePath of files.sort()) {
    const content = await fsp.readFile(filePath, 'utf8');
    const match = content.match(/<testsuite\b([^>]*)>/i);
    if (!match) continue;
    const attrs = attributes(match[1]);
    totals.tests += number(attrs.tests);
    totals.failures += number(attrs.failures);
    totals.errors += number(attrs.errors);
    totals.skipped += number(attrs.skipped);
    totals.time += number(attrs.time);
    sources.push({ path: filePath, sha256: sha256(content) });
  }
  if (!sources.length) throw new Error(`应用 ${app.name} 的测试 XML 无法解析`);
  return { app: app.name, totals, sources };
}

function coveragePercent(covered, missed) {
  const total = covered + missed;
  return total ? Number(((covered / total) * 100).toFixed(2)) : 0;
}

async function collectJacoco(app) {
  const candidates = [
    path.join(app.path, 'target/site/jacoco/jacoco.xml'),
    path.join(app.path, 'target/site/jacoco-aggregate/jacoco.xml'),
  ];
  const filePath = candidates.find((candidate) => require('fs').existsSync(candidate));
  if (!filePath) throw new Error(`应用 ${app.name} 未找到 JaCoCo XML 报告`);
  const content = await fsp.readFile(filePath, 'utf8');
  const counters = {};
  for (const match of content.matchAll(/<counter\b([^>]*)\/?\s*>/gi)) {
    const attrs = attributes(match[1]);
    if (attrs.type) counters[attrs.type] = { missed: number(attrs.missed), covered: number(attrs.covered) };
  }
  if (!counters.INSTRUCTION) throw new Error(`应用 ${app.name} 的 JaCoCo XML 缺少 INSTRUCTION 计数器`);
  return { app: app.name, path: filePath, sha256: sha256(content), counters };
}

function relativeOrAbsolute(workspacePath, filePath) {
  const relative = path.relative(workspacePath, filePath).replace(/\\/g, '/');
  return relative.startsWith('..') ? filePath.replace(/\\/g, '/') : relative;
}

function unitTestMarkdown(snapshot, results) {
  const totals = results.reduce((sum, item) => ({
    tests: sum.tests + item.totals.tests,
    failures: sum.failures + item.totals.failures,
    errors: sum.errors + item.totals.errors,
    skipped: sum.skipped + item.totals.skipped,
    time: sum.time + item.totals.time,
  }), { tests: 0, failures: 0, errors: 0, skipped: 0, time: 0 });
  return [
    '# 单元测试报告', '',
    `<!-- delivery-fingerprint: ${snapshot.fingerprint} -->`,
    `- 生成时间：${new Date().toISOString()}`,
    `- 代码指纹：\`${snapshot.fingerprint}\``,
    `- 结论：${totals.failures === 0 && totals.errors === 0 ? '通过' : '失败'}`,
    '', '## 汇总', '',
    '| 测试数 | 失败 | 错误 | 跳过 | 耗时（秒） |', '| ---: | ---: | ---: | ---: | ---: |',
    `| ${totals.tests} | ${totals.failures} | ${totals.errors} | ${totals.skipped} | ${totals.time.toFixed(3)} |`,
    '', '## 应用明细', '',
    '| 应用 | 测试数 | 失败 | 错误 | 跳过 |', '| --- | ---: | ---: | ---: | ---: |',
    ...results.map((item) => `| ${item.app} | ${item.totals.tests} | ${item.totals.failures} | ${item.totals.errors} | ${item.totals.skipped} |`),
    '', '## 原始证据', '',
    ...results.flatMap((item) => item.sources.map((source) => `- ${item.app}：\`${relativeOrAbsolute(snapshot.workspacePath, source.path)}\`，SHA-256 \`${source.sha256}\``)),
    '',
  ].join('\n');
}

function coverageMarkdown(snapshot, results) {
  const rows = results.map((item) => {
    const instruction = item.counters.INSTRUCTION;
    const branch = item.counters.BRANCH || { missed: 0, covered: 0 };
    const line = item.counters.LINE || { missed: 0, covered: 0 };
    return { app: item.app, bytecode: coveragePercent(instruction.covered, instruction.missed), branch: coveragePercent(branch.covered, branch.missed), line: coveragePercent(line.covered, line.missed) };
  });
  return [
    '# JaCoCo 字节码覆盖率报告', '',
    `<!-- delivery-fingerprint: ${snapshot.fingerprint} -->`,
    `- 生成时间：${new Date().toISOString()}`,
    `- 代码指纹：\`${snapshot.fingerprint}\``,
    '- 字节码覆盖率采用 JaCoCo `INSTRUCTION` 计数器。',
    '', '## 覆盖率', '',
    '| 应用 | 字节码覆盖率 | 分支覆盖率 | 行覆盖率 |', '| --- | ---: | ---: | ---: |',
    ...rows.map((row) => `| ${row.app} | ${row.bytecode.toFixed(2)}% | ${row.branch.toFixed(2)}% | ${row.line.toFixed(2)}% |`),
    '', '## 原始证据', '',
    ...results.map((item) => `- ${item.app}：\`${relativeOrAbsolute(snapshot.workspacePath, item.path)}\`，SHA-256 \`${item.sha256}\``),
    '',
  ].join('\n');
}

function yamlScalar(value) {
  return JSON.stringify(String(value === undefined ? '' : value));
}

function releaseConfigYaml(snapshot, risks) {
  return [
    'version: 1',
    `generated_at: ${yamlScalar(new Date().toISOString())}`,
    `delivery_fingerprint: ${yamlScalar(snapshot.fingerprint)}`,
    'release_strategy: "standard"',
    'applications:',
    ...snapshot.apps.flatMap((app) => [
      `  - name: ${yamlScalar(app.name)}`,
      `    type: ${yamlScalar(app.type)}`,
      `    repository: ${yamlScalar(app.path.replace(/\\/g, '/'))}`,
      `    branch: ${yamlScalar(app.branch)}`,
      `    commit: ${yamlScalar(app.commit)}`,
      `    dirty: ${app.dirty}`,
      `    changes_digest: ${yamlScalar(app.changesDigest)}`,
    ]),
    ...(risks.risks.length ? [
      'risk_decisions:',
      ...risks.risks.flatMap((risk) => [
        `  - id: ${yamlScalar(risk.id)}`,
        `    type: ${yamlScalar(risk.type)}`,
        `    status: ${yamlScalar(risk.status)}`,
        `    note: ${yamlScalar(risk.decision ? risk.decision.note : '')}`,
      ]),
    ] : ['risk_decisions: []']),
    'config_changes: []',
    'database_changes: []',
    'deployment_order:',
    ...snapshot.apps.map((app) => `  - ${yamlScalar(app.name)}`),
    'observability:',
    '  metrics:',
    '    - "错误率、延迟和核心业务成功率"',
    '  logs:',
    '    - "应用错误日志和本次变更关键路径日志"',
    'rollback:',
    '  trigger: "核心指标异常、关键回归失败或出现未预期业务结果"',
    '  procedure: "按 applications 中记录的提交回退部署；涉及已批准高风险变更时同时执行对应风险记录中的 rollback"',
    '',
  ].join('\n');
}

async function generateDeliveryArtifacts(workspacePathValue) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  const snapshot = await deliverySnapshot(workspacePath);
  const tests = [];
  const coverage = [];
  const javaApps = snapshot.apps.filter((app) => /java/i.test(app.type || ''));
  if (!javaApps.length) throw new Error('未配置需要生成 JaCoCo 字节码覆盖率的 Java 应用');
  for (const app of javaApps) {
    tests.push(await collectSurefire(app));
    coverage.push(await collectJacoco(app));
  }
  const risks = await riskSummary(workspacePath);
  const deliveryDir = path.join(workspacePath, 'delivery');
  assertWithin(workspacePath, deliveryDir);
  await ensureDir(deliveryDir);
  await fsp.writeFile(path.join(workspacePath, UNIT_TEST_REPORT), unitTestMarkdown(snapshot, tests), 'utf8');
  await fsp.writeFile(path.join(workspacePath, COVERAGE_REPORT), coverageMarkdown(snapshot, coverage), 'utf8');
  await fsp.writeFile(path.join(workspacePath, RELEASE_CONFIG), releaseConfigYaml(snapshot, risks), 'utf8');
  return { snapshot, tests, coverage, risks, files: [UNIT_TEST_REPORT, COVERAGE_REPORT, RELEASE_CONFIG] };
}

function embeddedFingerprint(content) {
  const match = String(content || '').match(/(?:delivery-fingerprint:\s*|delivery_fingerprint:\s*")([a-f0-9]{64})/i);
  return match ? match[1] : '';
}

async function validateDeliveryArtifacts(workspacePathValue) {
  const workspacePath = normalizeUserPath(workspacePathValue);
  const snapshot = await deliverySnapshot(workspacePath);
  const issues = [];
  const contents = {};
  for (const relativePath of [UNIT_TEST_REPORT, COVERAGE_REPORT, RELEASE_CONFIG]) {
    const filePath = path.join(workspacePath, relativePath);
    if (!(await exists(filePath))) {
      issues.push(`缺少正式交付物：${relativePath}`);
      continue;
    }
    contents[relativePath] = await fsp.readFile(filePath, 'utf8');
    if (embeddedFingerprint(contents[relativePath]) !== snapshot.fingerprint) issues.push(`代码指纹不匹配：${relativePath}`);
  }
  if (contents[UNIT_TEST_REPORT]) {
    const totals = contents[UNIT_TEST_REPORT].match(/\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*[\d.]+\s*\|/);
    if (!totals || Number(totals[1]) < 1) issues.push('单元测试报告没有可验证的测试用例');
    else if (Number(totals[2]) > 0 || Number(totals[3]) > 0) issues.push('单元测试报告存在失败或错误');
  }
  if (contents[COVERAGE_REPORT] && !/\|\s*[^|]+\s*\|\s*\d+(?:\.\d+)?%\s*\|/.test(contents[COVERAGE_REPORT])) issues.push('覆盖率报告没有可验证的 JaCoCo 百分比');
  if (contents[RELEASE_CONFIG] && !/rollback:\s*[\s\S]*?trigger:\s*"[^"]+"[\s\S]*?procedure:\s*"[^"]+"/.test(contents[RELEASE_CONFIG])) issues.push('发布配置缺少回滚触发条件或操作步骤');
  await assertNoUnresolvedRisks(workspacePath).catch((error) => issues.push(error.message));
  return { status: issues.length ? 'blocked' : 'ready', issues, snapshot, files: [UNIT_TEST_REPORT, COVERAGE_REPORT, RELEASE_CONFIG] };
}

module.exports = {
  UNIT_TEST_REPORT,
  COVERAGE_REPORT,
  RELEASE_CONFIG,
  deliverySnapshot,
  generateDeliveryArtifacts,
  validateDeliveryArtifacts,
};
