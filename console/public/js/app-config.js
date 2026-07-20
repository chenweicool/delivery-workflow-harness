(function attachConfigDomain(global) {
  const { els, setMessage, setLoading } = global.DWAppState;
  const { api } = global.DWApi;

  function renderSelectedAppTags(...args) {
    return global.DWAppDomains.renderSelectedAppTags(...args);
  }

function parseLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseAppPaths(text) {
  const seen = new Set();
  const result = [];
  for (const line of parseLines(text)) {
    const index = line.indexOf('=');
    let item;
    if (index > 0) {
      item = {
        name: line.slice(0, index).trim(),
        path: line.slice(index + 1).trim(),
      };
    } else {
      const parts = line.split(/[\\/]/).filter(Boolean);
      item = {
        name: parts[parts.length - 1] || line,
        path: line,
      };
    }
    const key = `${item.name.toLowerCase()}|${item.path.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function parseKnowledgePaths(text) {
  return parseAppPaths(text).map((item) => ({
    name: item.name,
    path: item.path,
    description: '',
  }));
}

function parseIntegrationConfig(text) {
  const value = String(text || '').trim();
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('扩展接入配置必须是 JSON 对象');
    }
    return parsed;
  } catch (error) {
    throw new Error(`扩展接入配置不是合法 JSON：${error.message}`);
  }
}

function formatIntegrationConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) {
    return '';
  }
  return JSON.stringify(value, null, 2);
}

function renderFeishuIntegrationConfig(integrations = {}) {
  const feishu = integrations && integrations.feishu && typeof integrations.feishu === 'object'
    ? integrations.feishu
    : {};
  if (els.feishuBase) {
    els.feishuBase.value = feishu.baseUrl === 'https://open.larksuite.com'
      ? 'https://open.larksuite.com'
      : 'https://open.feishu.cn';
  }
  if (els.feishuMode) {
    els.feishuMode.value = feishu.mode || feishu.authMode || 'disabled';
  }
  if (els.feishuAppId) {
    els.feishuAppId.value = feishu.appId || '';
  }
  if (els.feishuRedirectUri) {
    els.feishuRedirectUri.value = feishu.redirectUri || '';
  }
  if (els.feishuAuthUrl) {
    els.feishuAuthUrl.value = feishu.authUrl || '';
  }
  if (els.feishuProxyBaseUrl) {
    els.feishuProxyBaseUrl.value = feishu.proxyBaseUrl || '';
  }
  if (els.feishuTokenRef) {
    els.feishuTokenRef.value = feishu.tokenRef || feishu.userAccessTokenRef || feishu.tenantAccessTokenRef || '';
  }
  if (els.feishuCliCommand) {
    els.feishuCliCommand.value = feishu.cliCommand || '';
  }
  if (els.feishuCliAuthArgs) {
    els.feishuCliAuthArgs.value = Array.isArray(feishu.cliAuthArgs) ? feishu.cliAuthArgs.join(' ') : (feishu.cliAuthArgs || '');
  }
  if (els.feishuCliArgs) {
    els.feishuCliArgs.value = Array.isArray(feishu.cliArgs) ? feishu.cliArgs.join(' ') : '';
  }
  if (els.feishuMockMarkdown) {
    els.feishuMockMarkdown.value = feishu.mockMarkdown || '';
  }
  const scopes = new Set(Array.isArray(feishu.scopes) ? feishu.scopes : ['doc.read', 'doc.export']);
  [
    [els.feishuScopeRead, 'doc.read'],
    [els.feishuScopeExport, 'doc.export'],
    [els.feishuScopeAssets, 'doc.assets'],
    [els.feishuScopeNotify, 'im.notify'],
  ].forEach(([input, scope]) => {
    if (input) {
      input.checked = scopes.has(scope);
    }
  });
  renderFeishuAuthStatus(feishu);
}

function collectIntegrationsConfig() {
  const base = els.integrationConfig ? parseIntegrationConfig(els.integrationConfig.value) : {};
  if (!els.feishuMode) {
    return base;
  }
  const mode = els.feishuMode.value || 'disabled';
  const feishu = {
    ...(base.feishu && typeof base.feishu === 'object' && !Array.isArray(base.feishu) ? base.feishu : {}),
    enabled: mode !== 'disabled',
    mode,
    provider: els.feishuBase && els.feishuBase.value.includes('larksuite') ? 'lark' : 'feishu',
    baseUrl: els.feishuBase ? els.feishuBase.value : 'https://open.feishu.cn',
    appId: els.feishuAppId ? els.feishuAppId.value.trim() : '',
    redirectUri: els.feishuRedirectUri ? els.feishuRedirectUri.value.trim() : '',
    scopes: collectFeishuScopes(),
    authUrl: els.feishuAuthUrl ? els.feishuAuthUrl.value.trim() : '',
    proxyBaseUrl: els.feishuProxyBaseUrl ? els.feishuProxyBaseUrl.value.trim() : '',
    tokenRef: els.feishuTokenRef ? els.feishuTokenRef.value.trim() : '',
    cliCommand: els.feishuCliCommand ? els.feishuCliCommand.value.trim() : '',
    cliAuthArgs: els.feishuCliAuthArgs ? parseCommandArgs(els.feishuCliAuthArgs.value) : [],
    cliArgs: els.feishuCliArgs ? parseCommandArgs(els.feishuCliArgs.value) : [],
    mockMarkdown: els.feishuMockMarkdown ? els.feishuMockMarkdown.value.trim() : '',
  };
  if (mode === 'disabled') {
    delete base.feishu;
  } else {
    base.feishu = feishu;
  }
  return base;
}

function collectFeishuScopes() {
  return [
    [els.feishuScopeRead, 'doc.read'],
    [els.feishuScopeExport, 'doc.export'],
    [els.feishuScopeAssets, 'doc.assets'],
    [els.feishuScopeNotify, 'im.notify'],
  ].filter(([input]) => input && input.checked).map(([, scope]) => scope);
}

function renderFeishuAuthStatus(feishu = {}) {
  if (!els.feishuAuthStatus || !els.authorizeFeishuBtn) {
    return;
  }
  const mode = feishu.mode || feishu.authMode || 'disabled';
  const hasToken = Boolean(feishu.tokenRef || feishu.userAccessTokenRef || feishu.tenantAccessTokenRef);
  const hasAuthUrl = Boolean(feishu.authUrl);
  const hasOfficialOAuth = Boolean(feishu.appId && feishu.redirectUri);
  if (mode === 'disabled') {
    els.feishuAuthStatus.textContent = '未启用。普通用户优先选择飞书 Lark CLI / MCP 登录。';
    els.authorizeFeishuBtn.disabled = false;
    els.authorizeFeishuBtn.textContent = '打开扫码授权';
    return;
  }
  if (mode === 'tokenRef' && hasToken) {
    els.feishuAuthStatus.textContent = '已配置 Token 引用。保存后可读取你有权限访问的文档。';
    els.authorizeFeishuBtn.disabled = false;
    els.authorizeFeishuBtn.textContent = hasAuthUrl || hasOfficialOAuth ? '重新授权' : '查看配置';
    return;
  }
  if (hasAuthUrl) {
    els.feishuAuthStatus.textContent = '已配置公司授权入口。点击后会直接打开飞书 / Lark 扫码登录和授权页。';
    els.authorizeFeishuBtn.disabled = false;
    els.authorizeFeishuBtn.textContent = '打开扫码授权';
    return;
  }
  if (hasOfficialOAuth) {
    els.feishuAuthStatus.textContent = '已配置官方 OAuth 参数。点击后会直接打开飞书 / Lark 扫码登录和授权页。';
    els.authorizeFeishuBtn.disabled = false;
    els.authorizeFeishuBtn.textContent = '打开扫码授权';
    return;
  }
  if (mode === 'proxy') {
    els.feishuAuthStatus.textContent = '使用公司统一连接器。请向平台同学获取授权入口 URL；没有统一入口时才需要应用管理员提供 App ID 和回调地址。';
  } else if (mode === 'cli') {
    els.feishuAuthStatus.textContent = isCliSubcommandOnly(feishu.cliCommand)
      ? 'CLI 可执行命令不能填 login。请填 npx、lark-mcp 或公司封装命令；login 放到登录参数。'
      : hasCommandArguments(feishu.cliCommand)
        ? 'CLI 可执行命令只填命令本身，例如 npx；包名和 login 放到登录参数。'
        : '使用飞书 Lark CLI / MCP。请先在该工具中完成扫码登录；本工具导入时调用 CLI 读取文档。';
    els.authorizeFeishuBtn.textContent = feishu.cliCommand ? '运行 CLI 登录' : '填写 CLI 命令';
  } else if (mode === 'mock') {
    els.feishuAuthStatus.textContent = '开发测试 mock 模式，不会打开真实飞书授权。';
    els.authorizeFeishuBtn.textContent = '无需授权';
  } else {
    els.feishuAuthStatus.textContent = '请先使用 CLI/MCP 登录；或获取公司授权入口 URL。App ID 和回调地址只适合平台/高级配置。';
    els.authorizeFeishuBtn.textContent = '打开扫码授权';
  }
  els.authorizeFeishuBtn.disabled = false;
}

function applyFeishuImportCliTemplate() {
  if (els.feishuCliArgs) {
    els.feishuCliArgs.value = 'exec --yes --package=@larksuite/cli -- lark-cli docs +fetch --doc {url} --doc-format markdown --jq .data.document.content';
  }
}

function applyOfficialFeishuCliPreset() {
  if (els.feishuMode) {
    els.feishuMode.value = 'cli';
  }
  if (els.feishuCliCommand) {
    els.feishuCliCommand.value = 'npm';
  }
  if (els.feishuCliAuthArgs) {
    els.feishuCliAuthArgs.value = 'exec --yes --package=@larksuite/cli -- lark-cli auth login --domain docs,drive --recommend';
  }
  applyFeishuImportCliTemplate();
  renderFeishuAuthStatus(collectIntegrationsConfig().feishu || {});
  setMessage('已填入官方 CLI 登录模板。如果提示 not configured，请改用“自有应用初始化模板”先初始化。');
}

function openFeishuAdvancedConfig() {
  const details = els.feishuAppId ? els.feishuAppId.closest('details') : null;
  if (details) {
    details.open = true;
  }
}

function applyFeishuAppInitPreset() {
  if (els.feishuMode) {
    els.feishuMode.value = 'cli';
  }
  if (els.feishuCliCommand) {
    els.feishuCliCommand.value = 'npm';
  }
  applyFeishuImportCliTemplate();
  const appId = els.feishuAppId ? els.feishuAppId.value.trim() : '';
  if (!appId) {
    if (els.feishuAppId) {
      els.feishuAppId.focus();
    }
    renderFeishuAuthStatus(collectIntegrationsConfig().feishu || {});
    setMessage('请先填写自有飞书应用 App ID。App Secret 不要填入页面，终端提示时手工粘贴。', 'error');
    return;
  }
  if (els.feishuCliAuthArgs) {
    els.feishuCliAuthArgs.value = `exec --yes --package=@larksuite/cli -- lark-cli config init --app-id ${appId} --app-secret-stdin --brand feishu --name delivery-workflow`;
  }
  renderFeishuAuthStatus(collectIntegrationsConfig().feishu || {});
  setMessage('已填入自有应用初始化模板。点击运行后，在终端提示时粘贴 App Secret。');
}

async function authorizeFeishu() {
  const integrations = collectIntegrationsConfig();
  const feishu = integrations.feishu || {};
  renderFeishuAuthStatus(feishu);
  if ((feishu.mode || feishu.authMode) === 'cli') {
    if (!feishu.cliCommand) {
      if (els.feishuCliCommand) {
        els.feishuCliCommand.focus();
      }
      els.feishuAuthStatus.textContent = '请先填写 CLI 命令，例如公司提供的 lark-mcp 或飞书文档导入命令。';
      setMessage('请先填写飞书 / Lark CLI 命令。', 'error');
      return;
    }
    if (isCliSubcommandOnly(feishu.cliCommand)) {
      if (els.feishuCliCommand) {
        els.feishuCliCommand.focus();
      }
      els.feishuAuthStatus.textContent = 'CLI 可执行命令不能填 login。请填真实命令，例如 npx、lark-mcp 或公司封装命令；login 放到“CLI 登录参数”。';
      setMessage('CLI 命令填写不正确：login 不是可执行命令。', 'error');
      return;
    }
    if (hasCommandArguments(feishu.cliCommand)) {
      if (els.feishuCliCommand) {
        els.feishuCliCommand.focus();
      }
      els.feishuAuthStatus.textContent = 'CLI 可执行命令只填命令本身，例如 npx；包名和 login 放到“CLI 登录参数”。';
      setMessage('CLI 命令填写不正确：请把参数移到 CLI 登录参数。', 'error');
      return;
    }
    setLoading(els.authorizeFeishuBtn, true, '打开中...');
    try {
      const data = await api('/api/integration/feishu/authorize-cli', {
        method: 'POST',
        body: JSON.stringify({ feishu }),
      });
      els.feishuAuthStatus.textContent = `已打开本地终端执行：${data.commandLine || feishu.cliCommand}。请在终端完成扫码登录。`;
      setMessage('已打开飞书 / Lark CLI 登录终端，请在终端完成扫码授权。');
    } finally {
      setLoading(els.authorizeFeishuBtn, false);
      els.authorizeFeishuBtn.textContent = '运行 CLI 登录';
    }
    return;
  }
  const url = buildFeishuAuthorizeUrl(feishu);
  window.open(url.toString(), '_blank', 'noopener,noreferrer');
  setMessage('已打开飞书 / Lark 扫码授权页。授权完成后请回到这里保存或刷新配置。');
}

function buildFeishuAuthorizeUrl(feishu) {
  if (feishu.authUrl) {
    const url = new URL(feishu.authUrl, window.location.origin);
    url.searchParams.set('provider', feishu.provider || 'feishu');
    url.searchParams.set('scopes', (feishu.scopes || []).join(','));
    return url;
  }
  if (!feishu.appId || !feishu.redirectUri) {
    const target = !feishu.appId ? els.feishuAppId : els.feishuRedirectUri;
    if (target) {
      target.focus();
    }
    throw new Error('CLI/MCP 登录通常由命令行工具自己拉起；如需从这里打开扫码页，请填写公司授权入口 URL，或在高级配置中填写平台应用 App ID 和已登记回调地址。');
  }
  const baseUrl = feishu.baseUrl || 'https://open.feishu.cn';
  const url = new URL('/open-apis/authen/v1/authorize', baseUrl);
  url.searchParams.set('app_id', feishu.appId);
  url.searchParams.set('redirect_uri', feishu.redirectUri);
  url.searchParams.set('state', buildFeishuOauthState(feishu));
  return url;
}

function buildFeishuOauthState(feishu) {
  const state = {
    provider: feishu.provider || 'feishu',
    scopes: feishu.scopes || [],
    source: 'delivery-workflow',
    nonce: Math.random().toString(36).slice(2, 10),
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

function parseCommandArgs(value) {
  return String(value || '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isCliSubcommandOnly(value) {
  return /^(login|auth|authorize|signin|sign-in|oauth)$/i.test(String(value || '').trim());
}

function hasCommandArguments(value) {
  return /\s/.test(String(value || '').trim());
}

function getPrdTarget() {
  return els.prdTarget ? els.prdTarget.value : '';
}

function configToText(config) {
  els.appPaths.value = (config.appPaths || [])
    .map((item) => `${item.name || ''}${item.name ? '=' : ''}${item.path || ''}`)
    .join('\n');
  renderSelectedAppTags();
  els.feishuDocs.value = (config.feishuDocs || []).join('\n');
  if (els.functionQuery && config.functionPoint) {
    els.functionQuery.value = config.functionPoint.primaryName || config.functionPoint.primaryId || '';
  }
  els.notes.value = config.notes || '';
  if (els.knowledgePaths) {
    els.knowledgePaths.value = (config.knowledge || [])
      .map((item) => `${item.name || ''}${item.name ? '=' : ''}${item.path || ''}`)
      .join('\n');
  }
  if (els.workspaceSkills) {
    els.workspaceSkills.value = (config.skills || []).join('\n');
  }
  if (els.workspaceRules) {
    els.workspaceRules.value = (config.rules || []).join('\n');
  }
  if (els.branchPattern) {
    els.branchPattern.value = config.branchPattern || '';
  }
  if (els.loadAppContextForClarification) {
    els.loadAppContextForClarification.checked = Boolean(config.loadAppContextForClarification);
  }
}


  global.DWConfigDomain = {
    parseLines,
    parseAppPaths,
    parseKnowledgePaths,
    parseIntegrationConfig,
    formatIntegrationConfig,
    renderFeishuIntegrationConfig,
    collectIntegrationsConfig,
    collectFeishuScopes,
    renderFeishuAuthStatus,
    applyFeishuImportCliTemplate,
    applyOfficialFeishuCliPreset,
    openFeishuAdvancedConfig,
    applyFeishuAppInitPreset,
    authorizeFeishu,
    buildFeishuAuthorizeUrl,
    buildFeishuOauthState,
    parseCommandArgs,
    isCliSubcommandOnly,
    hasCommandArguments,
    getPrdTarget,
    configToText,
  };
})(window);
