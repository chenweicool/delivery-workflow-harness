const fsp = require('fs/promises');
const path = require('path');
const { assertWithin, ensureDir, exists } = require('./fs-utils');

const PRD_DOCUMENT_FILE = 'prd/document.md';
const PRD_INGESTION_FILE = 'prd/metadata/ingestion.json';
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

function normalizeWorkspaceRelative(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function sourceKind(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  if (extension === '.docx') return 'docx';
  if (extension === '.pdf') return 'pdf';
  if (extension === '.doc') return 'legacy-doc';
  return extension ? extension.slice(1) : 'unknown';
}

async function readJsonIfExists(filePath) {
  if (!(await exists(filePath))) return null;
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeText(content) {
  return String(content || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
}

async function ingestPrdSources(workspacePath, sourcePaths) {
  const root = path.resolve(workspacePath);
  const documentPath = path.join(root, PRD_DOCUMENT_FILE);
  const metadataPath = path.join(root, PRD_INGESTION_FILE);
  assertWithin(root, documentPath);
  assertWithin(root, metadataPath);
  const prior = await readJsonIfExists(metadataPath);
  const records = Array.isArray(prior && prior.records) ? prior.records : [];
  const normalizedSources = [];
  const newRecords = [];

  for (const input of sourcePaths || []) {
    const relativePath = normalizeWorkspaceRelative(input);
    if (!relativePath.startsWith('prd/source/')) {
      throw new Error(`PRD 原件必须位于 prd/source/：${relativePath}`);
    }
    const sourcePath = path.join(root, relativePath);
    assertWithin(root, sourcePath);
    if (!(await exists(sourcePath))) {
      throw new Error(`PRD 原件不存在：${relativePath}`);
    }
    const kind = sourceKind(relativePath);
    const record = {
      sourcePath: relativePath,
      kind,
      adapter: '',
      status: '',
      outputs: [],
      message: '',
      processedAt: new Date().toISOString(),
    };
    if (kind === 'text') {
      const content = normalizeText(await fsp.readFile(sourcePath, 'utf8'));
      if (content) {
        normalizedSources.push({ relativePath, content });
        record.adapter = 'builtin-text';
        record.status = 'normalized';
        record.outputs = [PRD_DOCUMENT_FILE];
      } else {
        record.adapter = 'builtin-text';
        record.status = 'empty-source';
        record.message = '原始文本为空，未生成 Markdown。';
      }
    } else {
      record.adapter = 'none';
      record.status = 'needs-parser';
      record.message = kind === 'legacy-doc'
        ? '旧版 .doc 暂不内置解析；请转换为 .docx、导出 Markdown，或交由可用 Agent/解析能力处理。'
        : '当前未配置该格式的内置解析器；保留原件，后续可由已路由解析能力或 Agent 生成 Markdown。';
    }
    newRecords.push(record);
  }

  const documentExists = await exists(documentPath);
  let documentStatus = documentExists ? 'preserved-existing' : 'not-generated';
  if (!documentExists && normalizedSources.length) {
    const document = normalizedSources.map(({ relativePath, content }) => [
      `<!-- source: ${relativePath} -->`,
      '',
      content,
    ].join('\n')).join('\n\n---\n\n');
    await ensureDir(path.dirname(documentPath));
    await fsp.writeFile(documentPath, `${document}\n`, 'utf8');
    documentStatus = 'generated';
  }

  const recordMap = new Map(records.map((item) => [item.sourcePath, item]));
  for (const record of newRecords) recordMap.set(record.sourcePath, record);
  const metadata = {
    version: 1,
    updatedAt: new Date().toISOString(),
    document: {
      path: PRD_DOCUMENT_FILE,
      status: documentStatus,
      generatedBy: documentStatus === 'generated' ? 'builtin-text' : '',
    },
    records: [...recordMap.values()].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath, 'zh-CN')),
  };
  await ensureDir(path.dirname(metadataPath));
  await fsp.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  return metadata;
}

module.exports = {
  PRD_DOCUMENT_FILE,
  PRD_INGESTION_FILE,
  ingestPrdSources,
};
