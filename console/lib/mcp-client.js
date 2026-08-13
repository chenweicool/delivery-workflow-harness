const DEFAULT_PROTOCOL_VERSION = '2025-03-26';
const DEFAULT_TIMEOUT_MS = 30000;

function parseMcpServerEntry(entry) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const name = String(entry.name || entry.id || '').trim();
    const url = normalizeHttpUrl(entry.url || entry.endpoint || entry.value || '');
    return url ? { name, url } : null;
  }

  const value = String(entry || '').trim();
  if (!value) {
    return null;
  }
  if (value.startsWith('{')) {
    try {
      return parseMcpServerEntry(JSON.parse(value));
    } catch {
      return null;
    }
  }

  const directUrl = normalizeHttpUrl(value);
  if (directUrl) {
    return { name: '', url: directUrl };
  }

  const named = value.match(/^([^=\s]+)\s*=\s*(https?:\/\/\S+)$/i)
    || value.match(/^(\S+)\s+(https?:\/\/\S+)$/i);
  if (!named) {
    return null;
  }
  const url = normalizeHttpUrl(named[2]);
  return url ? { name: named[1].trim(), url } : null;
}

function normalizeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return '';
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function resolveMcpServer(servers, preferred = '') {
  const values = Array.isArray(servers)
    ? servers
    : String(servers || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const entries = values.map(parseMcpServerEntry).filter(Boolean);
  const preferredValue = String(preferred || '').trim();
  if (preferredValue) {
    const preferredEntry = parseMcpServerEntry(preferredValue);
    if (preferredEntry && !preferredEntry.name) {
      return preferredEntry;
    }
    const matched = entries.find((entry) => entry.name === preferredValue || entry.url === preferredValue);
    if (matched) {
      return matched;
    }
    throw new Error(`未找到指定的 MCP 服务：${preferredValue}`);
  }
  if (!entries.length) {
    throw new Error('未登记可连接的 HTTP MCP 服务地址');
  }
  return entries[0];
}

async function callMcpTool(serverUrl, toolName, args = {}, options = {}) {
  const endpoint = normalizeHttpUrl(serverUrl);
  if (!endpoint) {
    throw new Error('MCP 服务地址不是合法的 HTTP/HTTPS URL');
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前 Node.js 运行时不支持 fetch，无法连接 MCP 服务');
  }
  const protocolVersion = String(options.protocolVersion || DEFAULT_PROTOCOL_VERSION);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  let sessionId = '';

  try {
    const initialized = await postJsonRpc(endpoint, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: {
          name: 'delivery-workflow',
          version: '0.2.5',
        },
      },
    }, { fetchImpl, timeoutMs, protocolVersion });
    sessionId = initialized.response.headers.get('mcp-session-id') || '';

    await postJsonRpc(endpoint, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }, { fetchImpl, timeoutMs, protocolVersion, sessionId, allowEmpty: true });

    const called = await postJsonRpc(endpoint, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: String(toolName || '').trim(),
        arguments: args && typeof args === 'object' ? args : {},
      },
    }, { fetchImpl, timeoutMs, protocolVersion, sessionId });
    return called.payload.result;
  } finally {
    if (sessionId) {
      await closeMcpSession(endpoint, sessionId, { fetchImpl, timeoutMs, protocolVersion });
    }
  }
}

async function postJsonRpc(endpoint, body, options) {
  const headers = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': options.protocolVersion,
  };
  if (options.sessionId) {
    headers['Mcp-Session-Id'] = options.sessionId;
  }
  const response = await fetchWithTimeout(options.fetchImpl, endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }, options.timeoutMs);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MCP 请求失败：HTTP ${response.status}${text ? `，${text.slice(0, 500)}` : ''}`);
  }
  if (!text.trim()) {
    if (options.allowEmpty) {
      return { response, payload: null };
    }
    throw new Error('MCP 服务返回了空响应');
  }
  const payload = parseJsonRpcPayload(text, response.headers.get('content-type') || '');
  if (payload && payload.error) {
    throw new Error(payload.error.message || JSON.stringify(payload.error));
  }
  if (!payload || (!options.allowEmpty && !Object.prototype.hasOwnProperty.call(payload, 'result'))) {
    throw new Error('MCP 服务未返回合法的 JSON-RPC result');
  }
  return { response, payload };
}

function parseJsonRpcPayload(text, contentType = '') {
  const value = String(text || '').trim();
  if (!contentType.includes('text/event-stream')) {
    try {
      return JSON.parse(value);
    } catch {
      // Some MCP gateways return SSE without the expected content type.
    }
  }
  const events = value.split(/\r?\n\r?\n/);
  for (const event of events) {
    const data = event.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (!data) {
      continue;
    }
    try {
      return JSON.parse(data);
    } catch {
      // Continue to the next SSE event.
    }
  }
  throw new Error('MCP 服务返回内容不是合法的 JSON-RPC 或 SSE');
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`MCP 请求超时（${timeoutMs}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function closeMcpSession(endpoint, sessionId, options) {
  try {
    await fetchWithTimeout(options.fetchImpl, endpoint, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': options.protocolVersion,
        'Mcp-Session-Id': sessionId,
      },
    }, options.timeoutMs);
  } catch {
    // Session cleanup must not hide the tool result or the original tool error.
  }
}

function extractMcpDocument(toolResult) {
  const result = toolResult && typeof toolResult === 'object' ? toolResult : {};
  const textBlocks = Array.isArray(result.content)
    ? result.content.filter((item) => item && item.type === 'text' && typeof item.text === 'string')
    : [];
  const errorText = textBlocks.map((item) => item.text).join('\n').trim();
  if (result.isError) {
    throw new Error(errorText || 'MCP 工具调用失败');
  }

  const candidates = [result.structuredContent, ...textBlocks.map((item) => parseJsonValue(item.text))];
  for (const candidate of candidates) {
    const document = findDocument(candidate);
    if (document) {
      return document;
    }
  }
  if (errorText) {
    return { title: '', content: errorText, documentType: '', url: '' };
  }
  throw new Error('MCP 工具未返回可读取的文档内容');
}

function parseJsonValue(value) {
  try {
    return JSON.parse(String(value || '').trim());
  } catch {
    return null;
  }
}

function findDocument(value) {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const document = findDocument(item);
      if (document) {
        return document;
      }
    }
    return null;
  }
  if (typeof value !== 'object') {
    return null;
  }
  const content = value.content || value.markdown || value.documentContent;
  if (typeof content === 'string' && content.trim()) {
    return {
      title: String(value.title || value.documentTitle || '').trim(),
      content: content.trim(),
      documentType: String(value.documentType || value.docType || '').trim(),
      url: String(value.url || value.documentUrl || '').trim(),
    };
  }
  for (const key of ['data', 'result', 'document']) {
    const document = findDocument(value[key]);
    if (document) {
      return document;
    }
  }
  return null;
}

module.exports = {
  DEFAULT_PROTOCOL_VERSION,
  parseMcpServerEntry,
  resolveMcpServer,
  callMcpTool,
  extractMcpDocument,
};
