#!/usr/bin/env node

const assert = require('assert/strict');
const fs = require('fs/promises');
const http = require('http');
const os = require('os');
const path = require('path');
const { buildAuthorizationUrl, buildWindowsOpenArgs, ensureAuthorizationUrlReachable, createHarnessClientRuntime } = require('../console/lib/harness-client');

async function main() {
  const authorizationUrl = new URL(buildAuthorizationUrl('https://harness.example.internal/#/harness/authorize', {
    client_id: 'delivery-workflow-desktop',
    redirect_uri: 'http://127.0.0.1:39999/callback',
    state: 'test-state',
    code_challenge: 'test-challenge',
  }));
  assert.equal(authorizationUrl.search, '');
  assert.equal(authorizationUrl.hash.startsWith('#/harness/authorize?'), true);
  const authorizationParams = new URLSearchParams(authorizationUrl.hash.split('?')[1]);
  assert.equal(authorizationParams.get('client_id'), 'delivery-workflow-desktop');
  assert.equal(authorizationParams.get('redirect_uri'), 'http://127.0.0.1:39999/callback');
  assert.equal(authorizationParams.get('state'), 'test-state');
  assert.equal(authorizationParams.get('code_challenge'), 'test-challenge');
  const windowsArgs = buildWindowsOpenArgs(authorizationUrl.toString());
  assert.deepEqual(windowsArgs, [authorizationUrl.toString()]);
  await ensureAuthorizationUrlReachable('http://harness.example.internal/#/harness/authorize', {
    fetchImpl: async () => ({ status: 200 }),
  });
  await assert.rejects(
    () => ensureAuthorizationUrlReachable('https://harness.example.internal/#/harness/authorize', {
      fetchImpl: async () => { throw new TypeError('fetch failed'); },
    }),
    /无法访问 Harness 授权页 https:\/\/harness\.example\.internal。请检查授权页地址的协议和端口/,
  );
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'delivery-workflow-harness-client-'));
  const report = {
    schemaVersion: '1.0',
    reportId: 'dvr_11111111-1111-4111-8111-111111111111',
    generatedAt: '2026-08-06T08:00:00.000Z',
    demand: {
      startedAt: '2026-08-05T08:00:00.000Z',
      completedAt: '2026-08-06T08:00:00.000Z',
      owner: { name: 'Harness Test', id: 'harness-test' },
      url: 'https://example.internal/demand/harness-test',
    },
    extensions: {},
  };
  await fs.writeFile(path.join(workspacePath, 'AGENTS.md'), '# Test\n', 'utf8');
  await fs.mkdir(path.join(workspacePath, 'delivery'), { recursive: true });
  await fs.writeFile(path.join(workspacePath, 'delivery', 'delivery-report.json'), JSON.stringify(report), 'utf8');

  let received = null;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = {
      token: req.headers['x-harness-token'],
      report: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    };
    const body = JSON.stringify({ code: 200, data: { accepted: true, duplicate: false } });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const tokenName = 'HARNESS_TEST_TOKEN';
  process.env[tokenName] = 'test-token';

  const client = createHarnessClientRuntime({
    normalizeUserPath: (value) => path.resolve(value),
    exists: async (target) => fs.access(target).then(() => true).catch(() => false),
    readJsonFileIfExists: async (root, relative) => JSON.parse(await fs.readFile(path.join(root, relative), 'utf8')),
    writeWorkspaceJsonFile: async (root, relative, data) => {
      const file = path.join(root, relative);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
    },
    readToolsConfig: async () => ({
      integrations: {
        harnessClient: {
          enabled: true,
          serverUrl: `http://127.0.0.1:${address.port}/api/v1/harness/delivery-reports`,
          tokenEnv: tokenName,
        },
      },
    }),
    nowIso: () => '2026-08-06T08:01:00.000Z',
  });

  try {
    const result = await client.submitDeliveryReport(workspacePath);
    assert.equal(result.status, 'submitted');
    assert.equal(received.token, 'test-token');
    assert.equal(received.report.reportId, report.reportId);
    const receipt = JSON.parse(await fs.readFile(path.join(workspacePath, result.receiptFile), 'utf8'));
    assert.equal(receipt.status, 'submitted');
    console.log('Harness client check passed.');
  } finally {
    delete process.env[tokenName];
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(workspacePath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
