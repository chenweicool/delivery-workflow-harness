#!/usr/bin/env node

const assert = require('assert');
const fsp = require('fs/promises');
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

  await fsp.rm(tmpRoot, { recursive: true, force: true });
  await fsp.mkdir(tmpRoot, { recursive: true });
  const workspacePath = await initWorkspace('feishu-import-check', tmpRoot);
  await saveToolsConfig({
    tools: {
      workspaceRoot: tmpRoot,
      integrations: {
        feishu: {
          mode: 'mock',
          mockMarkdown: '# 公司飞书 PRD\n\n## 需求\n\n- 正常读取并解析',
        },
      },
    },
  });
  const workspaceImport = await importFeishuPrd({
    workspacePath,
    links: ['https://acme.feishu.cn/docx/MockTokenForWorkspaceImport'],
  });
  assert.strictEqual(workspaceImport.imported.length, 1);
  const document = await fsp.readFile(path.join(workspacePath, 'prd', 'document.md'), 'utf8');
  const source = JSON.parse(await fsp.readFile(path.join(workspacePath, 'prd', 'source-feishu.json'), 'utf8'));
  assert(document.includes('公司飞书 PRD'));
  assert.strictEqual(source.records[0].status, 'imported');

  console.log('Feishu connector check passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
