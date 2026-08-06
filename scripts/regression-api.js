#!/usr/bin/env node

const assert = require('assert/strict');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const tempRoot = path.join(os.tmpdir(), 'delivery-workflow-api-regression', `run-${Date.now()}`);
process.env.DELIVERY_WORKFLOW_DATA_DIR = path.join(tempRoot, '.data');

const { startServer } = require(path.join(rootDir, 'console', 'server.js'));
const { assertWithin } = require(path.join(rootDir, 'console', 'lib', 'fs-utils.js'));
const { createAgentRunnerRuntime } = require(path.join(rootDir, 'console', 'lib', 'agent-runner.js'));

async function requestJson(baseUrl, relativePath, options = {}) {
  const response = await fetch(`${baseUrl}${relativePath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  return { response, data };
}

async function requestText(baseUrl, relativePath) {
  const response = await fetch(`${baseUrl}${relativePath}`);
  return { response, text: await response.text() };
}

async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for the simulated agent process.');
}

async function createDomainHarnessFixture(root) {
  await Promise.all([
    fsp.mkdir(path.join(root, 'docs', 'domain'), { recursive: true }),
    fsp.mkdir(path.join(root, 'docs', 'memory'), { recursive: true }),
    fsp.mkdir(path.join(root, 'catalog'), { recursive: true }),
    fsp.mkdir(path.join(root, 'rules'), { recursive: true }),
    fsp.mkdir(path.join(root, 'skills', 'settlement-analyst'), { recursive: true }),
    fsp.mkdir(path.join(root, 'graphify-out'), { recursive: true }),
    fsp.mkdir(path.join(root, 'codes', 'settlement-service', 'src'), { recursive: true }),
  ]);
  await Promise.all([
    fsp.writeFile(path.join(root, '.module-manifest.yaml'), [
      'name: settlement-domain',
      'description: Settlement domain fixture',
      'status: ready',
      'entrypoints:',
      '  whitepaper: docs/domain/settlement.md',
      'memory_files:',
      '  - docs/memory/known-risk.md',
      'skill_paths:',
      '  - skills/settlement-analyst',
      'bound_repositories:',
      '  - name: settlement-service',
      '    description: Settlement API',
      '    layer: backend',
      '    directory: codes/settlement-service',
      '    logical_projects:',
      '      - name: settlement-api',
      '        role: HTTP service',
      '    anchors:',
      '      - path: src/Application.java',
      '        symbol: Application',
      '',
    ].join('\n'), 'utf8'),
    fsp.writeFile(path.join(root, 'docs', 'domain', 'settlement.md'), '# Settlement Whitepaper\n', 'utf8'),
    fsp.writeFile(path.join(root, 'docs', 'memory', 'known-risk.md'), '# Historical Risk\n', 'utf8'),
    fsp.writeFile(path.join(root, 'catalog', 'capability-catalog.md'), '# Capability Catalog\n', 'utf8'),
    fsp.writeFile(path.join(root, 'catalog', 'data-object-evidence.md'), '# Data Object Evidence\n', 'utf8'),
    fsp.writeFile(path.join(root, 'rules', 'engineering-rules.md'), '# Rule\n', 'utf8'),
    fsp.writeFile(path.join(root, 'skills', 'settlement-analyst', 'SKILL.md'), '# Skill\n', 'utf8'),
    fsp.writeFile(path.join(root, 'graphify-out', 'graph.json'), '{}\n', 'utf8'),
    fsp.writeFile(path.join(root, 'codes', 'settlement-service', 'src', 'Application.java'), 'class Application {}\n', 'utf8'),
  ]);
}

async function main() {
  await fsp.mkdir(tempRoot, { recursive: true });
  const domainRoot = path.join(tempRoot, 'settlement-domain');
  await createDomainHarnessFixture(domainRoot);
  const runtime = await startServer({ port: 0 });

  try {
    const { response: initialStateResponse, data: initialState } = await requestJson(runtime.url, '/api/state');
    assert.equal(initialStateResponse.status, 200);
    assert.equal(typeof initialState.outputRoot, 'string');
    const { response: gitIdentityResponse, data: gitIdentityData } = await requestJson(runtime.url, '/api/system/git-identity');
    assert.equal(gitIdentityResponse.status, 200);
    assert.equal(typeof gitIdentityData.name, 'string');
    assert.equal(typeof gitIdentityData.id, 'string');

    const workspaceRoot = path.join(tempRoot, 'workspaces');
    const whitepaperRoot = path.join(rootDir, 'team-config.example');
    const { response: toolsResponse } = await requestJson(runtime.url, '/api/tools/config', {
      method: 'POST',
      body: JSON.stringify({
        tools: {
          whitepaperRoot,
          teamConfigRoot: whitepaperRoot,
          repoRoot: path.join(tempRoot, 'repositories'),
        },
      }),
    });
    assert.equal(toolsResponse.status, 200);

    const { response: initResponse, data: initData } = await requestJson(runtime.url, '/api/workspaces/init', {
      method: 'POST',
      body: JSON.stringify({
        demandName: 'api-regression',
        outputRoot: workspaceRoot,
        domainRoot,
        perspective: 'qa',
        demand: {
          url: 'https://example.internal/demand/api-regression',
          owner: { name: 'API 回归', id: 'api-regression' },
        },
      }),
    });
    assert.equal(initResponse.status, 200);
    assert.equal(fs.existsSync(path.join(initData.workspacePath, 'AGENTS.md')), true);
    assert.equal(initData.domain.manifest.name, 'settlement-domain');
    assert.equal(fs.existsSync(path.join(initData.workspacePath, '.workflow', 'domain.lock.json')), true);
    assert.equal(fs.existsSync(path.join(initData.workspacePath, 'context', 'domain-summary.md')), true);
    const domainSummary = await fsp.readFile(path.join(initData.workspacePath, 'context', 'domain-summary.md'), 'utf8');
    assert.match(domainSummary, /## 领域 Catalog/);
    assert.match(domainSummary, /catalog\/capability-catalog\.md/);
    assert.equal(fs.existsSync(path.join(initData.workspacePath, '.workflow', 'capabilities.lock.json')), true);
    const initializedWorkspaceConfig = JSON.parse(await fsp.readFile(path.join(initData.workspacePath, '.workflow', 'workspace.json'), 'utf8'));
    assert.equal(initializedWorkspaceConfig.perspective, 'qa');
    assert.equal(initializedWorkspaceConfig.demand.owner.name, 'API 回归');
    assert.equal(initializedWorkspaceConfig.demand.url, 'https://example.internal/demand/api-regression');
    const capabilitySnapshot = await fsp.readFile(path.join(initData.workspacePath, 'context', 'capabilities.md'), 'utf8');
    assert.match(capabilitySnapshot, /当前需求能力快照/);
    const workspaceQuery = encodeURIComponent(initData.workspacePath);
    const { response: reportResponse, data: reportData } = await requestJson(runtime.url, '/api/workspace/delivery-report/complete', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath }),
    });
    assert.equal(reportResponse.status, 200);
    assert.equal(reportData.created, true);
    assert.equal(reportData.report.schemaVersion, '1.0');
    assert.equal(reportData.report.demand.owner.id, 'api-regression');
    assert.equal(reportData.report.demand.url, 'https://example.internal/demand/api-regression');
    assert.equal(reportData.submission.status, 'not-configured');
    assert.equal(fs.existsSync(path.join(initData.workspacePath, 'delivery', 'delivery-report.json')), true);
    const { response: repeatedReportResponse, data: repeatedReportData } = await requestJson(runtime.url, '/api/workspace/delivery-report/complete', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath }),
    });
    assert.equal(repeatedReportResponse.status, 200);
    assert.equal(repeatedReportData.created, false);
    assert.equal(repeatedReportData.report.reportId, reportData.report.reportId);
    assert.equal(repeatedReportData.submission.status, 'not-configured');
    const { response: harnessConfigResponse, data: harnessConfigData } = await requestJson(runtime.url, '/api/harness-client/configure', {
      method: 'POST',
      body: JSON.stringify({
        serverUrl: 'https://harness.example.internal/api/v1/harness/delivery-reports',
        clientId: 'delivery-workflow-desktop',
      }),
    });
    assert.equal(harnessConfigResponse.status, 200);
    assert.equal(harnessConfigData.enabled, true);
    assert.equal(harnessConfigData.authorizationStatus, 'required');
    assert.equal(Object.prototype.hasOwnProperty.call(harnessConfigData, 'accessToken'), false);
    const { response: harnessStatusResponse, data: harnessStatusData } = await requestJson(runtime.url, '/api/harness-client/status');
    assert.equal(harnessStatusResponse.status, 200);
    assert.equal(harnessStatusData.serverUrl, 'https://harness.example.internal/api/v1/harness/delivery-reports');
    assert.equal(Object.prototype.hasOwnProperty.call(harnessStatusData, 'accessToken'), false);
    const { response: safeToolsResponse, data: safeToolsData } = await requestJson(runtime.url, '/api/tools/config');
    assert.equal(safeToolsResponse.status, 200);
    assert.equal(Object.prototype.hasOwnProperty.call(safeToolsData.tools.integrations.harnessClient, 'accessToken'), false);
    const { response: tokenSeedResponse } = await requestJson(runtime.url, '/api/tools/config', {
      method: 'POST',
      body: JSON.stringify({
        tools: {
          integrations: {
            harnessClient: {
              accessToken: 'local-regression-token',
              accessTokenExpiresAt: Date.now() + 60_000,
            },
          },
        },
      }),
    });
    assert.equal(tokenSeedResponse.status, 200);
    const { response: safeSaveResponse, data: safeSaveData } = await requestJson(runtime.url, '/api/tools/config', {
      method: 'POST',
      body: JSON.stringify({ tools: safeToolsData.tools }),
    });
    assert.equal(safeSaveResponse.status, 200);
    assert.equal(Object.prototype.hasOwnProperty.call(safeSaveData.tools.integrations.harnessClient, 'accessToken'), false);
    const { response: preservedStatusResponse, data: preservedStatusData } = await requestJson(runtime.url, '/api/harness-client/status');
    assert.equal(preservedStatusResponse.status, 200);
    assert.equal(preservedStatusData.authorizationStatus, 'authorized');
    const localMarkdown = path.join(tempRoot, 'local-prd.md');
    const localDocx = path.join(tempRoot, 'local-prd.docx');
    await fsp.writeFile(localMarkdown, '# 本地 PRD\n\n正文内容。\n', 'utf8');
    await fsp.writeFile(localDocx, 'not-a-real-docx', 'utf8');
    const { response: localImportResponse, data: localImportData } = await requestJson(runtime.url, '/api/workspace/import-local-prd', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath, sourcePaths: [localMarkdown, localDocx] }),
    });
    assert.equal(localImportResponse.status, 200);
    assert.equal(localImportData.ingestion.document.status, 'generated');
    assert.equal(localImportData.ingestion.records.some((item) => item.kind === 'docx' && item.status === 'needs-parser'), true);
    const normalizedPrd = await fsp.readFile(path.join(initData.workspacePath, 'prd', 'document.md'), 'utf8');
    assert.match(normalizedPrd, /本地 PRD/);
    assert.equal(fs.existsSync(path.join(initData.workspacePath, 'prd', 'metadata', 'ingestion.json')), true);

    const { response: domainInspectResponse, data: domainInspectData } = await requestJson(
      runtime.url,
      `/api/domain-harness/inspect?root=${encodeURIComponent(domainRoot)}`,
    );
    assert.equal(domainInspectResponse.status, 200);
    assert.equal(domainInspectData.available, true);
    assert.equal(domainInspectData.codeRepositories.length, 1);
    assert.equal(domainInspectData.codeRepositories[0].sourceExists, true);
    assert.deepEqual(domainInspectData.catalogDocuments, [
      'catalog/capability-catalog.md',
      'catalog/data-object-evidence.md',
    ]);

    await fsp.writeFile(path.join(initData.workspacePath, 'prd', 'document.md'), '# API regression PRD\n', 'utf8');
    const { response: initialGateResponse, data: initialGateData } = await requestJson(runtime.url, '/api/gates/check', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath }),
    });
    assert.equal(initialGateResponse.status, 200);
    assert.equal(initialGateData.gates['requirement-confirmed'].status, 'blocked');
    assert.equal(fs.existsSync(path.join(initData.workspacePath, '.workflow', 'quality-policy.lock.json')), true);
    assert.equal(fs.existsSync(path.join(initData.workspacePath, '.workflow', 'gates.json')), true);
    const { response: designPromptResponse, data: designPromptData } = await requestJson(runtime.url, `/api/prompt?workspacePath=${workspaceQuery}&stepId=02-generate-technical-design`);
    assert.equal(designPromptResponse.status, 200);
    assert.match(designPromptData.prompt, /领域 Harness 上下文/);
    assert.match(designPromptData.prompt, /context\/domain-summary\.md/);
    assert.match(designPromptData.prompt, /settlement-service/);
    assert.match(designPromptData.prompt, /测试视角/);

    const { response: statusResponse, data: statusData } = await requestJson(runtime.url, `/api/workspace/status?workspacePath=${workspaceQuery}`);
    assert.equal(statusResponse.status, 200);
    assert.equal(statusData.isWorkspace, true);
    assert.equal(statusData.workspacePath, initData.workspacePath);

    const { response: configResponse, data: configData } = await requestJson(runtime.url, '/api/workspace/config', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        notes: 'API regression context',
        loadAppContextForClarification: true,
      }),
    });
    assert.equal(configResponse.status, 200);
    assert.equal(configData.config.notes, 'API regression context');
    assert.equal(configData.config.loadAppContextForClarification, true);

    const unavailableSkillPath = path.join(tempRoot, 'not-installed-skill');
    const { response: unavailableCapabilityResponse, data: unavailableCapabilityData } = await requestJson(runtime.url, '/api/workspace/config', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        skills: [unavailableSkillPath],
      }),
    });
    assert.equal(unavailableCapabilityResponse.status, 200);
    const { response: capabilityRefreshResponse, data: capabilityRefreshData } = await requestJson(runtime.url, '/api/workspace/capabilities/refresh', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath }),
    });
    assert.equal(capabilityRefreshResponse.status, 200);
    assert.equal(capabilityRefreshData.skills.some((item) => item.availability === 'unavailable'), true);
    const refreshedCapabilitySnapshot = await fsp.readFile(path.join(initData.workspacePath, 'context', 'capabilities.md'), 'utf8');
    assert.match(refreshedCapabilitySnapshot, /\[unavailable\]/);
    const { response: unavailablePromptResponse, data: unavailablePromptData } = await requestJson(runtime.url, `/api/prompt?workspacePath=${workspaceQuery}&stepId=02-generate-technical-design`);
    assert.equal(unavailablePromptResponse.status, 200);
    assert.match(unavailablePromptData.prompt, /本机未挂载能力/);
    assert.match(unavailablePromptData.prompt, /不是前置条件/);

    await fsp.writeFile(path.join(initData.workspacePath, 'review', 'quality-report.md'), '# AI Review\nP0: block release\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'review', 'evidence', 'risk-list.md'), '# Risk List\nP2: follow up\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'design', 'unit-test-design.md'), '# Unit Test Design\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'review', 'evidence', 'unit-test-result.md'), '# Unit Test Result\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'design', 'technical-design.md'), '# Technical Design\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'design', 'process', 'technical-confirmation.md'), '# Technical Confirmation\n\n## 确认结果\n\n无阻塞项。\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'design', 'smoke-test-design.md'), '# Smoke Test Design\n', 'utf8');
    const { response: checkpointResponse, data: checkpointData } = await requestJson(runtime.url, '/api/checkpoint/approve', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        stepId: 'manual-technical',
        operator: 'regression-user',
        checklist: [
          'reviewed-technical-files', 'app-scope-confirmed', 'branch-strategy-confirmed', 'risk-accepted', 'review-comments-resolved', 'test-design-approved', 'allow-task-split',
        ].map((id) => ({ id, checked: true })),
      }),
    });
    assert.equal(checkpointResponse.status, 200, JSON.stringify(checkpointData));
    assert.equal(fs.existsSync(path.join(initData.workspacePath, '.workflow', 'baselines', 'technical-design.lock.json')), true);
    assert.equal(fs.existsSync(path.join(initData.workspacePath, 'context', 'current-context.md')), true);
    const currentContext = await fsp.readFile(path.join(initData.workspacePath, 'context', 'current-context.md'), 'utf8');
    assert.match(currentContext, /新会话必读顺序/);
    assert.match(currentContext, /无阻塞项/);
    const { response: layeredStatusResponse, data: layeredStatusData } = await requestJson(runtime.url, `/api/workspace/status?workspacePath=${workspaceQuery}`);
    assert.equal(layeredStatusResponse.status, 200);
    assert.equal(layeredStatusData.allArtifactFiles.some((item) => item.path === 'design/process/technical-confirmation.md'), true);
    assert.equal(layeredStatusData.artifactFiles.some((item) => item.path === 'design/process/technical-confirmation.md'), false);
    const { response: baselineResponse, data: baselineData } = await requestJson(runtime.url, '/api/workspace/design-baselines/verify', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath }),
    });
    assert.equal(baselineResponse.status, 200);
    assert.equal(baselineData.status, 'valid');
    const { response: designGateResponse, data: designGateData } = await requestJson(runtime.url, '/api/gates/check', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath }),
    });
    assert.equal(designGateResponse.status, 200);
    assert.equal(designGateData.gates['design-ready'].status, 'ready-for-approval');
    const { response: approveGateResponse, data: approveGateData } = await requestJson(runtime.url, '/api/gates/approve', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath, gateId: 'design-ready', operator: 'regression-user', note: 'design reviewed' }),
    });
    assert.equal(approveGateResponse.status, 200);
    assert.equal(approveGateData.gates['design-ready'].status, 'approved');
    await fsp.writeFile(path.join(initData.workspacePath, 'review', 'evidence', 'traceability-matrix.md'), '# Traceability\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'review', 'evidence', 'smoke-test-result.md'), '# Smoke Result\n', 'utf8');
    const { response: qualityResponse, data: qualityData } = await requestJson(runtime.url, '/api/workspace/quality-summary/refresh', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath }),
    });
    assert.equal(qualityResponse.status, 200);
    assert.equal(qualityData.status, 'blocked');
    assert.equal(qualityData.severities.P0, 1);
    assert.equal(fs.existsSync(path.join(initData.workspacePath, '.workflow', 'quality-summary.json')), true);

    await fsp.mkdir(path.join(initData.workspacePath, 'archive'), { recursive: true });
    await fsp.writeFile(path.join(initData.workspacePath, 'archive', 'knowledge-card.md'), '# Archive Case\nReusable settlement adjustment conclusion.\n', 'utf8');
    const { response: proposalResponse, data: proposalData } = await requestJson(runtime.url, '/api/workspace/knowledge-update-proposal', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath }),
    });
    assert.equal(proposalResponse.status, 200);
    assert.equal(proposalData.status, 'pending-knowledge-owner-review');
    assert.equal(proposalData.qualityStatus, 'blocked');
    assert.equal(fs.existsSync(path.join(initData.workspacePath, 'archive', 'knowledge-update-proposal.json')), true);
    assert.equal(fs.existsSync(path.join(initData.workspacePath, 'archive', 'knowledge-patch.md')), true);

    const { response: definitionResponse, data: definitionData } = await requestJson(runtime.url, `/api/definition?workspacePath=${workspaceQuery}`);
    assert.equal(definitionResponse.status, 200);
    assert.equal(typeof definitionData.steps['import-prd'], 'object');

    const { response: handoffResponse, data: handoffData } = await requestJson(runtime.url, '/api/agent/handoff', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        stepId: 'import-prd',
        agent: 'codex',
        port: runtime.port,
      }),
    });
    assert.equal(handoffResponse.status, 200, JSON.stringify(handoffData));
    assert.equal(handoffData.stepId, 'import-prd');
    assert.equal(fs.existsSync(path.join(initData.workspacePath, '.workflow', 'handoff', 'current.md')), true);
    const handoffText = await fsp.readFile(path.join(initData.workspacePath, '.workflow', 'handoff', 'current.md'), 'utf8');
    assert.match(handoffText, /领域 Harness 上下文/);

    const staticModules = [
      ['/js/app-state.js', /DWAppState/],
      ['/js/app-checkpoint.js', /DWCheckpointDomain/],
      ['/js/app-artifacts.js', /DWArtifactDomain/],
      ['/js/app-workspace.js', /DWWorkspaceDomain/],
    ];
    for (const [relativePath, marker] of staticModules) {
      const { response, text } = await requestText(runtime.url, relativePath);
      assert.equal(response.status, 200);
      assert.match(text, marker);
    }

    const runsDir = path.join(initData.workspacePath, '.workflow', 'runs');
    await fsp.mkdir(runsDir, { recursive: true });
    const runId = 'api-regression-run';
    const runFile = path.join(runsDir, `${runId}.json`);
    const logFile = path.join(runsDir, `${runId}.log`);
    const fixturePath = path.join(tempRoot, process.platform === 'win32' ? 'simulated-agent.cmd' : 'simulated-agent.sh');
    const fixtureContent = process.platform === 'win32'
      ? '@echo off\r\necho runner-ok\r\necho runner-warning 1>&2\r\nexit /b 0\r\n'
      : '#!/usr/bin/env sh\nprintf "runner-ok"\nprintf "runner-warning" >&2\n';
    await fsp.writeFile(fixturePath, fixtureContent, 'utf8');
    if (process.platform !== 'win32') {
      await fsp.chmod(fixturePath, 0o755);
    }

    const runner = createAgentRunnerRuntime({
      assertWithin,
      writeRunMeta: (filePath, meta) => fsp.writeFile(filePath, JSON.stringify(meta, null, 2), 'utf8'),
      appendRunLog: (filePath, text) => fsp.appendFile(filePath, text, 'utf8'),
      nowIso: () => new Date().toISOString(),
    });
    await runner.launchAgentProcess({
      workspacePath: initData.workspacePath,
      runId,
      prompt: 'simulated prompt',
      commandSpec: {
        command: fixturePath,
        args: [],
      },
      runFile,
      logFile,
      meta: {
        runId,
        stepId: 'import-prd',
        executor: 'simulated',
        status: 'running',
        workspacePath: initData.workspacePath,
        startedAt: new Date().toISOString(),
        endedAt: '',
        exitCode: null,
        error: '',
      },
      initialLog: '# Regression run\n',
    });

    await waitFor(async () => {
      const meta = JSON.parse(await fsp.readFile(runFile, 'utf8'));
      return meta.status !== 'running';
    });
    const completedMeta = JSON.parse(await fsp.readFile(runFile, 'utf8'));
    assert.equal(completedMeta.status, 'success');
    const logText = await fsp.readFile(logFile, 'utf8');
    assert.match(logText, /runner-ok/);
    assert.match(logText, /runner-warning/);

    const { response: runsResponse, data: runsData } = await requestJson(runtime.url, `/api/runs/list?workspacePath=${workspaceQuery}`);
    assert.equal(runsResponse.status, 200);
    assert.equal(runsData.runs.some((run) => run.runId === runId && run.status === 'success'), true);

    const { response: runLogResponse, data: runLogData } = await requestJson(runtime.url, `/api/runs/log?workspacePath=${workspaceQuery}&runId=${runId}`);
    assert.equal(runLogResponse.status, 200);
    assert.equal(runLogData.meta.status, 'success');
    assert.match(runLogData.log, /runner-ok/);

    console.log(`API regression passed: ${initData.workspacePath}`);
  } finally {
    await new Promise((resolve, reject) => runtime.server.close((error) => (error ? reject(error) : resolve())));
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
