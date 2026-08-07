const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const DELIVERY_REPORT_FILE = 'delivery/delivery-report.json';
const RECEIPT_DIRECTORY = '.workflow/harness/receipts';
const DEFAULT_TIMEOUT_MS = 10_000;

function normalizeHarnessClientConfig(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    enabled: source.enabled !== false,
    serverUrl: String(source.serverUrl || '').trim().replace(/\/+$/, ''),
    tokenEnv: String(source.tokenEnv || 'HARNESS_INGEST_TOKEN').trim() || 'HARNESS_INGEST_TOKEN',
    authMode: String(source.authMode || (source.accessToken ? 'browser-pkce' : 'token')).trim(),
    clientId: String(source.clientId || 'delivery-workflow-desktop').trim(),
    authorizeUrl: String(source.authorizeUrl || '').trim(),
    accessToken: String(source.accessToken || '').trim(),
    accessTokenExpiresAt: Number.isFinite(Number(source.accessTokenExpiresAt)) ? Number(source.accessTokenExpiresAt) : 0,
  };
}

function validateServerUrl(serverUrl) {
  let parsed;
  try {
    parsed = new URL(serverUrl);
  } catch {
    throw new Error('Harness Server 地址必须是有效的 HTTP 或 HTTPS 地址。');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Harness Server 地址必须是有效的 HTTP 或 HTTPS 地址。');
  }
  return parsed.toString();
}

function safeErrorMessage(error) {
  return String(error && error.message ? error.message : error || '未知上报错误').slice(0, 500);
}

function buildAuthorizationUrl(authorizeUrl, params) {
  const url = new URL(authorizeUrl);
  if (url.hash.startsWith('#/')) {
    const fragment = url.hash.slice(1);
    const separator = fragment.indexOf('?');
    const routePath = separator >= 0 ? fragment.slice(0, separator) : fragment;
    const query = new URLSearchParams(separator >= 0 ? fragment.slice(separator + 1) : '');
    Object.entries(params).forEach(([key, value]) => query.set(key, value));
    url.hash = `${routePath}?${query.toString()}`;
    return url.toString();
  }
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

function buildWindowsOpenArgs(url) {
  return [String(url)];
}

function createHarnessClientRuntime(deps) {
  const {
    normalizeUserPath,
    exists,
    readJsonFileIfExists,
    writeWorkspaceJsonFile,
    readToolsConfig,
    saveToolsConfig,
    nowIso,
    fetchImpl = global.fetch,
  } = deps;
  let pendingAuthorization = null;

  async function writeReceipt(workspacePath, reportId, data) {
    const receiptFile = path.posix.join(RECEIPT_DIRECTORY, `${reportId}.json`);
    await writeWorkspaceJsonFile(workspacePath, receiptFile, data);
    return receiptFile;
  }

  async function submitDeliveryReport(workspacePathValue) {
    const workspacePath = normalizeUserPath(workspacePathValue || '');
    if (!workspacePath || !(await exists(path.join(workspacePath, 'AGENTS.md')))) {
      throw new Error('当前目录不是有效的 Delivery Workflow workspace');
    }
    const report = await readJsonFileIfExists(workspacePath, DELIVERY_REPORT_FILE);
    if (!report || !report.reportId) {
      throw new Error('尚未生成交付报告，请先执行 dw report complete。');
    }
    const tools = await readToolsConfig();
    const config = normalizeHarnessClientConfig((tools.integrations || {}).harnessClient);
    if (!config.enabled || !config.serverUrl) {
      return { status: 'not-configured', reportId: report.reportId };
    }

    let serverUrl;
    try {
      serverUrl = validateServerUrl(config.serverUrl);
    } catch (error) {
      return { status: 'failed', reportId: report.reportId, error: safeErrorMessage(error) };
    }
    if (config.authMode === 'browser-pkce' && config.accessTokenExpiresAt && config.accessTokenExpiresAt <= Date.now()) {
      return { status: 'authorization-required', reportId: report.reportId, error: '浏览器授权已过期，请执行 dw harness login 重新授权。' };
    }
    const token = config.authMode === 'browser-pkce' ? config.accessToken : process.env[config.tokenEnv];
    if (!token) {
      return { status: config.authMode === 'browser-pkce' ? 'authorization-required' : 'failed', reportId: report.reportId, error: config.authMode === 'browser-pkce' ? '请执行 dw harness login 完成浏览器授权。' : `未设置环境变量 ${config.tokenEnv}。` };
    }
    if (typeof fetchImpl !== 'function') {
      return { status: 'failed', reportId: report.reportId, error: '当前 Node 运行环境不支持 HTTP 上报。' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetchImpl(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.authMode === 'browser-pkce' ? { Authorization: `Bearer ${token}` } : { 'X-Harness-Token': token }),
        },
        body: JSON.stringify(report),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      const accepted = response.ok && (payload.code === undefined || payload.code === 200) && payload.data?.accepted !== false;
      if (!accepted) {
        throw new Error(`Harness Server 返回异常（HTTP ${response.status}）。`);
      }
      const receiptFile = await writeReceipt(workspacePath, report.reportId, {
        reportId: report.reportId,
        status: 'submitted',
        submittedAt: nowIso(),
        serverUrl,
        duplicate: Boolean(payload.data?.duplicate),
      });
      return {
        status: 'submitted',
        reportId: report.reportId,
        receiptFile,
        duplicate: Boolean(payload.data?.duplicate),
      };
    } catch (error) {
      const receiptFile = await writeReceipt(workspacePath, report.reportId, {
        reportId: report.reportId,
        status: 'failed',
        attemptedAt: nowIso(),
        serverUrl,
        error: safeErrorMessage(error),
      });
      return { status: 'failed', reportId: report.reportId, receiptFile, error: safeErrorMessage(error) };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function startHarnessAuthorization() {
    if (pendingAuthorization) {
      throw new Error('已有浏览器授权正在等待回调，请在已打开的授权页完成操作或稍后重试。');
    }
    const tools = await readToolsConfig();
    const config = normalizeHarnessClientConfig((tools.integrations || {}).harnessClient);
    if (!config.serverUrl || !config.authorizeUrl || !config.clientId) {
      throw new Error('Harness Client 尚未配置浏览器授权地址。');
    }
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(24).toString('base64url');
    const callback = await waitForAuthorizationCallback(state);
    const authorizationUrl = buildAuthorizationUrl(config.authorizeUrl, {
      client_id: config.clientId,
      redirect_uri: callback.redirectUri,
      state,
      code_challenge: challenge,
    });
    const completion = callback.result.then(async (code) => {
    const tokenUrl = new URL(config.serverUrl);
    tokenUrl.pathname = tokenUrl.pathname.replace(/\/delivery-reports$/, '/delivery-reports/tokens');
    const response = await fetchImpl(tokenUrl.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: config.clientId, code, codeVerifier: verifier }) });
    const payload = await response.json();
    if (!response.ok || payload.code !== 200 || !payload.data?.accessToken) throw new Error(payload.message || '授权令牌交换失败。');
    await saveToolsConfig({ tools: { ...tools, integrations: { ...(tools.integrations || {}), harnessClient: { ...(tools.integrations || {}).harnessClient, enabled: true, authMode: 'browser-pkce', accessToken: payload.data.accessToken, accessTokenExpiresAt: payload.data.expiresAt } } } });
    return { status: 'authorized', expiresAt: payload.data.expiresAt };
    });
    pendingAuthorization = completion;
    completion.then(
      () => { if (pendingAuthorization === completion) pendingAuthorization = null; },
      () => { if (pendingAuthorization === completion) pendingAuthorization = null; },
    );
    completion.catch(() => {});
    return { authorizationUrl, completion };
  }

  async function authorizeHarnessClient() {
    const pending = await startHarnessAuthorization();
    openBrowser(pending.authorizationUrl);
    return pending.completion;
  }

  async function getHarnessClientStatus() {
    const tools = await readToolsConfig();
    const config = normalizeHarnessClientConfig((tools.integrations || {}).harnessClient);
    const expiresAt = config.accessTokenExpiresAt || 0;
    const authorizationStatus = config.authMode === 'browser-pkce'
      ? (!config.accessToken ? 'required' : expiresAt && expiresAt <= Date.now() ? 'expired' : 'authorized')
      : (process.env[config.tokenEnv] ? 'configured' : 'required');
    return {
      enabled: config.enabled && Boolean(config.serverUrl),
      serverUrl: config.serverUrl,
      authorizeUrl: config.authorizeUrl,
      authMode: config.authMode,
      clientId: config.clientId,
      tokenEnv: config.authMode === 'token' ? config.tokenEnv : '',
      authorizationStatus,
      accessTokenExpiresAt: expiresAt || null,
    };
  }

  async function logoutHarnessClient() {
    const tools = await readToolsConfig();
    const current = (tools.integrations || {}).harnessClient || {};
    await saveToolsConfig({
      tools: {
        ...tools,
        integrations: {
          ...(tools.integrations || {}),
          harnessClient: { ...current, accessToken: '', accessTokenExpiresAt: 0 },
        },
      },
    });
    return { status: 'logged-out' };
  }

  async function waitForAuthorizationCallback(expectedState) {
    let resolveCode;
    let rejectCode;
    const result = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url, 'http://127.0.0.1');
      if (requestUrl.pathname !== '/callback' || requestUrl.searchParams.get('state') !== expectedState || !requestUrl.searchParams.get('code')) { res.writeHead(400); res.end('授权回调无效。'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<h2>授权成功，可关闭此页面并返回 Delivery Workflow。</h2>');
      resolveCode(requestUrl.searchParams.get('code')); server.close();
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const timeout = setTimeout(() => { server.close(); rejectCode(new Error('浏览器授权超时，请重试。')); }, 5 * 60 * 1000);
    result.then(() => clearTimeout(timeout), () => clearTimeout(timeout));
    return { redirectUri: `http://127.0.0.1:${server.address().port}/callback`, result };
  }

  function openBrowser(url) { const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'; const args = process.platform === 'win32' ? buildWindowsOpenArgs(url) : [url]; const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }); child.unref(); }

  return { submitDeliveryReport, startHarnessAuthorization, authorizeHarnessClient, getHarnessClientStatus, logoutHarnessClient };
}

module.exports = {
  normalizeHarnessClientConfig,
  validateServerUrl,
  buildAuthorizationUrl,
  buildWindowsOpenArgs,
  createHarnessClientRuntime,
};
