#!/usr/bin/env node

const assert = require('assert/strict');
const { EventEmitter } = require('events');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const tempRoot = path.join(os.tmpdir(), 'delivery-workflow-api-regression', `run-${Date.now()}`);
process.env.DELIVERY_WORKFLOW_DATA_DIR = path.join(tempRoot, '.data');

const { startServer, buildWindowsPickerScript, completeAgentHandoff } = require(path.join(rootDir, 'console', 'server.js'));
const { assertWithin } = require(path.join(rootDir, 'console', 'lib', 'fs-utils.js'));
const { createAgentRunnerRuntime } = require(path.join(rootDir, 'console', 'lib', 'agent-runner.js'));
const { writeJsonAtomically, readJsonWithRetry } = require(path.join(rootDir, 'console', 'lib', 'run-store.js'));

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

function createMinimalDocxBuffer() {
  const name = Buffer.from('word/document.xml', 'utf8');
  const xml = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>Word PRD 正文</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>字段</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>说明</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>状态</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>必填</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>', 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(xml.length, 18); local.writeUInt32LE(xml.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(xml.length, 20); central.writeUInt32LE(xml.length, 24); central.writeUInt16LE(name.length, 28);
  const centralOffset = local.length + name.length + xml.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, name, xml, central, name, end]);
}

async function main() {
  const windowsPickerScript = buildWindowsPickerScript("Write-Output '中文目录'");
  assert.match(windowsPickerScript, /\$OutputEncoding = \[Console\]::OutputEncoding = \[System\.Text\.UTF8Encoding\]::new\(\)/);

  await fsp.mkdir(tempRoot, { recursive: true });
  const domainRoot = path.join(tempRoot, 'settlement-domain');
  const referenceDomainRoot = path.join(tempRoot, 'settlement-reference-domain');
  await createDomainHarnessFixture(domainRoot);
  await createDomainHarnessFixture(referenceDomainRoot);
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

    const demandContext = '当前需求只调整国内结算流程；先核对历史口径，不修改共享知识库。';
    const { response: contextOnlyInitResponse, data: contextOnlyInitData } = await requestJson(runtime.url, '/api/workspaces/init', {
      method: 'POST',
      body: JSON.stringify({
        demandName: 'context-only-regression',
        outputRoot: workspaceRoot,
        domainRoots: [],
        perspective: 'backend',
        demand: {
          url: 'https://example.internal/demand/context-only-regression',
          context: demandContext,
          owner: { name: '上下文回归', id: 'context-regression' },
        },
      }),
    });
    assert.equal(contextOnlyInitResponse.status, 200);
    assert.equal(contextOnlyInitData.domain, null);
    assert.deepEqual(contextOnlyInitData.domains, []);
    const contextOnlyWorkspaceConfig = JSON.parse(await fsp.readFile(path.join(contextOnlyInitData.workspacePath, '.workflow', 'workspace.json'), 'utf8'));
    assert.equal(contextOnlyWorkspaceConfig.demand.context, demandContext);
    const demandContextSnapshot = await fsp.readFile(path.join(contextOnlyInitData.workspacePath, 'context', 'demand-context.md'), 'utf8');
    assert.match(demandContextSnapshot, /当前需求只调整国内结算流程/);
    const emptyDomainSummary = await fsp.readFile(path.join(contextOnlyInitData.workspacePath, 'context', 'domain-summary.md'), 'utf8');
    assert.match(emptyDomainSummary, /未挂载领域 Harness；这不是流程阻塞项/);
    const emptyDomainLock = JSON.parse(await fsp.readFile(path.join(contextOnlyInitData.workspacePath, '.workflow', 'domain.lock.json'), 'utf8'));
    assert.equal(emptyDomainLock.primaryDomainRoot, '');
    assert.deepEqual(emptyDomainLock.domains, []);
    const contextOnlyQuery = encodeURIComponent(contextOnlyInitData.workspacePath);
    const { response: contextOnlyPromptResponse, data: contextOnlyPromptData } = await requestJson(runtime.url, `/api/prompt?workspacePath=${contextOnlyQuery}&stepId=00-load-context`);
    assert.equal(contextOnlyPromptResponse.status, 200);
    assert.match(contextOnlyPromptData.prompt, /context\/demand-context\.md/);
    assert.match(contextOnlyPromptData.prompt, /未挂载领域 Harness 时继续/);

    const { response: initResponse, data: initData } = await requestJson(runtime.url, '/api/workspaces/init', {
      method: 'POST',
      body: JSON.stringify({
        demandName: 'api-regression',
        outputRoot: workspaceRoot,
        domainRoots: [domainRoot, referenceDomainRoot],
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
    assert.equal(initData.domain.domains.length, 2);
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
    const appSourcePath = path.join(tempRoot, 'repositories', 'settlement-service');
    await fsp.mkdir(appSourcePath, { recursive: true });
    const { response: applicationScopeConfigResponse, data: applicationScopeConfigData } = await requestJson(runtime.url, '/api/workspace/config', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        apps: [{ name: 'settlement-service', projectId: '12345', sourcePath: appSourcePath }],
      }),
    });
    assert.equal(applicationScopeConfigResponse.status, 200);
    assert.equal(applicationScopeConfigData.config.apps[0].projectId, '12345');
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
    assert.deepEqual(reportData.report.extensions.applicationScope, {
      version: '1.0',
      applications: [{ projectId: '12345', name: 'settlement-service' }],
    });
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
    await fsp.writeFile(localDocx, createMinimalDocxBuffer());
    const { response: localImportResponse, data: localImportData } = await requestJson(runtime.url, '/api/workspace/import-local-prd', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath, sourcePaths: [localMarkdown, localDocx] }),
    });
    assert.equal(localImportResponse.status, 200);
    assert.equal(localImportData.ingestion.document.status, 'generated');
    assert.equal(localImportData.ingestion.records.some((item) => item.kind === 'docx' && item.adapter === 'builtin-docx' && item.status === 'normalized'), true);
    const normalizedPrd = await fsp.readFile(path.join(initData.workspacePath, 'prd', 'document.md'), 'utf8');
    assert.match(normalizedPrd, /本地 PRD/);
    assert.match(normalizedPrd, /Word PRD 正文/);
    assert.match(normalizedPrd, /\| 字段 \| 说明 \|/);
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
    assert.equal(initialGateResponse.status, 200, JSON.stringify(initialGateData));
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
    const progressPath = path.join(initData.workspacePath, '.workflow', 'progress.json');
    const progressBeforeStatus = await fsp.readFile(progressPath, 'utf8');
    const progressMtimeBeforeStatus = (await fsp.stat(progressPath)).mtimeMs;
    const { response: secondStatusResponse } = await requestJson(runtime.url, `/api/workspace/status?workspacePath=${workspaceQuery}`);
    assert.equal(secondStatusResponse.status, 200);
    assert.equal(await fsp.readFile(progressPath, 'utf8'), progressBeforeStatus);
    assert.equal((await fsp.stat(progressPath)).mtimeMs, progressMtimeBeforeStatus);

    const blockedImport = await completeAgentHandoff({
      workspacePath: initData.workspacePath,
      stepId: 'import-prd',
      status: 'blocked',
      summary: '等待产品补齐版本范围。',
      port: runtime.port,
    });
    assert.equal(blockedImport.payload.status, 'blocked');
    assert.equal(blockedImport.payload.revision, 1);
    assert.equal(blockedImport.transition.event.eventType, 'agent-handoff');
    await assert.rejects(
      () => completeAgentHandoff({
        workspacePath: initData.workspacePath,
        stepId: 'import-prd',
        status: 'done',
        summary: '过期客户端不应覆盖当前状态。',
        expectedRevision: 0,
        port: runtime.port,
      }),
      /拒绝旧 revision/,
    );
    const staleHandoff = JSON.parse(await fsp.readFile(path.join(initData.workspacePath, '.workflow', 'handoff', 'done.json'), 'utf8'));
    assert.equal(staleHandoff.status, 'blocked');
    const { response: blockedStatusResponse, data: blockedStatusData } = await requestJson(runtime.url, `/api/workspace/status?workspacePath=${workspaceQuery}`);
    assert.equal(blockedStatusResponse.status, 200);
    assert.equal(blockedStatusData.steps['import-prd'].status, 'blocked');
    assert.equal(blockedStatusData.nextRecommendation.stepId, 'import-prd');
    assert.equal(blockedStatusData.nextRecommendation.status, 'blocked');
    const completedImport = await completeAgentHandoff({
      workspacePath: initData.workspacePath,
      stepId: 'import-prd',
      status: 'done',
      summary: 'PRD 已导入。',
      port: runtime.port,
    });
    assert.equal(completedImport.payload.status, 'done');
    assert.equal(completedImport.payload.revision, 2);
    const retryPayload = {
      workspacePath: initData.workspacePath,
      stepId: 'import-prd',
      status: 'done',
      summary: '重复投递应保持幂等。',
      expectedRevision: completedImport.payload.revision,
      idempotencyKey: 'regression-import-retry',
      port: runtime.port,
    };
    const firstRetry = await completeAgentHandoff(retryPayload);
    const secondRetry = await completeAgentHandoff(retryPayload);
    assert.equal(firstRetry.transition.idempotent, false);
    assert.equal(secondRetry.transition.idempotent, true);
    assert.equal(firstRetry.payload.revision, secondRetry.payload.revision);
    const transitionEvents = (await fsp.readFile(path.join(initData.workspacePath, '.workflow', 'events.jsonl'), 'utf8'))
      .trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(transitionEvents.length, 3);
    assert.deepEqual(transitionEvents.map((item) => item.revision), [1, 2, 3]);
    const transitionIndex = JSON.parse(await fsp.readFile(path.join(initData.workspacePath, '.workflow', 'events-index.json'), 'utf8'));
    assert.equal(transitionIndex.revision, 3);
    await fsp.writeFile(
      path.join(initData.workspacePath, '.workflow', 'events-index.json'),
      JSON.stringify({ ...transitionIndex, revision: 2 }, null, 2),
      'utf8',
    );
    const recoveredImport = await completeAgentHandoff({
      workspacePath: initData.workspacePath,
      stepId: 'import-prd',
      status: 'done',
      summary: '模拟中断后恢复事件投影。',
      expectedRevision: 3,
      idempotencyKey: 'regression-projection-recovery',
      port: runtime.port,
    });
    assert.equal(recoveredImport.transition.recovered, true);
    assert.equal(recoveredImport.payload.revision, 4);
    const recoveredIndex = JSON.parse(await fsp.readFile(path.join(initData.workspacePath, '.workflow', 'events-index.json'), 'utf8'));
    assert.equal(recoveredIndex.revision, 4);

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
    assert.equal(capabilityRefreshData.skills.length, 0);
    const refreshedCapabilitySnapshot = await fsp.readFile(path.join(initData.workspacePath, 'context', 'capabilities.md'), 'utf8');
    assert.match(refreshedCapabilitySnapshot, /显式安装/);
    const { response: unavailablePromptResponse, data: unavailablePromptData } = await requestJson(runtime.url, `/api/prompt?workspacePath=${workspaceQuery}&stepId=02-generate-technical-design`);
    assert.equal(unavailablePromptResponse.status, 200);
    assert.doesNotMatch(unavailablePromptData.prompt, /not-installed-skill/);
    const explicitSkillPath = path.join(domainRoot, 'skills', 'settlement-analyst');
    const { response: installedCapabilityResponse } = await requestJson(runtime.url, '/api/workspace/config', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        capabilities: [{ id: 'settlement-analyst', type: 'skill', path: explicitSkillPath, installed: true, enabled: true }],
      }),
    });
    assert.equal(installedCapabilityResponse.status, 200);
    const { response: installedRefreshResponse, data: installedRefreshData } = await requestJson(runtime.url, '/api/workspace/capabilities/refresh', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath }),
    });
    assert.equal(installedRefreshResponse.status, 200);
    assert.equal(installedRefreshData.skills.some((item) => item.id === 'settlement-analyst' && item.availability === 'available'), true);

    await fsp.writeFile(path.join(initData.workspacePath, 'review', 'quality-report.md'), '# AI Review\nP0: block release\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'review', 'evidence', 'risk-list.md'), '# Risk List\nP2: follow up\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'design', 'unit-test-design.md'), '# Unit Test Design\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'design', 'smoke-test-design.md'), '# Smoke Test Design\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'review', 'evidence', 'unit-test-result.md'), '# Unit Test Result\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'design', 'technical-design.md'), '# Technical Design\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'design', 'process', 'requirement-confirmation.md'), '# Requirement Confirmation\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'design', 'process', 'technical-confirmation.md'), '# Technical Confirmation\n\n## 确认结果\n\n无阻塞项。\n', 'utf8');
    const { response: requirementExceptionResponse, data: requirementExceptionData } = await requestJson(runtime.url, '/api/gates/exception', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        gateId: 'requirement-confirmed',
        operator: 'regression-user',
        note: 'temporary regression exception',
        exceptionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
    assert.equal(requirementExceptionResponse.status, 200);
    assert.equal(requirementExceptionData.gates['requirement-confirmed'].status, 'exception-approved');
    const gatesPath = path.join(initData.workspacePath, '.workflow', 'gates.json');
    const gatesWithExpiredException = JSON.parse(await fsp.readFile(gatesPath, 'utf8'));
    gatesWithExpiredException.gates['requirement-confirmed'].exception.expiresAt = new Date(Date.now() - 1_000).toISOString();
    await fsp.writeFile(gatesPath, JSON.stringify(gatesWithExpiredException, null, 2), 'utf8');
    const { response: expiredGateResponse, data: expiredGateData } = await requestJson(runtime.url, '/api/gates/check', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath }),
    });
    assert.equal(expiredGateResponse.status, 200);
    assert.equal(expiredGateData.gates['requirement-confirmed'].status, 'stale');
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
    assert.equal(checkpointData.transition.event.eventType, 'manual-checkpoint');
    const technicalApprovalPath = path.join(initData.workspacePath, 'design', 'approvals', 'technical-design.approved.json');
    const approvalBeforeStaleCheckpoint = await fsp.readFile(technicalApprovalPath, 'utf8');
    const { response: staleCheckpointResponse, data: staleCheckpointData } = await requestJson(runtime.url, '/api/checkpoint/reject', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        stepId: 'manual-technical',
        note: '过期页面不能退回当前确认。',
        expectedRevision: checkpointData.transition.revision - 1,
      }),
    });
    assert.equal(staleCheckpointResponse.status, 409);
    assert.match(staleCheckpointData.error, /拒绝旧 revision/);
    assert.equal(await fsp.readFile(technicalApprovalPath, 'utf8'), approvalBeforeStaleCheckpoint);
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
    await fsp.writeFile(path.join(initData.workspacePath, 'design', 'technical-design.md'), '# Technical Design\n\nchanged after approval\n', 'utf8');
    const { response: staleGateResponse, data: staleGateData } = await requestJson(runtime.url, '/api/gates/check', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath }),
    });
    assert.equal(staleGateResponse.status, 200);
    assert.equal(staleGateData.gates['design-ready'].status, 'stale');
    const { response: staleBaselineStatusResponse, data: staleBaselineStatusData } = await requestJson(runtime.url, `/api/workspace/status?workspacePath=${workspaceQuery}`);
    assert.equal(staleBaselineStatusResponse.status, 200);
    assert.equal(staleBaselineStatusData.steps['manual-technical'].status, 'stale');
    await fsp.writeFile(path.join(initData.workspacePath, 'review', 'evidence', 'traceability-matrix.md'), '# Traceability\n', 'utf8');
    await fsp.writeFile(path.join(initData.workspacePath, 'review', 'evidence', 'smoke-test-case.md'), '# 研发提供的冒烟用例\n', 'utf8');
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

    const { response: changeResponse, data: changeData } = await requestJson(runtime.url, '/api/workspace/changes', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        type: 'design-change',
        reason: '调整技术方案后需要重新验证。',
        source: 'regression',
        operator: 'regression-user',
      }),
    });
    assert.equal(changeResponse.status, 200);
    assert.equal(changeData.record.changeSetId, 'DESIGN-001');
    const { response: changeImpactResponse, data: changeImpactData } = await requestJson(runtime.url, '/api/workspace/changes/impact', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath, changeSetId: changeData.record.changeSetId }),
    });
    assert.equal(changeImpactResponse.status, 200);
    assert.equal(changeImpactData.impact.affectedSteps.includes('manual-technical'), true);
    assert.equal(changeImpactData.impact.gatesToRecheck.includes('design-ready'), true);
    const { response: candidateResponse, data: candidateData } = await requestJson(runtime.url, '/api/workspace/candidates', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        changeSetId: changeData.record.changeSetId,
        title: 'Regression candidate',
        operator: 'regression-user',
      }),
    });
    assert.equal(candidateResponse.status, 200);
    assert.equal(candidateData.record.candidateId, 'C-001');
    const { response: candidateVerifyResponse, data: candidateVerifyData } = await requestJson(runtime.url, '/api/workspace/candidates/verify', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath, candidateId: candidateData.record.candidateId }),
    });
    assert.equal(candidateVerifyResponse.status, 200);
    assert.equal(candidateVerifyData.status, 'valid');
    const { response: evidenceResponse, data: evidenceData } = await requestJson(runtime.url, '/api/workspace/candidates/evidence', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        candidateId: candidateData.record.candidateId,
        kind: 'review',
        path: 'review/quality-report.md',
        status: 'passed',
        operator: 'regression-user',
      }),
    });
    assert.equal(evidenceResponse.status, 200);
    assert.equal(evidenceData.evidence.candidateFingerprint, candidateData.record.fingerprint);
    for (const [kind, evidencePath] of [
      ['unit-test', 'review/evidence/unit-test-result.md'],
      ['smoke-test', 'review/evidence/smoke-test-result.md'],
    ]) {
      const { response } = await requestJson(runtime.url, '/api/workspace/candidates/evidence', {
        method: 'POST',
        body: JSON.stringify({
          workspacePath: initData.workspacePath,
          candidateId: candidateData.record.candidateId,
          kind,
          path: evidencePath,
          status: 'passed',
          operator: 'regression-user',
        }),
      });
      assert.equal(response.status, 200);
    }
    const { response: candidateGateResponse, data: candidateGateData } = await requestJson(runtime.url, '/api/gates/check', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath }),
    });
    assert.equal(candidateGateResponse.status, 200);
    assert.equal(candidateGateData.gates['delivery-verified'].candidate.binding.candidateId, candidateData.record.candidateId);
    assert.equal(candidateGateData.gates['delivery-verified'].candidate.issues.length, 0);
    const { response: candidateGateApproveResponse, data: candidateGateApproveData } = await requestJson(runtime.url, '/api/gates/approve', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath, gateId: 'delivery-verified', operator: 'regression-user', note: 'candidate evidence reviewed' }),
    });
    assert.equal(candidateGateApproveResponse.status, 200);
    assert.equal(candidateGateApproveData.gates['delivery-verified'].status, 'approved');
    assert.equal(candidateGateApproveData.gates['delivery-verified'].approvalSnapshot.candidateId, candidateData.record.candidateId);
    const completedVerification = await completeAgentHandoff({
      workspacePath: initData.workspacePath,
      stepId: '08-verify-tests',
      status: 'done',
      summary: '绑定当前 Candidate 的单测证据。',
      candidateId: candidateData.record.candidateId,
      port: runtime.port,
    });
    assert.equal(completedVerification.payload.candidateId, candidateData.record.candidateId);
    assert.match(completedVerification.payload.candidateEvidenceId, /^C-001-unit-test-/);
    await fsp.writeFile(path.join(initData.workspacePath, 'review', 'quality-report.md'), '# AI Review\n\nmodified after evidence binding\n', 'utf8');
    const { response: staleEvidenceGateResponse, data: staleEvidenceGateData } = await requestJson(runtime.url, '/api/gates/check', {
      method: 'POST',
      body: JSON.stringify({ workspacePath: initData.workspacePath }),
    });
    assert.equal(staleEvidenceGateResponse.status, 200);
    assert.equal(staleEvidenceGateData.gates['delivery-verified'].status, 'blocked');
    assert.equal(staleEvidenceGateData.gates['delivery-verified'].candidate.issues.some((item) => /证据已变化/.test(item)), true);
    const { response: iterationStatusResponse, data: iterationStatusData } = await requestJson(runtime.url, `/api/workspace/status?workspacePath=${workspaceQuery}`);
    assert.equal(iterationStatusResponse.status, 200);
    assert.equal(iterationStatusData.iteration.activeChangeSetId, changeData.record.changeSetId);
    assert.equal(iterationStatusData.iteration.activeCandidateId, candidateData.record.candidateId);
    const { response: reopenResponse, data: reopenData } = await requestJson(runtime.url, '/api/workspace/reopen', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        changeSetId: changeData.record.changeSetId,
        fromStepId: '02-generate-technical-design',
        reason: '设计基线发生变化。',
        operator: 'regression-user',
      }),
    });
    assert.equal(reopenResponse.status, 200);
    assert.equal(reopenData.reopenedSteps.includes('manual-technical'), true);
    assert.equal(reopenData.transition.event.eventType, 'change-reopen');
    assert.equal(reopenData.transition.revision > checkpointData.transition.revision, true);
    const supersededApproval = JSON.parse(await fsp.readFile(path.join(initData.workspacePath, 'design', 'approvals', 'technical-design.approved.json'), 'utf8'));
    assert.equal(supersededApproval.status, 'superseded');
    const { response: reopenedStatusResponse, data: reopenedStatusData } = await requestJson(runtime.url, `/api/workspace/status?workspacePath=${workspaceQuery}`);
    assert.equal(reopenedStatusResponse.status, 200);
    assert.equal(reopenedStatusData.steps['manual-technical'].status, 'pending');
    assert.equal(reopenedStatusData.iteration.activeCandidateId, '');
    const { response: autoChangeReopenResponse, data: autoChangeReopenData } = await requestJson(runtime.url, '/api/workspace/reopen', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        fromStepId: '06-implement-task',
        reason: '验证自动创建 ChangeSet 的重开。',
        expectedRevision: reopenData.transition.revision,
        operator: 'regression-user',
      }),
    });
    assert.equal(autoChangeReopenResponse.status, 200);
    assert.equal(autoChangeReopenData.changeSet.changeSetId, 'DESIGN-002');
    const { response: changesBeforeStaleResponse, data: changesBeforeStaleData } = await requestJson(runtime.url, `/api/workspace/changes?workspacePath=${workspaceQuery}`);
    assert.equal(changesBeforeStaleResponse.status, 200);
    const { response: staleReopenResponse, data: staleReopenData } = await requestJson(runtime.url, '/api/workspace/reopen', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath: initData.workspacePath,
        fromStepId: '06-implement-task',
        reason: '过期重开不应创建 ChangeSet。',
        expectedRevision: autoChangeReopenData.transition.revision - 1,
        operator: 'regression-user',
      }),
    });
    assert.equal(staleReopenResponse.status, 409);
    assert.match(staleReopenData.error, /拒绝旧 revision/);
    const { response: changesAfterStaleResponse, data: changesAfterStaleData } = await requestJson(runtime.url, `/api/workspace/changes?workspacePath=${workspaceQuery}`);
    assert.equal(changesAfterStaleResponse.status, 200);
    assert.equal(changesAfterStaleData.changeSets.length, changesBeforeStaleData.changeSets.length);

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
    const atomicProbeFile = path.join(tempRoot, 'atomic-write-probe.json');
    await writeJsonAtomically(atomicProbeFile, { sequence: -1, payload: '' });
    for (let sequence = 0; sequence < 100; sequence += 1) {
      const pendingWrite = writeJsonAtomically(atomicProbeFile, { sequence, payload: 'x'.repeat(64 * 1024) });
      assert.doesNotThrow(() => JSON.parse(fs.readFileSync(atomicProbeFile, 'utf8')));
      await pendingWrite;
    }
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
      writeRunMeta: writeJsonAtomically,
      appendRunLog: (filePath, text) => fsp.appendFile(filePath, text, 'utf8'),
      nowIso: () => new Date().toISOString(),
    });
    const immediateRunId = 'api-regression-immediate-run';
    const immediateRunFile = path.join(runsDir, `${immediateRunId}.json`);
    const immediateLogFile = path.join(runsDir, `${immediateRunId}.log`);
    const immediateRunner = createAgentRunnerRuntime({
      assertWithin,
      writeRunMeta: writeJsonAtomically,
      appendRunLog: (filePath, text) => fsp.appendFile(filePath, text, 'utf8'),
      nowIso: () => new Date().toISOString(),
      spawnImpl: () => {
        const child = new EventEmitter();
        child.pid = 4242;
        child.stdin = { end() {} };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        queueMicrotask(() => child.emit('close', 0));
        return child;
      },
    });
    await immediateRunner.launchAgentProcess({
      workspacePath: initData.workspacePath,
      runId: immediateRunId,
      prompt: 'immediate simulated prompt',
      commandSpec: { command: 'immediate-simulated-agent', args: [] },
      runFile: immediateRunFile,
      logFile: immediateLogFile,
      meta: {
        runId: immediateRunId,
        stepId: 'import-prd',
        executor: 'simulated',
        status: 'running',
        workspacePath: initData.workspacePath,
        startedAt: new Date().toISOString(),
        endedAt: '',
        exitCode: null,
        error: '',
      },
      initialLog: '# Immediate regression run\n',
    });
    await waitFor(async () => (await readJsonWithRetry(immediateRunFile)).status !== 'running');
    assert.equal((await readJsonWithRetry(immediateRunFile)).status, 'success');
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
      const meta = await readJsonWithRetry(runFile);
      return meta.status !== 'running';
    });
    const completedMeta = await readJsonWithRetry(runFile);
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

    const workflowPath = path.join(initData.workspacePath, '.workflow', 'workflow.json');
    const preservedProgress = await fsp.readFile(progressPath, 'utf8');
    const preservedWorkflow = await fsp.readFile(workflowPath, 'utf8');
    const preservedApproval = await fsp.readFile(technicalApprovalPath, 'utf8');
    await fsp.writeFile(progressPath, '{not-json', 'utf8');
    const { response: invalidProgressResponse, data: invalidProgressData } = await requestJson(runtime.url, `/api/workspace/status?workspacePath=${workspaceQuery}`);
    assert.equal(invalidProgressResponse.status, 500);
    assert.match(invalidProgressData.error, /进度文件不是合法 JSON/);
    await fsp.writeFile(progressPath, preservedProgress, 'utf8');
    await fsp.writeFile(workflowPath, '{not-json', 'utf8');
    const { response: invalidWorkflowResponse, data: invalidWorkflowData } = await requestJson(runtime.url, `/api/workspace/status?workspacePath=${workspaceQuery}`);
    assert.equal(invalidWorkflowResponse.status, 500);
    assert.match(invalidWorkflowData.error, /Workflow 定义不是合法 JSON/);
    await fsp.writeFile(workflowPath, preservedWorkflow, 'utf8');
    await fsp.writeFile(technicalApprovalPath, '{not-json', 'utf8');
    const { response: invalidApprovalResponse, data: invalidApprovalData } = await requestJson(runtime.url, `/api/workspace/status?workspacePath=${workspaceQuery}`);
    assert.equal(invalidApprovalResponse.status, 500);
    assert.match(invalidApprovalData.error, /Workspace JSON 文件不是合法 JSON/);
    await fsp.writeFile(technicalApprovalPath, preservedApproval, 'utf8');

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
