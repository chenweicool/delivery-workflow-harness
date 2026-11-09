#!/usr/bin/env node

const assert = require('assert/strict');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const tempRoot = path.join(os.tmpdir(), 'delivery-workflow-v3-api', `run-${Date.now()}`);
process.env.DELIVERY_WORKFLOW_DATA_DIR = path.join(tempRoot, '.data');

const { startServer, initWorkspace } = require(path.join(rootDir, 'console', 'server.js'));

async function requestJson(baseUrl, relativePath, options = {}) {
  const response = await fetch(`${baseUrl}${relativePath}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json();
  return { response, data };
}

async function main() {
  await fsp.mkdir(tempRoot, { recursive: true });
  const workspacePath = await initWorkspace('api-v3', tempRoot, '', {
    owner: { name: 'API', id: 'api' },
    url: 'https://example.internal/demand/api-v3',
    context: 'API regression',
  });
  const { server, url } = await startServer({ port: 0 });
  try {
    const indexResponse = await fetch(`${url}/`);
    assert.equal(indexResponse.status, 200);
    assert.match(await indexResponse.text(), /自主交付/);
    const controlPlaneResponse = await fetch(`${url}/control-plane.js`);
    assert.equal(controlPlaneResponse.status, 200);

    const status = await requestJson(url, `/api/workspace/status?workspacePath=${encodeURIComponent(workspacePath)}`);
    assert.equal(status.response.status, 200);
    assert.equal(status.data.workflow.version, 3);
    assert.equal(status.data.nextRecommendation.stepId, 'execute-delivery');

    const report = await requestJson(url, '/api/risks/report', {
      method: 'POST',
      body: JSON.stringify({ workspacePath, type: 'api-contract', scope: 'public DTO', impact: 'consumer compatibility', rollback: 'restore prior DTO' }),
    });
    assert.equal(report.response.status, 200);
    assert.equal(report.data.id, 'R-001');
    assert.equal(report.data.status, 'waiting');

    const blocked = await requestJson(url, `/api/workspace/status?workspacePath=${encodeURIComponent(workspacePath)}`);
    assert.equal(blocked.data.nextRecommendation.status, 'blocked');
    assert.equal(blocked.data.risks.unresolved.length, 1);

    const decision = await requestJson(url, '/api/risks/decide', {
      method: 'POST',
      body: JSON.stringify({ workspacePath, riskId: 'R-001', action: 'approve', note: 'contract versioned', operator: 'API' }),
    });
    assert.equal(decision.response.status, 200);
    assert.equal(decision.data.status, 'approved');

    const risks = await requestJson(url, `/api/risks?workspacePath=${encodeURIComponent(workspacePath)}`);
    assert.equal(risks.data.clear, true);
    assert.equal(risks.data.approved, 1);

    const validation = await requestJson(url, '/api/delivery/validate', {
      method: 'POST', body: JSON.stringify({ workspacePath }),
    });
    assert.equal(validation.response.status, 500);
    assert.match(validation.data.error, /应用仓库/);
    console.log('API regression passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
