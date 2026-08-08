const fsp = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
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

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// DOCX is a ZIP package. Keeping this small reader here avoids making PRD completeness
// depend on a globally installed Word conversion tool.
function readZipEntries(buffer) {
  const endSignature = 0x06054b50;
  const start = Math.max(0, buffer.length - 0x10016);
  let end = -1;
  for (let index = buffer.length - 22; index >= start; index -= 1) {
    if (buffer.readUInt32LE(index) === endSignature) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error('不是有效的 DOCX ZIP 包');
  const entryCount = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('DOCX ZIP 目录损坏');
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('DOCX ZIP 条目损坏');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, compression === 0 ? data : compression === 8 ? zlib.inflateRawSync(data) : null);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function wordText(fragment) {
  return decodeXml(String(fragment || '')
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<w:cr\b[^>]*\/>/g, '\n')
    .replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, '$1')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function markdownEscapeCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>').trim();
}

function extractDocxMarkdown(buffer, sourcePath) {
  const entries = readZipEntries(buffer);
  const documentXml = entries.get('word/document.xml');
  if (!documentXml) throw new Error('DOCX 缺少 word/document.xml');
  const xml = documentXml.toString('utf8');
  const tables = [];
  for (const table of xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)) {
    const rows = [];
    for (const row of table[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
      const cells = [...row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cell) => markdownEscapeCell(wordText(cell[0])));
      if (cells.some(Boolean)) rows.push(cells);
    }
    if (rows.length) {
      const width = Math.max(...rows.map((row) => row.length));
      const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] || ''));
      tables.push([`| ${normalized[0].join(' | ')} |`, `| ${normalized[0].map(() => '---').join(' | ')} |`, ...normalized.slice(1).map((row) => `| ${row.join(' | ')} |`)].join('\n'));
    }
  }
  const textWithoutTables = xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, '');
  const paragraphs = [...textWithoutTables.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((paragraph) => wordText(paragraph[0]))
    .filter(Boolean);
  const mediaCount = [...entries.keys()].filter((name) => name.startsWith('word/media/')).length;
  return [
    `<!-- source: ${sourcePath} / builtin-docx -->`,
    '',
    ...paragraphs,
    ...(tables.length ? ['', '## 原始表格', '', ...tables] : []),
    ...(mediaCount ? ['', `> 原件含 ${mediaCount} 个图片资源，保留在 prd/source/，需结合原件核对图示内容。`] : []),
  ].join('\n').trim();
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
    } else if (kind === 'docx') {
      try {
        const content = extractDocxMarkdown(await fsp.readFile(sourcePath), relativePath);
        if (content) {
          normalizedSources.push({ relativePath, content });
          record.adapter = 'builtin-docx';
          record.status = 'normalized';
          record.outputs = [PRD_DOCUMENT_FILE];
        } else {
          record.adapter = 'builtin-docx';
          record.status = 'empty-source';
          record.message = 'DOCX 未提取到可读正文或表格。';
        }
      } catch (error) {
        record.adapter = 'builtin-docx';
        record.status = 'parse-failed';
        record.message = `DOCX 内置解析失败：${error.message}`;
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
