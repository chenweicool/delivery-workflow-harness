#!/usr/bin/env node

const assert = require('assert');
const fsp = require('fs/promises');
const http = require('http');
const os = require('os');
const path = require('path');

const tmpRoot = path.join(os.tmpdir(), 'delivery-workflow-feishu-check');
process.env.DELIVERY_WORKFLOW_DATA_DIR = path.join(tmpRoot, '.data');

const {
  parseFeishuLink,
  markdownFromBlocks,
  importFeishuDocument,
} = require('../console/lib/feishu');
const {
  initWorkspace,
  saveToolsConfig,
  importFeishuPrd,
} = require('../console/server');

async function startMockMcpServer() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    if (req.method === 'DELETE') {
      requests.push({ method: req.method, headers: req.headers, sessionId: req.headers['mcp-session-id'] || '' });
      res.writeHead(200).end();
      return;
    }
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
    }
    const payload = raw ? JSON.parse(raw) : {};
    requests.push({ method: req.method, payload, headers: req.headers, sessionId: req.headers['mcp-session-id'] || '' });
    if (payload.method === 'notifications/initialized') {
      res.writeHead(202).end();
      return;
    }
    if (payload.method === 'initialize') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': 'test-session',
      });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: payload.id,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'mock-feishu', version: '1.0.0' },
        },
      }));
      return;
    }
    if (payload.method === 'tools/call') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: payload.id,
        result: {
          isError: false,
          content: [{
            type: 'text',
            text: JSON.stringify({
              title: '公司飞书 PRD',
              content: '# 公司飞书 PRD\n\n## 需求\n\n- MCP 正常读取并解析\n\n![流程图](assets/mock-image.png)',
              documentType: 'wiki',
              url: payload.params.arguments.documentUrlOrToken,
              contentSource: 'block-tree',
              blockCount: 5,
              assets: [{
                type: 'image',
                token: 'mock-image',
                localPath: 'assets/mock-image.png',
              }],
              contentStatus: 'complete',
              unresolvedAssets: [],
              downloadedImageCount: 1,
            }),
          }, {
            type: 'image',
            data: 'AQID',
            mimeType: 'image/png',
            _meta: {
              token: 'mock-image',
              localPath: 'assets/mock-image.png',
              fileName: 'mock-image.png',
            },
          }],
        },
      }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    requests,
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function main() {
  const parsed = parseFeishuLink('https://acme.feishu.cn/docx/AbCdEfGh123?from=from_copylink');
  assert.strictEqual(parsed.docType, 'docx');
  assert.strictEqual(parsed.token, 'AbCdEfGh123');

  const markdown = markdownFromBlocks([
    { type: 'heading', level: 1, text: '需求标题' },
    { type: 'paragraph', text: '需求背景' },
    { type: 'bullet', text: '验收标准' },
  ]);
  assert(markdown.includes('# 需求标题'));
  assert(markdown.includes('需求背景'));
  assert(markdown.includes('- 验收标准'));

  const imported = await importFeishuDocument(
    'https://acme.feishu.cn/docx/MockTokenForDeliveryWorkflow',
    {
      mode: 'mock',
      mockMarkdown: '# PRD\n\n## 背景\n\n- mock ok',
    }
  );
  assert.strictEqual(imported.status, 'imported');
  assert(imported.markdown.includes('source: feishu'));
  assert(imported.markdown.includes('# PRD'));

  const mockMcp = await startMockMcpServer();
  process.env.DELIVERY_WORKFLOW_TEST_MCP_TOKEN = 'test-only-bearer-token';
  const authenticatedMcpServer = {
    name: 'spm-feishu',
    url: mockMcp.url,
    auth: {
      type: 'bearerEnv',
      tokenRef: 'DELIVERY_WORKFLOW_TEST_MCP_TOKEN',
    },
  };
  try {
    const mcpImported = await importFeishuDocument(
      'https://acme.feishu.cn/wiki/MockTokenForMcpImport',
      {
        mode: 'mcp',
        mcpServer: 'spm-feishu',
      },
      {
        mcpServers: [authenticatedMcpServer],
      }
    );
    assert.strictEqual(mcpImported.status, 'imported');
    assert.strictEqual(mcpImported.mode, 'mcp');
    assert.strictEqual(mcpImported.title, '公司飞书 PRD');
    assert(mcpImported.markdown.includes('MCP 正常读取并解析'));
    assert(mockMcp.requests.some((item) => item.payload && item.payload.method === 'initialize'));
    assert(mockMcp.requests.some((item) => item.payload && item.payload.method === 'tools/call'));
    assert(mockMcp.requests.filter((item) => item.payload).every((item) => item.headers.authorization === 'Bearer test-only-bearer-token'));
    assert(mockMcp.requests.some((item) => item.method === 'DELETE' && item.sessionId === 'test-session'));

    await fsp.rm(tmpRoot, { recursive: true, force: true });
    await fsp.mkdir(tmpRoot, { recursive: true });
    const demandTrackingUrl = 'https://example.internal/demand/FEISHU-IMPORT-CHECK';
    const feishuPrdUrl = 'https://acme.feishu.cn/docx/MockTokenForWorkspaceImport';
    const workspacePath = await initWorkspace('feishu-import-check', tmpRoot, undefined, {
      url: demandTrackingUrl,
      owner: { name: '测试用户', id: 'tester' },
    });
    await saveToolsConfig({
      tools: {
        workspaceRoot: tmpRoot,
        integrations: {
          mcp: {
            servers: [authenticatedMcpServer],
          },
          feishu: {
            mode: 'mcp',
            mcpServer: 'spm-feishu',
          },
        },
      },
    });
    const workspaceImport = await importFeishuPrd({
      workspacePath,
      links: [feishuPrdUrl],
    });
    assert.strictEqual(workspaceImport.imported.length, 1);
    const document = await fsp.readFile(path.join(workspacePath, 'prd', 'document.md'), 'utf8');
    const source = JSON.parse(await fsp.readFile(path.join(workspacePath, 'prd', 'source', 'feishu.json'), 'utf8'));
    const workspaceConfig = JSON.parse(await fsp.readFile(path.join(workspacePath, '.workflow', 'workspace.json'), 'utf8'));
    const savedImage = await fsp.readFile(path.join(workspacePath, 'prd', 'assets', 'mock-image.png'));
    assert(document.includes('公司飞书 PRD'));
    assert(document.includes('![流程图](assets/mock-image.png)'));
    assert.deepStrictEqual([...savedImage], [1, 2, 3]);
    assert.strictEqual(source.records[0].status, 'imported');
    assert.strictEqual(source.records[0].raw.contentSource, 'block-tree');
    assert.strictEqual(source.records[0].raw.contentStatus, 'complete');
    assert.strictEqual(source.records[0].raw.savedAssets[0].localPath, 'prd/assets/mock-image.png');
    assert.strictEqual(workspaceConfig.demand.url, demandTrackingUrl);
    assert.deepStrictEqual(workspaceConfig.feishuDocs, [feishuPrdUrl]);
  } finally {
    delete process.env.DELIVERY_WORKFLOW_TEST_MCP_TOKEN;
    await mockMcp.close();
  }

  console.log('Feishu connector check passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
