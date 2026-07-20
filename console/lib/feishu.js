const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function normalizeFeishuConfig(integration = {}) {
  const raw = integration && typeof integration === 'object' && !Array.isArray(integration)
    ? integration
    : {};
  return {
    enabled: raw.enabled !== false,
    mode: String(raw.mode || raw.authMode || 'disabled').trim() || 'disabled',
    baseUrl: String(raw.baseUrl || 'https://open.feishu.cn').replace(/\/+$/, ''),
    proxyBaseUrl: String(raw.proxyBaseUrl || '').replace(/\/+$/, ''),
    tokenRef: String(raw.userAccessTokenRef || raw.tenantAccessTokenRef || raw.tokenRef || '').trim(),
    cliCommand: String(raw.cliCommand || '').trim(),
    cliArgs: Array.isArray(raw.cliArgs) ? raw.cliArgs.map(String) : [],
    mockMarkdown: String(raw.mockMarkdown || '').trim(),
  };
}

function parseFeishuLink(urlValue) {
  const url = new URL(String(urlValue || '').trim());
  const host = url.hostname.toLowerCase();
  if (!/(^|\.)feishu\.cn$|(^|\.)larksuite\.com$/.test(host)) {
    throw new Error('不是飞书文档链接');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const markerIndex = parts.findIndex((part) => ['docx', 'docs', 'wiki', 'sheets', 'base'].includes(part));
  const docType = markerIndex >= 0 ? parts[markerIndex] : 'unknown';
  const token = markerIndex >= 0 ? parts[markerIndex + 1] || '' : parts[parts.length - 1] || '';
  if (!token) {
    throw new Error('无法从飞书链接解析文档 token');
  }
  return {
    source: 'feishu',
    url: url.toString(),
    host,
    docType,
    token,
  };
}

function markdownFromBlocks(blocks) {
  const values = Array.isArray(blocks) ? blocks : [];
  const lines = [];
  for (const block of values) {
    const type = String(block.block_type || block.type || '').toLowerCase();
    const text = extractBlockText(block);
    if (!text && !type.includes('image')) {
      continue;
    }
    if (type.includes('heading') || ['1', '2', '3', '4', '5', '6'].includes(type)) {
      const level = Number(block.heading_level || block.level || type) || 2;
      lines.push(`${'#'.repeat(Math.min(Math.max(level, 1), 6))} ${text}`);
    } else if (type.includes('bullet') || type.includes('unordered')) {
      lines.push(`- ${text}`);
    } else if (type.includes('ordered')) {
      lines.push(`1. ${text}`);
    } else if (type.includes('code')) {
      lines.push('```', text, '```');
    } else if (type.includes('image')) {
      lines.push(`![飞书图片待下载](${block.token || block.file_token || 'feishu-image'})`);
    } else {
      lines.push(text);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

function extractBlockText(block) {
  const candidates = [
    block.text,
    block.plain_text,
    block.content,
    block.markdown,
    block.title,
    block.paragraph && block.paragraph.text,
    block.heading && block.heading.text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (candidate && typeof candidate === 'object') {
      const text = JSON.stringify(candidate);
      if (text && text !== '{}') {
        return text;
      }
    }
  }
  return '';
}

async function importFeishuDocument(link, integration = {}, options = {}) {
  const parsed = parseFeishuLink(link);
  const config = normalizeFeishuConfig(integration);
  if (!config.enabled) {
    throw new Error('飞书集成未启用');
  }
  let result;
  if (config.mode === 'proxy') {
    result = await importViaProxy(parsed, config);
  } else if (config.mode === 'cli') {
    result = await importViaCli(parsed, config);
  } else if (config.mode === 'tokenRef') {
    result = await importViaTokenRef(parsed, config);
  } else if (config.mode === 'mock') {
    result = await importViaMock(parsed, config, options);
  } else {
    throw new Error('飞书集成未配置，请在全局配置中选择 proxy、cli 或 tokenRef 模式');
  }
  return {
    ...parsed,
    status: 'imported',
    importedAt: new Date().toISOString(),
    mode: config.mode,
    title: result.title || '',
    markdown: ensureMarkdown(result.markdown, parsed),
    raw: result.raw || null,
  };
}

async function importViaProxy(parsed, config) {
  if (!config.proxyBaseUrl) {
    throw new Error('飞书 proxyBaseUrl 未配置');
  }
  const response = await fetch(`${config.proxyBaseUrl}/documents/import-markdown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: parsed.url, token: parsed.token, docType: parsed.docType }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `飞书代理读取失败：${response.status}`);
  }
  return {
    title: data.title || '',
    markdown: data.markdown || data.content || '',
    raw: data,
  };
}

async function importViaCli(parsed, config) {
  if (!config.cliCommand) {
    throw new Error('飞书 CLI 命令未配置');
  }
  const args = config.cliArgs.length ? config.cliArgs : ['import-markdown', '--url', parsed.url];
  const expandedArgs = args.map((arg) => String(arg)
    .replaceAll('{url}', parsed.url)
    .replaceAll('{token}', parsed.token)
    .replaceAll('{docType}', parsed.docType));
  const executable = await resolveCliExecutable(config.cliCommand);
  const { stdout } = await execCli(executable, expandedArgs);
  const text = String(stdout || '').trim();
  if (!text) {
    throw new Error('飞书 CLI 没有输出 Markdown 内容');
  }
  return {
    markdown: markdownFromCliOutput(text),
    raw: { cliCommand: config.cliCommand, resolvedCommand: executable, cliArgs: expandedArgs },
  };
}

async function execCli(executable, args) {
  if (process.platform !== 'win32') {
    return execFileAsync(executable, args, {
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });
  }
  const commandLine = ['call', quoteWindowsCmdArg(executable), ...args.map(quoteWindowsCmdArg)].join(' ');
  return execFileAsync('cmd.exe', ['/d', '/c', commandLine], {
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function quoteWindowsCmdArg(value) {
  const text = String(value || '');
  if (!/[ \t&|<>^"%]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

async function resolveCliExecutable(command) {
  const value = String(command || '').trim();
  if (!value) {
    return value;
  }
  if (/[\\/]/.test(value)) {
    return value;
  }
  const finder = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    const { stdout } = await execFileAsync(finder, [value], {
      windowsHide: true,
      timeout: 5000,
    });
    const candidates = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (process.platform === 'win32') {
      return candidates.find((item) => /\.cmd$/i.test(item) && !/\s/.test(item))
        || candidates.find((item) => !/\s/.test(item))
        || candidates.find((item) => /\.cmd$/i.test(item))
        || candidates[0]
        || value;
    }
    return candidates[0] || value;
  } catch {
    return value;
  }
}

function markdownFromCliOutput(text) {
  const value = String(text || '').trim();
  if (!value) {
    return '';
  }
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'string') {
      return parsed;
    }
    const candidates = [
      parsed.markdown,
      parsed.content,
      parsed.data && parsed.data.content,
      parsed.data && parsed.data.markdown,
      parsed.data && parsed.data.document && parsed.data.document.content,
      parsed.result && parsed.result.content,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {
    // Plain Markdown output is expected for company CLIs and jq-like commands.
  }
  return value;
}

async function importViaTokenRef(parsed, config) {
  const token = resolveTokenRef(config.tokenRef);
  if (!token) {
    throw new Error('飞书 tokenRef 未配置或环境变量为空');
  }
  const markdown = await fetchFeishuMarkdown(parsed, config, token);
  return { markdown, raw: { docType: parsed.docType, token: parsed.token } };
}

async function importViaMock(parsed, config, options = {}) {
  const markdown = config.mockMarkdown
    || String(process.env.DELIVERY_WORKFLOW_FEISHU_MOCK_MARKDOWN || '').trim()
    || options.mockMarkdown
    || [
      '# Mock Feishu PRD',
      '',
      `来源链接：${parsed.url}`,
      '',
      '## 需求背景',
      '',
      '- 这是本地 mock 导入内容，用于验证飞书链接到 PRD Markdown 的 Harness 链路。',
    ].join('\n');
  return { title: 'Mock Feishu PRD', markdown, raw: { mock: true } };
}

function resolveTokenRef(tokenRef) {
  const value = String(tokenRef || '').trim();
  if (!value) {
    return '';
  }
  if (value.startsWith('env:')) {
    return process.env[value.slice(4)] || '';
  }
  return value;
}

async function fetchFeishuMarkdown(parsed, config, token) {
  const endpoint = `${config.baseUrl}/open-apis/docx/v1/documents/${encodeURIComponent(parsed.token)}/raw_content`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data.msg || data.error || `飞书文档读取失败：${response.status}`;
    throw new Error(msg);
  }
  if (data.data && typeof data.data.content === 'string') {
    return data.data.content;
  }
  if (data.data && Array.isArray(data.data.blocks)) {
    return markdownFromBlocks(data.data.blocks);
  }
  if (typeof data.content === 'string') {
    return data.content;
  }
  throw new Error('飞书接口未返回可转换的 Markdown 内容');
}

function ensureMarkdown(markdown, parsed) {
  const content = String(markdown || '').trim();
  if (!content) {
    throw new Error('飞书文档转换结果为空');
  }
  return [
    '<!-- source: feishu -->',
    `<!-- url: ${parsed.url} -->`,
    '',
    content,
    '',
  ].join('\n');
}

module.exports = {
  normalizeFeishuConfig,
  parseFeishuLink,
  markdownFromBlocks,
  importFeishuDocument,
};
