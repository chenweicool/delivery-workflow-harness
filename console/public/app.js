const {
  state,
  $,
  els,
  setMessage,
  showSyncResult,
  closeSyncResult,
  getIdleButtonText,
  setLoading,
  resetButtonLabels,
} = window.DWAppState;

const { api } = window.DWApi;
const {
  escapeHtml,
  renderSimpleMarkdown,
  statusLabel,
  runStatusLabel,
  capabilityTypeLabel,
  stepKindLabel,
} = window.DWFormat;
const {
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
} = window.DWConfigDomain;
const {
  stopRunPolling,
  pollRun,
  runCurrentStep,
  refreshDiff,
  openIdea,
  runAiAdjust,
  openRunLog,
} = window.DWRunsDomain;
const {
  renderCheckpointPanel,
  submitCheckpoint,
  openTechnicalReview,
  saveTechnicalReview,
  openTaskConfirmation,
  saveTaskConfirmation,
} = window.DWCheckpointDomain;
const {
  openLocalStepFile,
  renderArtifacts,
  openArtifact,
  openCurrentArtifact,
  autoPreviewCurrentArtifact,
  autoPreviewSelectedStep,
  togglePreviewEdit,
  savePreviewFile,
} = window.DWArtifactDomain;
const {
  loadState,
  unitIdForStep,
  applyUrlOverrides,
  saveState,
  renderWorkspaceSidebar,
  loadWorkspaces,
  loadStatus,
  renderWorkspaceState,
  renderStagePanels,
  refreshAll,
  initWorkspace,
} = window.DWWorkspaceDomain;

function slugifySessionPart(value, fallback = 'session') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return slug || fallback;
}

function agentSessionKey(unitId, stepId, taskId, agent) {
  return [
    slugifySessionPart(unitId || 'workspace'),
    slugifySessionPart(stepId || 'step'),
    slugifySessionPart(taskId || 'stage'),
    agent === 'claude' ? 'claude' : 'codex',
  ].join('|');
}

function getAgentSession(agent, stepId = state.selectedStepId, taskId = els.taskId ? els.taskId.value.trim() : '') {
  const sessions = state.status && state.status.agentSessions && state.status.agentSessions.current
    ? state.status.agentSessions.current
    : {};
  const unitId = unitIdForStep(stepId) || state.selectedUnitId;
  return sessions[agentSessionKey(unitId, stepId, taskId, agent)] || null;
}

function hasActiveAgentSession(agent, stepId = state.selectedStepId) {
  const taskId = stepId === '06-implement-task' && els.taskId ? els.taskId.value.trim() : '';
  const session = getAgentSession(agent, stepId, taskId);
  return Boolean(session && session.status !== 'ready-for-review' && session.status !== 'closed');
}

function getHandoffDonePayload() {
  const handoffState = state.status && state.status.handoffState ? state.status.handoffState : null;
  return handoffState && handoffState.donePayload ? handoffState.donePayload : null;
}

function compactText(value, maxLength = 72) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function manualStatusLabel(step) {
  if (!step || step.kind !== 'manual') {
    return step && step.done ? '已完成' : '未完成';
  }
  const checkpoint = step.checkpoint || {};
  if (checkpoint.status === 'approved') {
    return '已确认';
  }
  if (checkpoint.status === 'rejected') {
    return '已退回';
  }
  return '等待确认';
}

function manualStatusClass(step) {
  if (step && step.kind === 'manual') {
    const status = step.checkpoint && step.checkpoint.status;
    if (status === 'approved') {
      return 'done';
    }
    if (status === 'rejected') {
      return 'rejected';
    }
    return 'waiting';
  }
  return step && step.done ? 'done' : 'idle';
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function setPreviewState({ mode, path: previewPath = '', editable = false }) {
  state.previewMode = mode;
  state.previewPath = previewPath;
  state.previewDirty = false;
  if (els.previewBox) {
    els.previewBox.classList.toggle('hidden', mode === 'empty');
  }
  els.preview.readOnly = !editable;
  els.preview.classList.toggle('editing', editable);
  const isFile = mode === 'file';
  const isPrompt = mode === 'prompt';
  els.editPreviewBtn.disabled = !(isFile || isPrompt);
  els.editPreviewBtn.textContent = editable ? '只读' : '编辑';
  els.savePreviewBtn.classList.toggle('hidden', !(isFile && editable));
  els.savePreviewBtn.disabled = !(isFile && editable);
  if (els.previewSourceLabel) {
    const labels = {
      file: '产物',
      prompt: '提示词',
      log: '运行日志',
      empty: '预览',
    };
    els.previewSourceLabel.textContent = labels[mode] || '预览';
    els.previewSourceLabel.className = `statePill ${mode === 'log' ? 'active' : mode === 'file' ? 'done' : ''}`.trim();
  }
  if (els.workbenchTitle && mode === 'prompt') {
    els.workbenchTitle.textContent = '预置 Prompt';
  }
}

function setPreviewDirty(dirty) {
  state.previewDirty = dirty;
  if (state.previewMode === 'file' && !els.preview.readOnly) {
    els.savePreviewBtn.disabled = !dirty;
  }
}

async function loadDefinition() {
  state.definition = await api('/api/definition');
}

function renderToolsConfig(tools) {
  state.tools = tools || {};
  if (els.codexPath) {
    els.codexPath.value = state.tools.codexPath || '';
    if (els.codexDesktopPath) {
      els.codexDesktopPath.value = state.tools.codexDesktopPath || '';
    }
    els.claudePath.value = state.tools.claudePath || '';
    els.ideaPath.value = state.tools.ideaPath || '';
    if (els.workspaceRoot) {
      els.workspaceRoot.value = state.tools.workspaceRoot || state.appState.outputRoot || state.definition.defaultOutputRoot || '';
    }
    els.teamConfigRoot.value = state.tools.teamConfigRoot || '';
    if (els.whitepaperRoot) {
      els.whitepaperRoot.value = state.tools.whitepaperRoot || '';
    }
    if (els.appIndexPath) {
      els.appIndexPath.value = state.tools.appIndexPath || '';
    }
    els.repoRoot.value = state.tools.repoRoot || '';
    els.teamProfile.value = state.tools.teamProfile || 'default';
    els.defaultSkillsRoot.value = state.tools.defaultSkillsRoot || '';
    if (els.teamName) {
      els.teamName.value = state.tools.teamName || '';
    }
    els.globalSkills.value = (state.tools.globalSkills || []).join('\n');
    els.globalRules.value = (state.tools.globalRules || []).join('\n');
    els.globalNotes.value = state.tools.globalNotes || '';
    if (els.teamTemplates) {
      els.teamTemplates.value = (state.tools.templates || []).join('\n');
    }
    if (els.integrationConfig) {
      els.integrationConfig.value = formatIntegrationConfig(state.tools.integrations);
    }
    renderFeishuIntegrationConfig(state.tools.integrations || {});
  }
}

function renderTeamProfileStatus(profile) {
  if (!els.teamProfileStatus) {
    return;
  }
  els.teamProfileStatus.hidden = true;
  if (!profile) {
    els.teamProfileStatus.innerHTML = '<span class="badge waiting">未加载团队 Profile</span>';
    return;
  }
  if (!profile.available) {
    els.teamProfileStatus.innerHTML = [
      '<span class="badge waiting">未继承</span>',
      `<span>${escapeHtml(profile.reason || '未找到团队 profile')}</span>`,
    ].join('');
    return;
  }
  els.teamProfileStatus.innerHTML = [
    '<span class="badge done">已继承</span>',
    `<span>${escapeHtml(profile.profileName || 'default')}</span>`,
    `<span>${escapeHtml(profile.appCount || 0)} 个应用</span>`,
    `<span>${escapeHtml(profile.skillCount || 0)} 个 skills</span>`,
    `<span>${escapeHtml(profile.ruleCount || 0)} 条 rules</span>`,
  ].join('');
}

function renderGlobalConfigStatus(profile) {
  if (!els.globalConfigStatus) {
    return;
  }
  const tools = state.tools || {};
  const checks = [
    { label: '工作区目录', ok: Boolean(tools.workspaceRoot || (state.appState && state.appState.outputRoot)) },
    { label: '团队能力库', ok: Boolean(tools.teamConfigRoot) },
    { label: '领域白皮书', ok: Boolean(tools.whitepaperRoot) },
    { label: '本机工具', ok: Boolean(tools.codexPath || tools.claudePath) },
    { label: '飞书接入', ok: Boolean(tools.integrations && tools.integrations.feishu && tools.integrations.feishu.enabled !== false && tools.integrations.feishu.mode && tools.integrations.feishu.mode !== 'disabled') },
  ];
  const readyCount = checks.filter((item) => item.ok).length;
  els.globalConfigStatus.innerHTML = [
    `<div class="configStatusHeader"><strong>接入状态</strong><span>${readyCount}/${checks.length}</span></div>`,
    '<div class="configSlotDots">',
    ...checks.map((item) => [
      `<span class="${item.ok ? 'done' : 'waiting'}" title="${escapeHtml(item.label)}：${item.ok ? '可用' : '未配置'}">`,
      escapeHtml(item.label.slice(0, 2)),
      '</span>',
    ].join('')),
    '</div>',
  ].join('');
  renderConfigDomainStatus();
}

function setText(selector, value) {
  const node = $(selector);
  if (node) {
    node.textContent = value;
  }
}

function basenamePath(value, fallback = '未配置') {
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }
  const parts = text.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || text;
}

function setupConfigCenterLayout() {
  const grid = document.querySelector('.setupConfigGrid');
  if (!grid || grid.dataset.domainLayout === 'true') {
    return;
  }
  grid.dataset.domainLayout = 'true';
  const originalPanels = Array.from(grid.querySelectorAll(':scope > .toolConfigPanel'));
  const saveButton = els.saveToolsConfigBtn;
  const nav = document.createElement('aside');
  nav.className = 'configDomainNav';
  const content = document.createElement('div');
  content.className = 'configDomainContent';
  const footer = document.createElement('div');
  footer.className = 'configDomainFooter';

  const domains = [
    ['startup', '启动', '项目目录和基础运行路径'],
    ['runners', '执行器', 'Codex、Claude、IDE'],
    ['knowledge', '知识库', '团队能力、白皮书、索引'],
    ['business', '业务上下文', '代码仓库和应用范围'],
    ['external', '外部文档', '飞书、Lark、扩展接入'],
  ];

  function createDomainPanel(id, title, description) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.configDomain = id;
    button.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span><em data-config-domain-state="${escapeHtml(id)}">待配置</em>`;
    nav.append(button);

    const panel = document.createElement('section');
    panel.className = 'configDomainPanel';
    panel.dataset.configPanel = id;
    panel.innerHTML = `<div class="configDomainHeader"><span>Config</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div><div class="configDomainBody"></div>`;
    content.append(panel);
    return panel.querySelector('.configDomainBody');
  }

  const bodies = Object.fromEntries(domains.map(([id, title, description]) => [id, createDomainPanel(id, title, description)]));
  const advancedExternalPanels = Array.from(document.querySelectorAll('.capabilityPopover > details.advancedConfigBox:not(.externalConfigPanel)'));

  function moveField(inputId, target) {
    const input = document.querySelector(`#${inputId}`);
    const field = input ? input.closest('label') : null;
    if (field && target) {
      target.append(field);
    }
  }

  function moveNode(selector, target) {
    const node = document.querySelector(selector);
    if (node && target) {
      target.append(node);
    }
  }

  moveField('workspaceRoot', bodies.startup);
  if (saveButton) {
    footer.append(saveButton);
  }

  ['codexPath', 'codexDesktopPath', 'claudePath', 'ideaPath'].forEach((id) => moveField(id, bodies.runners));

  moveNode('.configSummary', bodies.knowledge);
  moveField('teamConfigRoot', bodies.knowledge);
  moveField('whitepaperRoot', bodies.knowledge);
  moveNode('#teamProfileStatus', bodies.knowledge);
  moveNode('.legacyCapabilityConfig', bodies.knowledge);

  moveField('repoRoot', bodies.business);
  moveField('appIndexPath', bodies.business);
  moveField('defaultSkillsRoot', bodies.business);
  const businessHint = document.createElement('section');
  businessHint.className = 'configHintCard';
  businessHint.innerHTML = '<strong>候选应用预留</strong><span>后续这里会从业务代码根目录和应用索引中选择本次需求命中的应用。</span>';
  bodies.business.append(businessHint);

  moveNode('.externalConfigPanel', bodies.external);
  moveField('integrationConfig', bodies.external);
  advancedExternalPanels.forEach((panel) => bodies.external.append(panel));

  originalPanels.forEach((panel) => panel.remove());
  grid.innerHTML = '';
  grid.append(nav, content, footer);

  nav.querySelectorAll('[data-config-domain]').forEach((button) => {
    button.addEventListener('click', () => setActiveConfigDomain(button.dataset.configDomain));
  });
  setActiveConfigDomain('startup');
  renderConfigDomainStatus();
}

function setActiveConfigDomain(domain = 'startup') {
  document.querySelectorAll('[data-config-domain]').forEach((button) => {
    button.classList.toggle('active', button.dataset.configDomain === domain);
  });
  document.querySelectorAll('[data-config-panel]').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.configPanel === domain);
  });
}

function renderConfigDomainStatus() {
  const tools = state.tools || {};
  const integrations = tools.integrations || {};
  const feishu = integrations.feishu || {};
  const states = configReadinessState(tools, feishu);
  Object.entries(states).forEach(([domain, item]) => {
    const node = document.querySelector(`[data-config-domain-state="${domain}"]`);
    if (node) {
      node.textContent = item.ready ? '已配置' : '待配置';
      node.className = item.ready ? 'ready' : 'waiting';
    }
  });
}

function configReadinessState(tools = state.tools || {}, feishu = (state.tools && state.tools.integrations && state.tools.integrations.feishu) || {}) {
  const workspacePath = els.workspacePath ? els.workspacePath.value.trim() : '';
  const hasWorkspace = Boolean(workspacePath && state.status && state.status.isWorkspace);
  return {
    startup: {
      title: '项目目录',
      detail: hasWorkspace ? basenamePath(workspacePath) : '选择或创建项目目录',
      ready: hasWorkspace,
      action: 'project',
      actionLabel: hasWorkspace ? '切换项目' : '选择项目',
    },
    runners: {
      title: '执行器',
      detail: tools.codexPath || tools.codexDesktopPath || tools.claudePath ? 'Codex / Claude 已有可用入口' : '配置 Codex 或 Claude',
      ready: Boolean(tools.codexPath || tools.claudePath || tools.codexDesktopPath),
      domain: 'runners',
      action: 'config',
      actionLabel: '配置执行器',
    },
    knowledge: {
      title: '知识库',
      detail: [tools.teamConfigRoot, tools.whitepaperRoot, tools.appIndexPath].filter(Boolean).length
        ? '已识别知识来源'
        : '预留团队能力库、白皮书、应用索引',
      ready: Boolean(tools.teamConfigRoot || tools.whitepaperRoot || tools.appIndexPath),
      domain: 'knowledge',
      action: 'config',
      actionLabel: '配置知识库',
    },
    business: {
      title: '业务上下文',
      detail: tools.repoRoot ? basenamePath(tools.repoRoot) : '配置业务代码根目录',
      ready: Boolean(tools.repoRoot || tools.appIndexPath),
      domain: 'business',
      action: 'config',
      actionLabel: '配置业务上下文',
    },
    external: {
      title: '外部文档',
      detail: feishu && feishu.enabled && feishu.mode && feishu.mode !== 'disabled' ? `飞书 / Lark：${feishu.mode}` : '飞书、Lark 后续按需接入',
      ready: Boolean(feishu && feishu.enabled && feishu.mode && feishu.mode !== 'disabled'),
      domain: 'external',
      action: 'config',
      actionLabel: '配置外部文档',
    },
  };
}

function renderStartupReadiness() {
  const grid = $('#startupReadyGrid');
  if (!grid) {
    return;
  }
  const tools = state.tools || {};
  const feishu = tools.integrations && tools.integrations.feishu ? tools.integrations.feishu : {};
  const items = Object.entries(configReadinessState(tools, feishu));
  const readyCount = items.filter(([, item]) => item.ready).length;
  setText('#startupReadySummary', `启动条件 ${readyCount}/${items.length}`);
  grid.innerHTML = items.map(([key, item]) => [
    `<button class="startupReadyItem ${item.ready ? 'ready' : 'waiting'}" type="button" data-startup-action="${escapeHtml(item.action)}" data-config-domain-jump="${escapeHtml(item.domain || '')}" data-startup-key="${escapeHtml(key)}">`,
    `<span>${escapeHtml(item.ready ? '已就绪' : '待处理')}</span>`,
    `<strong>${escapeHtml(item.title)}</strong>`,
    `<small>${escapeHtml(item.detail)}</small>`,
    `<em>${escapeHtml(item.actionLabel)}</em>`,
    '</button>',
  ].join('')).join('');
  grid.querySelectorAll('[data-startup-action]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.startupAction === 'project') {
        if (els.demandName) {
          els.demandName.focus();
        }
        return;
      }
      openDeliveryConfig()
        .then(() => setActiveConfigDomain(button.dataset.configDomainJump || 'startup'))
        .catch((error) => setMessage(error.message, 'error'));
    });
  });
}

function renderContextOverview() {
  const tools = state.tools || {};
  const workspacePath = els.workspacePath ? els.workspacePath.value.trim() : '';
  const workspaceName = workspacePath ? basenamePath(workspacePath, workspacePath) : '未选择';
  const profileName = tools.teamProfile || (state.teamProfile && state.teamProfile.profileName) || 'default';
  const repoName = tools.repoRoot ? basenamePath(tools.repoRoot) : '未配置';
  const step = getStep(state.selectedStepId);
  const contract = step ? agentContractForStep(step.id) : null;
  const executorName = els.executor && els.executor.value === 'claude' ? 'Claude' : 'Codex';
  const agentName = contract ? `${contract.name} / ${executorName}` : executorName;
  const workspaceKnowledge = state.status && state.status.config && Array.isArray(state.status.config.knowledge)
    ? state.status.config.knowledge
    : [];
  const knowledgeChecks = [
    tools.teamConfigRoot,
    tools.whitepaperRoot,
    tools.appIndexPath,
    workspaceKnowledge.length ? `${workspaceKnowledge.length} local` : '',
  ].filter(Boolean);
  const knowledgeState = knowledgeChecks.length ? `${knowledgeChecks.length} 类来源` : '待加载';
  const workspaceLabel = workspacePath || '创建或打开一个 workspace 后继续。';

  setText('#contextWorkspaceName', workspaceName);
  setText('#contextWorkspacePath', workspaceLabel);
  setText('#contextProfileName', profileName);
  setText('#contextAgentName', agentName);
  setText('#contextRepoState', repoName);
  setText('#contextKnowledgeState', knowledgeState);

  setText('#overviewWorkspace', workspaceName === '未选择' ? '未选择项目' : workspaceName);
  setText('#overviewProfile', profileName);
  setText('#overviewRepo', repoName);
  setText('#overviewAgent', agentName);
  setText('#overviewKnowledge', knowledgeState);
  setText('#sideProjectName', workspaceName === '未选择' ? '未选择项目' : workspaceName);
  setText('#sideProjectPath', workspacePath || '选择目录后开始交付');
  setText('#sideProjectRepo', tools.repoRoot ? `Repo ${repoName}` : 'Repo 未配置');
}

function renderKnowledgeReservation() {
  const tools = state.tools || {};
  const workspaceKnowledge = state.status && state.status.config && Array.isArray(state.status.config.knowledge)
    ? state.status.config.knowledge
    : [];
  const sources = [
    tools.teamConfigRoot ? '团队能力库' : '',
    tools.whitepaperRoot ? '领域白皮书' : '',
    tools.appIndexPath ? '应用索引' : '',
    workspaceKnowledge.length ? `本次补充 ${workspaceKnowledge.length} 项` : '',
  ].filter(Boolean);
  const ready = sources.length > 0;
  setText('#knowledgeInspectorTitle', ready ? '已识别知识来源' : '知识库加载预留');
  setText('#knowledgeInspectorBody', ready
    ? `已识别：${sources.join('、')}。后续在这里选择命中的知识源，再随 handoff 交给 CLI。`
    : '预留给团队知识库、领域白皮书、应用索引和本次补充知识。');
  const badge = $('#knowledgeInspectorBadge');
  if (badge) {
    badge.textContent = ready ? '已识别' : '待接入';
    badge.className = `statePill ${ready ? 'active' : 'waiting'}`;
  }
}

function renderNavPage(target) {
  const panel = $('#navPagePanel');
  const eyebrow = $('#navPageEyebrow');
  const title = $('#navPageTitle');
  const body = $('#navPageBody');
  const actions = $('#navPageActions');
  if (!panel || !title || !body || !actions) {
    return;
  }

  const tools = state.tools || {};
  const workspacePath = els.workspacePath ? els.workspacePath.value.trim() : '';
  const workspaceKnowledge = state.status && state.status.config && Array.isArray(state.status.config.knowledge)
    ? state.status.config.knowledge
    : [];
  const prdCount = state.status && state.status.materialPrdCount ? state.status.materialPrdCount : 0;
  const workspaceLabel = workspacePath || '未选择项目目录';
  const repoLabel = tools.repoRoot ? basenamePath(tools.repoRoot) : '未配置业务仓库';
  const knowledgeLabel = [tools.teamConfigRoot, tools.whitepaperRoot, tools.appIndexPath].filter(Boolean).length;
  const pages = {
    workspace: {
      eyebrow: 'Bootstrap',
      title: '启动配置',
      body: workspacePath
        ? `当前项目目录：${workspacePath}`
        : '先选项目目录，再补全全局接入。Harness 后续只围绕这个目录组织 CLI 交付。',
      actions: [
        ['switch', workspacePath ? '切换项目' : '选择项目'],
        ['new', '新建项目'],
        ['settings', '全局接入'],
      ],
      cards: [
        { title: '项目目录', body: workspaceLabel, state: workspacePath ? 'ready' : 'waiting', status: workspacePath ? '已选择' : '待选择', action: 'switch', cta: workspacePath ? '切换' : '选择' },
        { title: '业务仓库', body: repoLabel, state: tools.repoRoot ? 'ready' : 'waiting', status: tools.repoRoot ? '已配置' : '待配置', action: 'settings', cta: '配置' },
        { title: '全局接入', body: '工具路径、知识源、执行器、插件', state: (tools.codexPath || tools.claudePath) ? 'ready' : 'waiting', status: (tools.codexPath || tools.claudePath) ? '可运行' : '待配置', action: 'settings', cta: '打开' },
      ],
    },
    knowledge: {
      eyebrow: 'Context',
      title: '上下文装配',
      body: '整理 PRD、需求材料、团队知识、领域文档和应用索引，作为 CLI handoff 的输入。',
      actions: [
        ['settings', '配置知识源'],
        ['materials', '补充材料'],
      ],
      cards: [
        { title: 'PRD / 需求材料', body: prdCount ? `已导入 ${prdCount} 个 PRD 来源` : '等待导入 PRD 或补充说明', state: prdCount ? 'ready' : 'waiting', status: prdCount ? '已准备' : '缺输入', action: 'materials', cta: '补材料' },
        { title: '知识库来源', body: knowledgeLabel ? `已配置 ${knowledgeLabel} 类来源` : '团队能力库、白皮书、应用索引待配置', state: knowledgeLabel ? 'ready' : 'waiting', status: knowledgeLabel ? '可装配' : '待配置', action: 'settings', cta: '配置' },
        { title: '本次补充知识', body: workspaceKnowledge.length ? `已登记 ${workspaceKnowledge.length} 项` : '后续支持本次需求专属知识源', state: workspaceKnowledge.length ? 'ready' : 'waiting', status: workspaceKnowledge.length ? '已登记' : '预留', action: 'materials', cta: '添加' },
        { title: 'Handoff 包', body: '把 PRD、知识命中、规则和阶段目标合成 CLI 输入', state: knowledgeLabel || prdCount ? 'ready' : 'waiting', status: '自动生成', action: 'workbench', cta: '进入编排' },
      ],
    },
    agents: {
      eyebrow: 'Runners',
      title: '执行器管理',
      body: '管理 Codex、Claude、IDE 和后续可插拔 CLI。Harness 只负责调度、交接和回收。',
      actions: [
        ['settings', '配置执行器'],
        ['workbench', '进入流程'],
      ],
      cards: [
        { title: 'Codex CLI', body: tools.codexPath || tools.codexDesktopPath || '配置 Codex CLI 或桌面端路径', state: (tools.codexPath || tools.codexDesktopPath) ? 'ready' : 'waiting', status: (tools.codexPath || tools.codexDesktopPath) ? '可调度' : '待配置', action: 'settings', cta: '配置' },
        { title: 'Claude Code', body: tools.claudePath || '可选执行器，用于切换模型/会话策略', state: tools.claudePath ? 'ready' : 'waiting', status: tools.claudePath ? '可调度' : '可选', action: 'settings', cta: '配置' },
        { title: 'IDE / 本机工具', body: tools.ideaPath || '打开实现工程、定位代码和验证结果', state: tools.ideaPath ? 'ready' : 'waiting', status: tools.ideaPath ? '可打开' : '待接入', action: 'settings', cta: '配置' },
        { title: '执行器插槽', body: '后续支持更多 CLI 以同一 handoff 协议接入', state: 'waiting', status: '预留', action: 'message', cta: '查看' },
      ],
    },
    runs: {
      eyebrow: 'Runs',
      title: '运行记录',
      body: '查看 handoff、日志和证据，后续独立成可检索列表。',
      actions: [
        ['artifacts', '查看产物与记录'],
      ],
    },
    settings: {
      eyebrow: 'Settings',
      title: '全局接入',
      body: '配置本机工具、知识源、业务仓库和插件接入。',
      actions: [
        ['settings', '打开配置中心'],
      ],
      cards: [
        ['基础路径', 'Codex、Claude、IDE、workspace root'],
        ['知识源', '团队能力库、领域白皮书、应用索引'],
        ['扩展接入', 'Rules、Skills、外部系统和插件'],
      ],
    },
  };
  const page = pages[target];
  if (!page) {
    panel.classList.add('hidden');
    return;
  }
  if (target === 'workspace' && !(state.status && state.status.isWorkspace)) {
    panel.classList.add('hidden');
    return;
  }
  eyebrow.textContent = page.eyebrow;
  title.textContent = page.title;
  body.textContent = page.body;
  actions.innerHTML = page.actions
    .map(([action, label]) => `<button type="button" data-nav-page-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`)
    .join('');
  const cardHtml = page.cards && page.cards.length
    ? `<div class="navPageCards">${page.cards.map((card) => {
      const item = Array.isArray(card) ? { title: card[0], body: card[1] } : card;
      return `<button class="navPageCard ${escapeHtml(item.state || '')}" type="button" data-nav-page-action="${escapeHtml(item.action || 'message')}" data-nav-page-card="true">
        <span>${escapeHtml(item.status || '状态')}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.body)}</small>
        <em>${escapeHtml(item.cta || '查看')}</em>
      </button>`;
    }).join('')}</div>`
    : '';
  const oldCards = panel.querySelector('.navPageCards');
  if (oldCards) {
    oldCards.remove();
  }
  if (cardHtml) {
    actions.insertAdjacentHTML('beforebegin', cardHtml);
  }
  panel.querySelectorAll('[data-nav-page-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.navPageAction;
      if (action === 'settings') {
        openDeliveryConfig().catch((error) => setMessage(error.message, 'error'));
      } else if (action === 'new') {
        clearWorkspaceSelection().catch((error) => setMessage(error.message, 'error'));
      } else if (action === 'materials') {
        if (!(state.status && state.status.isWorkspace)) {
          setMessage('请先选择项目目录，再补充本次需求材料。');
          return;
        }
        openStageMaterials();
      } else if (action === 'switch') {
        if (els.changeWorkspaceBtn) {
          els.changeWorkspaceBtn.click();
        }
      } else if (action === 'artifacts') {
        setActiveNavPage('artifacts');
      } else if (action === 'workbench') {
        setActiveNavPage('workbench');
      } else {
        setMessage('该功能入口已预留。');
      }
    });
  });
  panel.classList.remove('hidden');
}

function setActiveNavPage(target = 'workbench') {
  if (target === 'workbench' && !(state.status && state.status.isWorkspace)) {
    target = 'workspace';
  }
  document.body.dataset.navPage = target;
  document.querySelectorAll('[data-nav-target]').forEach((item) => {
    item.classList.toggle('active', item.dataset.navTarget === target);
  });
  renderNavPage(target);
}

async function loadToolsConfig() {
  const data = await api('/api/tools/config');
  state.teamProfile = data.teamProfile || null;
  renderToolsConfig(data.tools || {});
  renderTeamProfileStatus(data.teamProfile);
  renderGlobalConfigStatus(data.teamProfile);
}

async function saveToolsConfig(button = els.saveToolsConfigBtn) {
  setLoading(button, true, '保存中...');
  try {
    const data = await api('/api/tools/config', {
      method: 'POST',
      body: JSON.stringify({
        tools: {
          codexPath: els.codexPath.value.trim(),
          codexDesktopPath: els.codexDesktopPath ? els.codexDesktopPath.value.trim() : '',
          claudePath: els.claudePath.value.trim(),
          ideaPath: els.ideaPath.value.trim(),
          workspaceRoot: els.workspaceRoot ? els.workspaceRoot.value.trim() : els.outputRoot.value.trim(),
          teamConfigRoot: els.teamConfigRoot.value.trim(),
          whitepaperRoot: els.whitepaperRoot ? els.whitepaperRoot.value.trim() : '',
          appIndexPath: els.appIndexPath ? els.appIndexPath.value.trim() : '',
          repoRoot: els.repoRoot.value.trim(),
          teamProfile: els.teamProfile.value.trim(),
          defaultSkillsRoot: els.defaultSkillsRoot.value.trim(),
          teamName: els.teamName ? els.teamName.value.trim() : '',
          globalSkills: parseLines(els.globalSkills.value),
          globalRules: parseLines(els.globalRules.value),
          globalNotes: els.globalNotes.value,
          templates: els.teamTemplates ? parseLines(els.teamTemplates.value) : [],
          integrations: collectIntegrationsConfig(),
        },
      }),
    });
    state.teamProfile = data.teamProfile || null;
    renderToolsConfig(data.tools || {});
    if (els.workspaceRoot && els.workspaceRoot.value.trim()) {
      els.outputRoot.value = els.workspaceRoot.value.trim();
      await saveState({ outputRoot: els.outputRoot.value.trim() });
      await loadWorkspaces();
    }
    renderTeamProfileStatus(data.teamProfile);
    renderGlobalConfigStatus(data.teamProfile);
    await loadAvailableApps();
    setMessage(button === els.saveCapabilitiesBtn
      ? '交付配置已保存。后续 Agent 步骤会按步骤类型自动带上匹配的 skills / rules。'
      : '全局配置已保存。新工作区会继承工具路径、团队能力库和代码索引。');
  } finally {
    setLoading(button, false);
  }
}

async function saveDeliveryConfig() {
  setLoading(els.saveCapabilitiesBtn, true, '保存中...');
  try {
    await api('/api/tools/config', {
      method: 'POST',
      body: JSON.stringify({
        tools: {
          codexPath: els.codexPath.value.trim(),
          codexDesktopPath: els.codexDesktopPath ? els.codexDesktopPath.value.trim() : '',
          claudePath: els.claudePath.value.trim(),
          ideaPath: els.ideaPath.value.trim(),
          workspaceRoot: els.workspaceRoot ? els.workspaceRoot.value.trim() : els.outputRoot.value.trim(),
          teamConfigRoot: els.teamConfigRoot.value.trim(),
          whitepaperRoot: els.whitepaperRoot ? els.whitepaperRoot.value.trim() : '',
          appIndexPath: els.appIndexPath ? els.appIndexPath.value.trim() : '',
          repoRoot: els.repoRoot.value.trim(),
          teamProfile: els.teamProfile.value.trim(),
          defaultSkillsRoot: els.defaultSkillsRoot.value.trim(),
          teamName: els.teamName ? els.teamName.value.trim() : '',
          globalSkills: parseLines(els.globalSkills.value),
          globalRules: parseLines(els.globalRules.value),
          globalNotes: els.globalNotes.value,
          templates: els.teamTemplates ? parseLines(els.teamTemplates.value) : [],
          integrations: collectIntegrationsConfig(),
        },
      }),
    });
    if (els.workspaceRoot && els.workspaceRoot.value.trim()) {
      els.outputRoot.value = els.workspaceRoot.value.trim();
      await saveState({ outputRoot: els.outputRoot.value.trim() });
    }

    const workspacePath = els.workspacePath.value.trim();
    if (workspacePath) {
      const data = await api('/api/workspace/config', {
        method: 'POST',
        body: JSON.stringify({
          workspacePath,
          appPaths: parseAppPaths(els.appPaths.value),
          knowledge: parseKnowledgePaths(els.knowledgePaths ? els.knowledgePaths.value : ''),
          skills: els.workspaceSkills ? parseLines(els.workspaceSkills.value) : [],
          rules: els.workspaceRules ? parseLines(els.workspaceRules.value) : [],
          branchPattern: els.branchPattern ? els.branchPattern.value.trim() : '',
          feishuDocs: parseLines(els.feishuDocs.value),
          loadAppContextForClarification: Boolean(els.loadAppContextForClarification && els.loadAppContextForClarification.checked),
          notes: els.notes.value,
        }),
      });
      configToText(data.config || {});
      await loadToolsConfig();
      await loadStatus();
      setMessage('团队 / 需求配置已保存。后续步骤会按团队默认能力和本次需求配置组装提示词。');
    } else {
      await loadToolsConfig();
      await loadAvailableApps();
      setMessage('团队默认配置已保存。选择 workspace 后可继续配置本次需求的候选应用和背景知识。');
    }
  } finally {
    setLoading(els.saveCapabilitiesBtn, false);
  }
}

async function loadRuns() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    state.runs = [];
    return;
  }
  const data = await api(`/api/runs/list?workspacePath=${encodeURIComponent(workspacePath)}`);
  state.runs = data.runs || [];
  if (!state.activeRunId && state.runs.length) {
    state.activeRunId = state.runs[0].runId;
  }
}

function renderFlow() {
  const units = state.status && state.status.units ? state.status.units : state.definition.units;
  const visibleUnits = units.filter((unit) => unit.id !== 'workspace');
  els.flow.innerHTML = visibleUnits
    .map((unit) => {
      const selected = unit.id === state.selectedUnitId ? ' selected' : '';
      const status = unit.status || 'idle';
      const metaText = stageMetaText(unit);
      return `<button class="unitNode${selected}" data-unit="${escapeHtml(unit.id)}" type="button">
        <h3>${escapeHtml(unit.title)}</h3>
        <div class="unitMeta">
          <span class="badge ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>
          <span class="badge">${escapeHtml(metaText)}</span>
        </div>
      </button>`;
    })
    .join('');

  els.flow.querySelectorAll('[data-unit]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.selectedUnitId = button.dataset.unit;
      const unit = getSelectedUnit();
      state.selectedStepId = unit.steps[0];
      await saveState({ selectedUnitId: state.selectedUnitId });
      selectStep(state.selectedStepId);
      await ensureKnownFactsLoaded();
    });
  });
}

function getSelectedUnit() {
  const units = state.status && state.status.units ? state.status.units : state.definition.units;
  return units.find((item) => item.id === state.selectedUnitId) ||
    units.find((item) => item.id !== 'workspace') ||
    units[0];
}

function ensureSelectedStepInUnit() {
  const unit = getSelectedUnit();
  if (!unit || !unit.steps || !unit.steps.length) {
    return;
  }
  if (!unit.steps.includes(state.selectedStepId)) {
    state.selectedStepId = unit.steps[0];
  }
}

function focusNextActionAfterWorkspaceInit() {
  const recommendation = state.status && state.status.nextRecommendation;
  if (
    state.selectedUnitId === 'workspace'
    && recommendation
    && recommendation.unitId
    && recommendation.unitId !== 'workspace'
  ) {
    state.selectedUnitId = recommendation.unitId;
    state.selectedStepId = recommendation.stepId || getSelectedUnit().steps[0];
  }
}

function getStep(stepId) {
  if (state.status && state.status.steps && state.status.steps[stepId]) {
    return state.status.steps[stepId];
  }
  return {
    id: stepId,
    ...(state.definition.steps[stepId] || {}),
    done: false,
    outputStatuses: [],
  };
}

function selectStep(stepId) {
  if (!stepId) {
    return;
  }
  state.selectedStepId = stepId;
  const step = getStep(stepId);
  const firstExistingOutput = (step.outputStatuses || []).find((item) => item.exists && !item.path.endsWith('/**'));
  if (firstExistingOutput && els.artifactList) {
    els.artifactList.value = firstExistingOutput.path;
  }
  const stepRuns = getRunsForCurrentStep();
  if (stepRuns.length) {
    state.activeRunId = stepRuns[0].runId;
  }
  render();
  setTimeout(() => {
    autoPreviewSelectedStep().catch((error) => setMessage(error.message, 'error'));
  }, 0);
}

function getRunsForCurrentStep() {
  return (state.runs || []).filter((run) => run.stepId === state.selectedStepId);
}

function renderDetail() {
  const unit = getSelectedUnit();
  if (!unit) {
    return;
  }
  ensureSelectedStepInUnit();
  els.unitInputs.innerHTML = unit.inputs.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  els.unitOutputs.innerHTML = unit.outputs.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  renderKnownFactsPanel(unit);

  els.steps.innerHTML = unit.steps
    .map((stepId) => {
      const step = getStep(stepId);
      const kind = stepKindLabel(step.kind);
      const doneClass = manualStatusClass(step);
      const description = step.description || step.commandFile || '';
      const selectedClass = stepId === state.selectedStepId ? ' selected' : '';
      const statusText = step.kind === 'manual' ? manualStatusLabel(step) : step.blocked ? '等待前置确认' : step.done ? '已完成' : '未完成';
      const capabilityTypes = step.metadata && Array.isArray(step.metadata.capabilityTypes)
        ? step.metadata.capabilityTypes
        : [];
      const capabilityBadges = capabilityTypes
        .map((type) => `<span class="badge skillBadge">${escapeHtml(capabilityTypeLabel(type))}</span>`)
        .join('');
      const selectedMark = stepId === state.selectedStepId
        ? '<span class="badge active stepCurrentMark">当前</span>'
        : '<span class="badge stepCurrentMark mutedMark">当前</span>';
      return `<div class="stepRow${selectedClass}" data-step="${escapeHtml(stepId)}">
        <div class="stepTitle">
          <strong>${escapeHtml(step.title || stepId)}</strong>
          <span>${escapeHtml(description)}</span>
        </div>
        <div class="stepMeta">
          <span class="badge">${escapeHtml(kind)}</span>
          <span class="badge ${doneClass}">${escapeHtml(statusText)}</span>
          ${capabilityBadges}
          ${selectedMark}
        </div>
      </div>`;
    })
    .join('');

  els.steps.querySelectorAll('.stepRow').forEach((row) => {
    row.addEventListener('click', () => {
      selectStep(row.dataset.step);
    });
  });
}

function renderKnownFactsPanel(unit) {
  const visible = Boolean(unit && unit.id === 'prd-to-design' && state.status && state.status.isWorkspace);
  els.knownFactsPanel.classList.toggle('hidden', !visible);
  if (!visible) {
    return;
  }
  if (state.knownFactsLoadedFor !== els.workspacePath.value.trim()) {
    els.knownFactsState.textContent = '未加载';
    els.knownFactsState.className = 'badge waiting';
  }
}

function renderCurrentStep() {
  const step = getStep(state.selectedStepId);
  if (!step || !step.id) {
    if (els.currentStepDesc) {
      els.currentStepDesc.textContent = '';
    }
    els.runStepBtn.disabled = true;
    els.showPromptBtn.disabled = true;
    if (els.openCodexCliBtn) els.openCodexCliBtn.disabled = true;
    if (els.openClaudeCliBtn) els.openClaudeCliBtn.disabled = true;
    if (els.openWorkspaceFolderBtn) els.openWorkspaceFolderBtn.disabled = true;
    if (els.sideOpenWorkspaceBtn) els.sideOpenWorkspaceBtn.disabled = true;
    if (els.openCurrentIdeaBtn) els.openCurrentIdeaBtn.disabled = true;
    if (els.handoffStatus) els.handoffStatus.textContent = '请先选择一个步骤';
    return;
  }

  if (els.currentStepDesc) {
    els.currentStepDesc.textContent = step.description || step.commandFile || '';
  }

  const isAgentStep = step.kind === 'agent';
  const isManualStep = step.kind === 'manual';
  const isLocalStep = step.kind === 'local';
  const isTaskRequiredMissing = step.id === '06-implement-task' && !els.taskId.value.trim();
  const agentContract = agentContractForStep(step.id);
  const hasCodexSession = isAgentStep && hasActiveAgentSession('codex', step.id);
  const hasClaudeSession = isAgentStep && hasActiveAgentSession('claude', step.id);
  const donePayload = getHandoffDonePayload();
  const isAiReadyForReview = isAgentStep && Boolean(donePayload);
  const selectedUnit = getSelectedUnit();
  const agentBlocker = isAgentStep && selectedUnit ? stageAgentBlocker(selectedUnit.id) : '';
  if (els.workflowStepsPanel) {
    els.workflowStepsPanel.classList.toggle('hidden', isLocalStep);
  }
  if (els.agentBridgePanel) {
    els.agentBridgePanel.classList.toggle('hidden', isLocalStep);
  }
  if (els.workbenchTitle) {
    els.workbenchTitle.textContent = isManualStep ? '人工确认与产物' : '阶段产物与验收';
  }
  if (els.localStepPanel) {
    els.localStepPanel.classList.toggle('hidden', !isLocalStep);
  }
  if (els.commandBar) {
    els.commandBar.classList.toggle('hidden', isLocalStep);
  }
  if (els.previewBox) {
    els.previewBox.classList.toggle('hidden', isLocalStep);
  }
  renderLocalStepPanel(step);
  els.runStepBtn.disabled = !isAgentStep || step.blocked || isTaskRequiredMissing;
  els.showPromptBtn.disabled = !isAgentStep || isTaskRequiredMissing;
  const hasWorkspace = Boolean(els.workspacePath.value.trim() && state.status && state.status.isWorkspace);
  if (els.openCodexCliBtn) {
    const canRunAgent = hasWorkspace && isAgentStep && !step.blocked && !isTaskRequiredMissing && !agentBlocker;
    els.openCodexCliBtn.disabled = isAiReadyForReview ? false : !canRunAgent;
    els.openCodexCliBtn.classList.toggle('hidden', !isAgentStep);
    els.openCodexCliBtn.textContent = isAiReadyForReview
      ? '进入验收'
      : hasCodexSession
        ? `继续 ${agentContract ? agentContract.name : 'Codex'}`
        : `交给 ${agentContract ? agentContract.name : 'Codex'}`;
  }
  if (els.openClaudeCliBtn) {
    els.openClaudeCliBtn.disabled = !hasWorkspace || !isAgentStep || step.blocked || isTaskRequiredMissing || Boolean(agentBlocker);
    els.openClaudeCliBtn.classList.toggle('hidden', !isAgentStep);
    els.openClaudeCliBtn.textContent = hasClaudeSession ? '继续 Claude' : '改用 Claude';
  }
  if (els.openWorkspaceFolderBtn) els.openWorkspaceFolderBtn.disabled = !hasWorkspace;
  if (els.sideOpenWorkspaceBtn) els.sideOpenWorkspaceBtn.disabled = !hasWorkspace;
  if (els.openCurrentIdeaBtn) els.openCurrentIdeaBtn.disabled = !hasWorkspace;
  els.editTemplateBtn.disabled = !step.commandFile;
  els.resetTemplateBtn.disabled = !step.commandFile;
  els.runStepBtn.textContent = step.blocked
    ? '等待前置确认'
    : isTaskRequiredMissing
      ? '先选择任务'
      : isAgentStep
        ? '运行当前步骤'
        : step.kind === 'manual'
          ? '人工步骤不可运行'
          : '本地步骤不可运行';
  if (els.bridgeTitle) {
    els.bridgeTitle.textContent = isAgentStep
      ? (agentContract ? agentContract.name : 'AI 协作会话')
      : isManualStep
        ? '人工确认'
        : '本地步骤';
  }
  if (els.bridgeDesc) {
    els.bridgeDesc.textContent = isAgentStep
      ? isAiReadyForReview
        ? compactText(donePayload.summary || 'AI 已完成当前阶段，等待人工验收。')
        : agentContract
          ? `${agentContract.role} 结束时必须回写结构化产物。`
          : '按当前角色生成 handoff，并打开或恢复默认执行器会话。'
      : isManualStep
        ? '查看产物后确认终版，或带着意见退回给 AI 修改。'
        : '本地初始化会准备 workspace 骨架和流程配置。';
  }
  if (els.handoffStatus) {
    const taskText = step.id === '06-implement-task'
      ? `，任务编号：${els.taskId.value.trim() || '待填写'}`
      : '';
    if (!hasWorkspace) {
      els.handoffStatus.textContent = '选择 workspace 后可继续';
    } else if (isAgentStep) {
      const activeAgents = [
        hasCodexSession ? 'Codex' : '',
        hasClaudeSession ? 'Claude' : '',
      ].filter(Boolean).join(' / ');
      els.handoffStatus.textContent = step.blocked
        ? `当前步骤：${step.title || step.id}${taskText}。请先完成前置确认。`
        : isAiReadyForReview
          ? `AI 已完成：${donePayload.doneFile || '.workflow/handoff/done.json'}`
          : activeAgents
          ? `当前步骤：${step.title || step.id}${taskText}。已有 ${activeAgents} 会话，可继续处理。`
          : `当前步骤：${step.title || step.id}${taskText}。尚未建立 AI 会话。`;
    } else if (isManualStep) {
      els.handoffStatus.textContent = `当前步骤：${step.title || step.id}。请在下方人工确认区处理。`;
    } else {
      els.handoffStatus.textContent = `当前步骤：${step.title || step.id}。已由本地初始化流程处理。`;
    }
  }
}

function artifactExists(relativePath) {
  const files = state.status && Array.isArray(state.status.artifactFiles) ? state.status.artifactFiles : [];
  return files.some((item) => item.type === 'file' && item.path === relativePath);
}

function agentContractForStep(stepId) {
  const contracts = {
    requirement: {
      name: '需求分析 Agent',
      role: '整理 PRD、加载上下文、澄清需求口径。',
      session: '可多轮澄清，最终回写需求确认文件。',
      outputs: ['prd/document.md', 'design/context-summary.md', 'design/requirement-confirmation.md'],
    },
    design: {
      name: '技术方案 Agent',
      role: '基于已确认需求和真实代码生成技术方案。',
      session: '可接续需求会话，也可独立会话。',
      outputs: ['design/technical-design.md', 'design/technical-confirmation.md', 'design/technical-design.changelog.md'],
    },
    coding: {
      name: '编码实现 Agent',
      role: '按已确认任务实现代码，并沉淀变更证据。',
      session: '可按任务连续会话。',
      outputs: ['tasks/task-progress.md', 'review/change-log.md', 'review/self-check.md'],
    },
    review: {
      name: 'Review Agent',
      role: '审查 diff、风险和一致性，输出修复建议。',
      session: '建议独立会话。',
      outputs: ['review/ai-review.md', 'review/risk-list.md'],
    },
    test: {
      name: '测试 Agent',
      role: '生成测试计划和执行结果。',
      session: '可接续 Review 会话。',
      outputs: ['review/unit-test-plan.md', 'review/unit-test-result.md'],
    },
    archive: {
      name: '归档 Agent',
      role: '整理上线清单、交付总结和知识卡片。',
      session: '建议独立会话。',
      outputs: ['delivery/release-checklist.md', 'delivery/delivery-summary.md', 'archive/knowledge-card.md'],
    },
  };
  if (['import-prd', '00-load-context', '01-clarify-requirement'].includes(stepId)) return contracts.requirement;
  if (stepId === '02-generate-technical-design') return contracts.design;
  if (['05-split-tasks', '06-implement-task'].includes(stepId)) return contracts.coding;
  if (stepId === '07-review-code') return contracts.review;
  if (stepId === '06-generate-unit-tests') return contracts.test;
  if (['09-release-checklist', '08-delivery-summary', '10-archive-knowledge'].includes(stepId)) return contracts.archive;
  return null;
}

function unitProgress(unit) {
  if (!unit || !Array.isArray(unit.steps) || !unit.steps.length) {
    return { done: 0, total: 0 };
  }
  const done = unit.steps.filter((stepId) => {
    const step = getStep(stepId);
    return step && step.done;
  }).length;
  return { done, total: unit.steps.length };
}

function stageReadiness() {
  const config = state.status && state.status.config ? state.status.config : {};
  const prdCount = state.status ? state.status.materialPrdCount || 0 : 0;
  const feishuCount = Array.isArray(config.feishuDocs) ? config.feishuDocs.filter((item) => String(item || '').trim()).length : 0;
  const notesReady = Boolean(String(config.notes || '').trim());
  return {
    prdCount,
    feishuCount,
    notesReady,
    hasDemandSource: prdCount > 0 || artifactExists('prd/document.md') || notesReady,
    hasReadablePrdSource: prdCount > 0 || artifactExists('prd/document.md') || notesReady,
    hasPrdMd: artifactExists('prd/document.md'),
    hasWhitepaperFunction: Boolean(config.whitepaperContext && config.whitepaperContext.primaryFunction),
    hasContext: artifactExists('design/context-summary.md'),
    hasRequirement: artifactExists('design/requirement-confirmation.md'),
    hasDesign: artifactExists('design/technical-design.md'),
    hasTechnicalConfirmation: artifactExists('design/technical-confirmation.md'),
    hasTasks: artifactExists('tasks/task-list.md'),
    hasChangeLog: artifactExists('review/change-log.md'),
    hasSelfCheck: artifactExists('review/self-check.md'),
    hasReview: artifactExists('review/ai-review.md'),
    hasRiskList: artifactExists('review/risk-list.md'),
    hasRelease: artifactExists('delivery/release-checklist.md'),
    hasDeliverySummary: artifactExists('delivery/delivery-summary.md'),
    hasArchive: artifactExists('archive/knowledge-card.md'),
  };
}

function stageAgentBlocker(unitId) {
  const ready = stageReadiness();
  if (unitId === 'prd-to-design') {
    if (!ready.hasReadablePrdSource) {
      return ready.feishuCount
        ? '当前只有飞书链接，但尚未形成可读 PRD Markdown。请先保存材料触发飞书读取；如失败，请检查授权或上传本地 PRD。'
        : '请先在“本次需求材料”中导入 PRD 文件，或补充可读的需求说明。';
    }
    if (state.tools && state.tools.whitepaperRoot && !(ready.prdCount > 0 || ready.hasPrdMd)) {
      return '白皮书工作流要求先导入可追溯的 PRD 或需求材料，不能只填写临时背景说明。';
    }
    if (state.tools && state.tools.whitepaperRoot && !ready.hasWhitepaperFunction) {
      return '请在“本次需求材料”中从白皮书功能索引确认本次功能点，再交给需求分析 Agent。';
    }
    return '';
  }
  if (unitId === 'design-to-code') {
    if (!ready.hasRequirement || !ready.hasDesign) {
      return '请先完成需求确认和技术方案产物，再进入任务拆分或代码实现。';
    }
    return '';
  }
  if (unitId === 'quality-gate') {
    if (!ready.hasChangeLog && !ready.hasSelfCheck) {
      return '请先完成实现阶段，并回写 change-log 或 self-check，再交给质量检查 Agent。';
    }
    return '';
  }
  if (unitId === 'release-and-archive') {
    if (!ready.hasReview && !ready.hasChangeLog) {
      return '请先完成实现记录或质量检查结论，再生成上线准备和归档材料。';
    }
    return '';
  }
  return '';
}

function assertCurrentStageReadyForAgent() {
  const unit = getSelectedUnit();
  const unitId = unit && unit.id ? unit.id : '';
  const blocker = stageAgentBlocker(unitId);
  if (blocker) {
    throw new Error(blocker);
  }
}

function stageActionPackage(unit, nextStep) {
  const ready = stageReadiness();
  const prdCount = ready.prdCount;
  const hasPrdMd = ready.hasPrdMd;
  const hasContext = ready.hasContext;
  const hasRequirement = ready.hasRequirement;
  const hasDesign = ready.hasDesign;
  const hasTechnicalConfirmation = ready.hasTechnicalConfirmation;
  const hasTasks = ready.hasTasks;
  const hasChangeLog = ready.hasChangeLog;
  const hasReview = ready.hasReview;
  const hasRiskList = ready.hasRiskList;
  const hasRelease = ready.hasRelease;
  const hasArchive = ready.hasArchive;
  const prdBlocker = stageAgentBlocker('prd-to-design');
  const codeBlocker = stageAgentBlocker('design-to-code');
  const qualityBlocker = stageAgentBlocker('quality-gate');
  const archiveBlocker = stageAgentBlocker('release-and-archive');
  const currentStepTitle = nextStep && nextStep.title ? nextStep.title : '等待选择动作';
  const packages = {
    'prd-to-design': {
      title: '需求材料到确认口径',
      summary: ready.hasReadablePrdSource
        ? '材料已具备，可以交给需求 Agent 整理 PRD、上下文和确认口径。'
        : '先补充可读需求材料，再交给需求 Agent。',
      bridge: '页面负责打包 PRD、候选应用和本次上下文；Codex / Claude 负责整理成可确认的需求产物。',
      primaryAction: ready.hasReadablePrdSource ? '交给需求 Agent' : '先补充材料',
      actions: [
        { label: '准备需求材料', hint: 'PRD 文件、需求说明、候选应用', action: 'materials', done: ready.hasReadablePrdSource, current: !ready.hasReadablePrdSource },
        { label: '交给需求 Agent', hint: prdBlocker || '生成 PRD Markdown、上下文摘要和需求确认', action: 'ai', done: hasRequirement, current: ready.hasReadablePrdSource && !hasRequirement, disabled: Boolean(prdBlocker), reason: prdBlocker },
        { label: '人工确认口径', hint: '确认后再进入技术方案', action: hasRequirement ? 'review' : 'prompt', done: false, current: hasRequirement, disabled: !hasRequirement, reason: '等待 Agent 回写需求确认产物。' },
      ],
      writebacks: [
        { label: 'PRD Markdown', path: 'prd/document.md', done: hasPrdMd },
        { label: '上下文摘要', path: 'design/context-summary.md', done: hasContext },
        { label: '需求确认', path: 'design/requirement-confirmation.md', done: hasRequirement },
      ],
      items: [
        { label: '补充材料和应用', done: prdCount > 0, current: prdCount === 0, action: 'materials', hint: '页面保存 PRD、候选应用和本次上下文' },
        { label: '转 Markdown', done: hasPrdMd, current: prdCount > 0 && !hasPrdMd, action: 'prompt', hint: 'AI 回写 prd/document.md' },
        { label: '加载上下文', done: hasContext, current: hasPrdMd && !hasContext, action: 'prompt', hint: 'AI 回写 design/context-summary.md' },
        { label: '形成确认口径', done: hasRequirement, current: hasContext && !hasRequirement, action: 'prompt', hint: 'AI 回写 design/requirement-confirmation.md' },
        { label: '生成技术方案', done: hasDesign, current: hasRequirement && !hasDesign, action: 'prompt', hint: 'AI 回写 design/technical-design.md' },
      ],
    },
    'design-to-code': {
      title: '技术方案到代码实现',
      summary: codeBlocker || '方案已具备，可以拆分任务并进入实现。',
      bridge: '生成任务上下文包，继续同一个 AI 会话；页面负责回收任务产物、diff 和确认结果。',
      primaryAction: codeBlocker ? '等待技术方案' : hasTasks ? '交给实现 Agent' : '生成任务清单',
      actions: [
        { label: '确认技术方案', hint: '依赖需求确认和技术方案产物', action: 'review', done: hasRequirement && hasDesign, current: !hasRequirement || !hasDesign },
        { label: hasTasks ? '交给实现 Agent' : '交给 Agent 拆任务', hint: codeBlocker || '先拆任务，再按任务实现', action: 'ai', done: false, current: !codeBlocker, disabled: Boolean(codeBlocker), reason: codeBlocker },
        { label: '验收实现产物', hint: '查看任务清单、变更记录和自检', action: hasTasks || hasChangeLog ? 'review' : 'prompt', done: false, current: hasTasks || hasChangeLog, disabled: !hasTasks && !hasChangeLog, reason: '等待 Agent 回写任务或实现产物。' },
      ],
      writebacks: [
        { label: '技术方案', path: 'design/technical-design.md', done: hasDesign },
        { label: '技术确认', path: 'design/technical-confirmation.md', done: hasTechnicalConfirmation },
        { label: '任务清单', path: 'tasks/task-list.md', done: hasTasks },
        { label: '变更记录', path: 'review/change-log.md', done: artifactExists('review/change-log.md') },
      ],
      items: [
        { label: '确认方案', done: artifactExists('design/technical-confirmation.md'), action: 'prompt' },
        { label: '拆分任务', done: hasTasks, current: !hasTasks, action: 'prompt' },
        { label: '逐项实现', done: false, current: hasTasks, action: 'prompt' },
      ],
    },
    'quality-gate': {
      title: '质量检查',
      summary: qualityBlocker || '实现证据已具备，可以交给 Review / Test Agent 做质量检查。',
      bridge: '把变更上下文交给 AI 做自检、Review 和单测建议；人工只处理关键风险和结论。',
      primaryAction: qualityBlocker ? '等待实现产物' : hasReview ? '查看质量结论' : '交给质量 Agent',
      actions: [
        { label: '准备变更证据', hint: 'change-log 或 self-check', action: 'review', done: hasChangeLog || ready.hasSelfCheck, current: !hasChangeLog && !ready.hasSelfCheck },
        { label: '交给质量 Agent', hint: qualityBlocker || '生成 AI Review、风险清单和测试建议', action: 'ai', done: hasReview, current: !qualityBlocker && !hasReview, disabled: Boolean(qualityBlocker), reason: qualityBlocker },
        { label: '验收质量结论', hint: '查看 Review、风险和测试建议', action: hasReview ? 'review' : 'prompt', done: false, current: hasReview, disabled: !hasReview, reason: '等待 Agent 回写质量结论。' },
      ],
      writebacks: [
        { label: '变更记录', path: 'review/change-log.md', done: hasChangeLog },
        { label: '自检记录', path: 'review/self-check.md', done: ready.hasSelfCheck },
        { label: 'AI Review', path: 'review/ai-review.md', done: hasReview },
        { label: '风险清单', path: 'review/risk-list.md', done: hasRiskList },
        { label: '单测计划', path: 'review/unit-test-plan.md', done: artifactExists('review/unit-test-plan.md') },
      ],
      items: [
        { label: '变更记录', done: hasChangeLog, current: !hasChangeLog, action: 'prompt' },
        { label: 'AI Review', done: hasReview, current: hasChangeLog && !hasReview, action: 'prompt' },
        { label: '测试计划', done: artifactExists('review/unit-test-plan.md'), action: 'prompt' },
      ],
    },
    'release-and-archive': {
      title: '上线准备与归档',
      summary: archiveBlocker || '质量或实现证据已具备，可以整理上线清单、交付总结和归档材料。',
      bridge: '交给 AI 汇总本次交付材料，人工确认后完成归档闭环。',
      primaryAction: archiveBlocker ? '等待质量结论' : hasRelease || hasArchive ? '验收归档材料' : '生成归档材料',
      actions: [
        { label: '确认质量证据', hint: 'AI Review 或实现记录', action: 'review', done: hasReview || hasChangeLog, current: !hasReview && !hasChangeLog },
        { label: '交给归档 Agent', hint: archiveBlocker || '生成上线清单、交付总结和知识卡片', action: 'ai', done: hasArchive, current: !archiveBlocker && !hasArchive, disabled: Boolean(archiveBlocker), reason: archiveBlocker },
        { label: '验收归档材料', hint: '确认 release checklist 和 knowledge card', action: hasArchive || hasRelease ? 'review' : 'prompt', done: false, current: hasArchive || hasRelease, disabled: !hasArchive && !hasRelease, reason: '等待 Agent 回写归档材料。' },
      ],
      writebacks: [
        { label: '上线清单', path: 'delivery/release-checklist.md', done: hasRelease },
        { label: '交付总结', path: 'delivery/delivery-summary.md', done: ready.hasDeliverySummary },
        { label: '知识归档', path: 'archive/knowledge-card.md', done: hasArchive },
      ],
      items: [
        { label: '上线清单', done: hasRelease, current: !hasRelease, action: 'prompt' },
        { label: '交付总结', done: artifactExists('delivery/delivery-summary.md'), action: 'prompt' },
        { label: '知识归档', done: hasArchive, current: hasRelease && !hasArchive, action: 'prompt' },
      ],
    },
  };
  return packages[unit && unit.id] || {
    title: unit && unit.title ? unit.title : '当前阶段',
    summary: currentStepTitle,
    bridge: '生成当前步骤交接包，交给 AI 继续推进。',
    primaryAction: '交给 AI',
    actions: [
      { label: '补充材料', action: 'materials', done: false, current: false },
      { label: '交给 AI', action: 'ai', done: false, current: true },
      { label: '回到页面验收', action: 'review', done: false, current: false },
    ],
    writebacks: [],
    items: [{ label: currentStepTitle, done: Boolean(nextStep && nextStep.done), current: true, action: 'prompt' }],
  };
}

function renderStageActionPlan(unit, nextStep) {
  if (!els.stageActionPlan) {
    return;
  }
  const actionPackage = stageActionPackage(unit, nextStep);
  const actions = actionPackage.actions && actionPackage.actions.length
    ? actionPackage.actions
    : actionPackage.items;
  const writebacks = actionPackage.writebacks || [];
  const currentAction = actions.find((item) => item.current) || actions.find((item) => !item.done) || actions[0] || {};
  const materialAction = actions.find((item) => item.action === 'materials') || actions[0] || {};
  const aiAction = actions.find((item) => item.action === 'ai') || actions.find((item) => item.action === 'prompt') || currentAction;
  const reviewAction = actions.find((item) => item.action === 'review') || actions[actions.length - 1] || currentAction;
  const outputDoneCount = writebacks.filter((item) => item.done).length;
  const outputTotal = writebacks.length;
  const outputReady = outputTotal > 0 && outputDoneCount === outputTotal;
  const outputPartial = outputDoneCount > 0 && !outputReady;
  const unitAgentStep = {
    'prd-to-design': '01-clarify-requirement',
    'design-to-code': '06-implement-task',
    'quality-gate': '07-review-code',
    'release-and-archive': '10-archive-knowledge',
  }[unit && unit.id];
  const agentContract = agentContractForStep(unitAgentStep || (nextStep && nextStep.id));
  const cliName = agentContract ? agentContract.name : 'CLI Agent';
  const cliState = aiAction.disabled ? '等待输入' : aiAction.done ? '已完成' : '可交接';
  els.stageActionPlan.innerHTML = [
    '<div class="harnessLoop">',
    [
      `<button class="loopCard ${materialAction.done ? 'done' : 'current'}" type="button" data-stage-plan-action="${escapeHtml(materialAction.action || 'materials')}" data-stage-plan-disabled="${materialAction.disabled ? 'true' : ''}" data-stage-plan-reason="${escapeHtml(materialAction.reason || materialAction.hint || '')}">`,
      '<span>Input</span>',
      '<strong>上下文</strong>',
      `<em>${materialAction.done ? '已准备' : '补材料'}</em>`,
      '</button>',
    ].join(''),
    [
      `<button class="loopCard primary ${aiAction.disabled ? 'disabled' : ''} ${aiAction.current ? 'current' : ''}" type="button" data-stage-plan-action="${escapeHtml(aiAction.action || 'ai')}" data-stage-plan-disabled="${aiAction.disabled ? 'true' : ''}" data-stage-plan-reason="${escapeHtml(aiAction.reason || aiAction.hint || '')}">`,
      '<span>CLI</span>',
      `<strong>${escapeHtml(cliName)}</strong>`,
      `<em>${escapeHtml(cliState)}</em>`,
      '</button>',
    ].join(''),
    [
      `<button class="loopCard ${outputReady ? 'done' : outputPartial ? 'current' : ''}" type="button" data-stage-plan-action="${escapeHtml(reviewAction.action || 'review')}" data-stage-plan-disabled="${reviewAction.disabled ? 'true' : ''}" data-stage-plan-reason="${escapeHtml(reviewAction.reason || reviewAction.hint || '')}">`,
      '<span>Output</span>',
      '<strong>产物</strong>',
      `<em>${outputTotal ? `${outputDoneCount}/${outputTotal}` : '待回写'}</em>`,
      '</button>',
    ].join(''),
    '</div>',
    '<div class="slotDock">',
    '<button type="button" data-stage-slot="cli">CLI</button>',
    '<button type="button" data-stage-slot="knowledge">知识</button>',
    '<button type="button" data-stage-slot="rules">规则</button>',
    '<button type="button" data-stage-slot="evidence">证据</button>',
    '</div>',
    writebacks.length ? [
      '<details class="stageWritebackList">',
      `<summary>本阶段产物 <span>${outputDoneCount}/${outputTotal}</span></summary>`,
      '<div>',
      ...writebacks.map((item) => `<button class="${item.done ? 'done' : ''}" type="button" data-stage-artifact-path="${escapeHtml(item.path)}"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.path)}</small></button>`),
      '</div>',
      '</details>',
    ].join('') : '',
  ].join('');
  els.stageActionPlan.querySelectorAll('[data-stage-plan-action]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.stagePlanDisabled === 'true') {
        setMessage(button.dataset.stagePlanReason || '请先完成前置步骤。', 'error');
        return;
      }
      handleStagePlanAction(button.dataset.stagePlanAction);
    });
  });
  els.stageActionPlan.querySelectorAll('[data-stage-artifact-path]').forEach((button) => {
    button.addEventListener('click', () => openCurrentArtifact(button.dataset.stageArtifactPath).catch((error) => setMessage(error.message, 'error')));
  });
  els.stageActionPlan.querySelectorAll('[data-stage-slot]').forEach((button) => {
    button.addEventListener('click', () => {
      const labels = {
        cli: 'CLI 插槽',
        knowledge: '知识库插槽',
        rules: 'Rules / Skills 插槽',
        evidence: '产物证据插槽',
      };
      setMessage(`${labels[button.dataset.stageSlot] || '插槽'}已预留：后续通过配置中心热插拔，不改变 harness 主流程。`);
    });
  });
}

function handleStagePlanAction(action) {
  if (action === 'materials') {
    openStageMaterials();
    return;
  }
  if (action === 'ai') {
    runPrimaryStageAction().catch((error) => {
      setLoading(els.openCodexCliBtn, false);
      setMessage(error.message, 'error');
    });
    return;
  }
  if (action === 'review') {
    openCurrentArtifact().catch((error) => setMessage(error.message, 'error'));
    return;
  }
  showPrompt().catch((error) => setMessage(error.message, 'error'));
}

function renderNextStepPanel() {
  if (!els.nextStepPanel) {
    return;
  }
  const recommendation = state.status && state.status.nextRecommendation;
  const unit = getSelectedUnit();
  ensureSelectedStepInUnit();
  const visible = Boolean(state.status && state.status.isWorkspace && unit && unit.id !== 'workspace');
  els.nextStepPanel.classList.toggle('hidden', !visible);
  if (!visible) {
    return;
  }
  const status = recommendation && recommendation.unitId === unit.id
    ? recommendation.status || 'ready'
    : unit.status || 'ready';
  els.nextStepPanel.className = `stageActionPanel ${status}`;
  const nextStepId = recommendation && recommendation.stepId ? recommendation.stepId : state.selectedStepId;
  const nextStep = getStep(nextStepId);
  const blockers = recommendation && recommendation.unitId === unit.id ? recommendation.blockers || [] : [];
  const actionPackage = stageActionPackage(unit, nextStep);
  const agentContract = agentContractForStep(nextStepId);
  const agentBlocker = stageAgentBlocker(unit.id);
  const visibleBlockers = blockers.length ? blockers : (agentBlocker ? [agentBlocker] : []);
  els.nextStepTitle.textContent = actionPackage.primaryAction;
  els.nextStepSummary.textContent = actionPackage.summary || actionPackage.bridge || '';
  renderStageActionPlan(unit, nextStep);
  if (els.nextStepMeta) {
    els.nextStepMeta.innerHTML = visibleBlockers.length
      ? `<span class="danger">缺少前置输入</span>`
      : '';
  }
  els.nextStepBlockers.innerHTML = visibleBlockers.length
    ? visibleBlockers.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
    : '';
  els.goNextStepBtn.disabled = !nextStepId;
  els.goNextStepBtn.textContent = nextStep && nextStep.kind === 'manual' ? '处理确认' : actionPackage.primaryAction;
  if (els.nextStepOpenArtifactBtn) {
    els.nextStepOpenArtifactBtn.disabled = !getCurrentArtifactPath();
  }
  if (els.openStageMaterialsBtn && els.openCodexCliBtn) {
    const needsPrdMaterial = unit.id === 'prd-to-design' && !(state.status.materialPrdCount || artifactExists('prd/document.md'));
    els.openStageMaterialsBtn.classList.toggle('primary', needsPrdMaterial);
    els.openCodexCliBtn.classList.toggle('primary', !needsPrdMaterial);
  }
  if (els.bridgeDesc) {
    els.bridgeDesc.textContent = nextStep && nextStep.kind === 'manual'
      ? '等待人工确认'
      : (hasActiveAgentSession('codex', nextStepId) || hasActiveAgentSession('claude', nextStepId))
        ? `可继续 ${agentContract ? agentContract.name : 'AI'} 会话`
        : agentContract
          ? `${agentContract.role} ${agentContract.session}`
          : '尚未交给 AI';
  }
  if (els.bridgeTitle) {
    els.bridgeTitle.textContent = agentContract ? agentContract.name : 'AI 会话';
  }
}

function stageSummaryText(unit, step) {
  if (!unit) {
    return '选择一个阶段后显示当前处理方式。';
  }
  if (unit.id === 'prd-to-design') {
    return '导入 PRD 后，交给 AI 一次完成 PRD 转 Markdown、上下文加载、需求澄清和需求口径确认，再进入技术方案。';
  }
  if (unit.id === 'design-to-code') {
    return '基于已确认技术方案拆分任务，交给 AI 在 Codex / Claude 中逐项实现，页面负责回收产物和验收。';
  }
  if (unit.id === 'quality-gate') {
    return '围绕变更、测试、AI Review 和单测计划做质量检查，必要时继续把调整交给 AI。';
  }
  if (unit.id === 'release-and-archive') {
    return '生成上线 checklist、交付总结和归档材料，人工确认后完成本次交付闭环。';
  }
  return step && step.title ? `当前动作：${step.title}` : '查看阶段材料，或把当前阶段交给 AI 继续推进。';
}

function renderAppAccessPanel() {
  if (!els.appAccessPanel) {
    return;
  }
  const apps = state.status && Array.isArray(state.status.appAccessStates)
    ? state.status.appAccessStates
    : [];
  els.appAccessPanel.classList.toggle('hidden', !apps.length);
  if (!apps.length) {
    els.appAccessPanel.innerHTML = '';
    return;
  }
  els.appAccessPanel.innerHTML = [
    '<strong>应用代码读取策略</strong>',
    '<span>06 实现阶段会基于候选应用源仓库，在 workspace 的 apps/&lt;app-name&gt; 下准备需求专用 worktree。</span>',
    '<div class="appAccessList">',
    ...apps.map((app) => {
      const sourceState = app.sourceExists
        ? app.sourceIsGit ? '源仓库可用' : '不是 git 仓库'
        : '源目录不存在';
      const sourceClass = app.sourceExists && app.sourceIsGit ? 'done' : 'waiting';
      const worktreeState = app.worktreeExists ? 'worktree 已存在' : '06 执行时创建';
      return `<div class="appAccessRow">
        <div>
          <strong>${escapeHtml(app.name)}</strong>
          <span>${escapeHtml(app.sourcePath)}</span>
          <small>${escapeHtml(app.worktreeRelativePath || '')}</small>
        </div>
        <div>
          <span class="badge ${sourceClass}">${escapeHtml(sourceState)}</span>
          <span class="badge">${escapeHtml(worktreeState)}</span>
        </div>
      </div>`;
    }),
    '</div>',
  ].join('');
}

function renderAiWorkPanel() {
  if (!els.aiWorkPanel) {
    return;
  }
  const handoffState = state.status && state.status.handoffState ? state.status.handoffState : null;
  const donePayload = handoffState && handoffState.donePayload ? handoffState.donePayload : null;
  const active = state.activeHandoff;
  const visible = Boolean(handoffState && handoffState.hasCurrent) || Boolean(active);
  els.aiWorkPanel.classList.toggle('hidden', !visible);
  if (!visible) {
    return;
  }
  if (donePayload) {
    els.aiWorkPanel.classList.add('done');
    els.aiWorkTitle.textContent = 'AI 已完成，等待验收';
    els.aiWorkSummary.textContent = donePayload.summary || '检测到 delivery-workflow done 完成标记，可以回到页面验收产物。';
    els.aiWorkMeta.textContent = `完成标记：${handoffState.doneFile}${handoffState.doneModifiedAt ? ` / ${handoffState.doneModifiedAt}` : ''}`;
    els.goReviewStepBtn.disabled = false;
    return;
  }
  els.aiWorkPanel.classList.remove('done');
  const stepId = active && active.stepId ? active.stepId : state.selectedStepId;
  const step = getStep(stepId);
  const taskId = stepId === '06-implement-task' && els.taskId ? els.taskId.value.trim() : '';
  const session = active && active.agent
    ? getAgentSession(active.agent, stepId, taskId)
    : getAgentSession('codex', stepId, taskId) || getAgentSession('claude', stepId, taskId);
  const sessionLabel = session && session.agent
    ? `${session.agent === 'claude' ? 'Claude' : 'Codex'} / ${session.sessionName || '未命名会话'}`
    : '';
  els.aiWorkTitle.textContent = 'AI 工作中';
  els.aiWorkSummary.textContent = `${step && step.title ? step.title : stepId} 已交给 AI CLI，多轮处理完成后由 AI 执行 delivery-workflow done。`;
  els.aiWorkMeta.textContent = sessionLabel
    ? `会话：${sessionLabel}；交接文件：${handoffState && handoffState.currentFile ? handoffState.currentFile : '.workflow/handoff/current.md'}`
    : `交接文件：${handoffState && handoffState.currentFile ? handoffState.currentFile : '.workflow/handoff/current.md'}`;
  els.goReviewStepBtn.disabled = true;
}

function renderStepCapabilityPanel() {
  if (!els.stepCapabilityPanel) {
    return;
  }
  const step = getStep(state.selectedStepId);
  if (!step || step.kind !== 'agent') {
    els.stepCapabilityPanel.classList.add('hidden');
    els.stepCapabilityPanel.innerHTML = '';
    return;
  }
  const types = step.metadata && Array.isArray(step.metadata.capabilityTypes) ? step.metadata.capabilityTypes : [];
  const config = state.status && state.status.config ? state.status.config : {};
  const skillCount = Array.isArray(config.skills) ? config.skills.length : 0;
  const ruleCount = Array.isArray(config.rules) ? config.rules.length : 0;
  const capabilityCount = Array.isArray(config.capabilities) ? config.capabilities.length : 0;
  const templateCount = Array.isArray(config.templates) ? config.templates.length : 0;
  els.stepCapabilityPanel.classList.remove('hidden');
  els.stepCapabilityPanel.innerHTML = [
    '<strong>当前步骤装配能力</strong>',
    '<div>',
    ...(types.length ? types.map((type) => `<span class="badge skillBadge">${escapeHtml(capabilityTypeLabel(type))}</span>`) : ['<span class="badge">通用</span>']),
    `<span class="badge">skills ${escapeHtml(skillCount)}</span>`,
    `<span class="badge">rules ${escapeHtml(ruleCount)}</span>`,
    `<span class="badge">capabilities ${escapeHtml(capabilityCount)}</span>`,
    `<span class="badge">templates ${escapeHtml(templateCount)}</span>`,
    '</div>',
  ].join('');
}

function semanticArtifactGroups() {
  return [
    ['研发技术方案', 'design/technical-design.md', 'primary'],
    ['实施任务', 'tasks/task-list.md', 'primary'],
    ['上线 Checklist', 'delivery/release-checklist.md', 'primary'],
    ['需求确认', 'design/requirement-confirmation.md', 'evidence'],
    ['技术确认', 'design/technical-confirmation.md', 'evidence'],
    ['任务确认', 'tasks/task-confirmation.md', 'evidence'],
    ['变更记录', 'review/change-log.md', 'evidence'],
    ['自检记录', 'review/self-check.md', 'evidence'],
    ['AI Review', 'review/ai-review.md', 'evidence'],
    ['测试基线', 'design/unit-test-design.md', 'evidence'],
    ['冒烟基线', 'design/smoke-test-design.md', 'evidence'],
    ['交付总结', 'delivery/delivery-summary.md', 'evidence'],
  ];
}

function renderSemanticArtifactsPanel() {
  if (!els.semanticArtifactsPanel) {
    return;
  }
  const files = state.status && Array.isArray(state.status.artifactFiles) ? state.status.artifactFiles : [];
  const filePaths = new Set(files.filter((item) => item.type === 'file').map((item) => item.path));
  const rows = semanticArtifactGroups().filter(([, path]) => filePaths.has(path));
  const primaryRows = rows.filter(([, , group]) => group === 'primary');
  const evidenceRows = rows.filter(([, , group]) => group !== 'primary');
  els.semanticArtifactsPanel.classList.toggle('hidden', !rows.length);
  if (!rows.length) {
    els.semanticArtifactsPanel.innerHTML = '';
    return;
  }
  els.semanticArtifactsPanel.innerHTML = [
    '<strong>研发交付包</strong>',
    '<div class="artifactChipList">',
    ...primaryRows.map(([label, path]) => `<button type="button" data-semantic-artifact="${escapeHtml(path)}"><span>${escapeHtml(label)}</span><small>${escapeHtml(path)}</small></button>`),
    '</div>',
    evidenceRows.length ? `<details><summary>过程与证据（${evidenceRows.length}）</summary><div class="artifactChipList">${evidenceRows.map(([label, path]) => `<button type="button" data-semantic-artifact="${escapeHtml(path)}"><span>${escapeHtml(label)}</span><small>${escapeHtml(path)}</small></button>`).join('')}</div></details>` : '',
  ].join('');
  els.semanticArtifactsPanel.querySelectorAll('[data-semantic-artifact]').forEach((button) => {
    button.addEventListener('click', () => openCurrentArtifact(button.dataset.semanticArtifact).catch((error) => setMessage(error.message, 'error')));
  });
}

function getLatestArtifacts(limit = 5) {
  const files = state.status && Array.isArray(state.status.artifactFiles)
    ? state.status.artifactFiles.filter((item) => item.type === 'file')
    : [];
  return files
    .slice()
    .sort((a, b) => Date.parse(b.modifiedAt || 0) - Date.parse(a.modifiedAt || 0))
    .slice(0, limit);
}

function getCurrentArtifactPath() {
  const selected = els.artifactList && els.artifactList.value ? els.artifactList.value : '';
  if (selected) {
    return selected;
  }
  const latest = getLatestArtifacts(1)[0];
  return latest ? latest.path : '';
}

function taskOptionLabel(task) {
  const title = task.title && task.title !== task.id ? ` - ${task.title}` : '';
  return `${task.id}${title}`;
}

function renderTaskSelectors() {
  const tasks = state.status && Array.isArray(state.status.tasks) ? state.status.tasks : [];
  const selects = [els.taskId, els.adjustTaskId].filter(Boolean);
  for (const select of selects) {
    const previous = select.value.trim().toUpperCase();
    if (!tasks.length) {
      select.innerHTML = '<option value="">未解析到任务</option>';
      select.disabled = true;
      continue;
    }
    select.disabled = false;
    select.innerHTML = [
      '<option value="">选择任务</option>',
      ...tasks.map((task) => `<option value="${escapeHtml(task.id)}">${escapeHtml(taskOptionLabel(task))}</option>`),
    ].join('');
    if (previous && tasks.some((task) => task.id === previous)) {
      select.value = previous;
    } else if (!select.value && tasks.length === 1) {
      select.value = tasks[0].id;
    }
  }
}

function renderTaskSummary() {
  if (!els.taskSummary) {
    return;
  }
  const step = getStep(state.selectedStepId);
  const visible = Boolean(step && step.id === '06-implement-task');
  const tasks = state.status && Array.isArray(state.status.tasks) ? state.status.tasks : [];
  const selectedTaskId = els.taskId.value.trim().toUpperCase();
  const task = tasks.find((item) => item.id === selectedTaskId);
  els.taskSummary.classList.toggle('hidden', !visible);
  if (!visible) {
    els.taskSummary.innerHTML = '';
    return;
  }
  if (!tasks.length) {
    els.taskSummary.innerHTML = '<span>尚未从 tasks/task-list.md 解析到任务。请先完成 05 拆分实施任务。</span>';
    return;
  }
  if (!task) {
    els.taskSummary.innerHTML = '<span>请选择一个任务编号后再交给 AI 实施。</span>';
    return;
  }
  const rows = [
    task.goal || task.summary ? ['目标', task.goal || task.summary] : null,
    task.apps ? ['应用', task.apps] : null,
    task.files ? ['文件', task.files] : null,
    task.acceptance ? ['验收', task.acceptance] : null,
    task.recommendedSkills ? ['推荐能力', task.recommendedSkills] : null,
  ].filter(Boolean);
  els.taskSummary.innerHTML = [
    `<strong>${escapeHtml(taskOptionLabel(task))}</strong>`,
    ...rows.map(([label, value]) => `<span><b>${escapeHtml(label)}：</b>${escapeHtml(value)}</span>`),
  ].join('');
}

function initWorkspaceFileDocs() {
  return new Map([
    ['AGENTS.md', {
      type: '规则',
      editable: true,
      description: 'Codex 读取的 workspace 总规则，说明流程边界、人工确认点、输出纪律和暂停条件。',
    }],
    ['CLAUDE.md', {
      type: '规则',
      editable: true,
      description: 'Claude Code 读取的协作规则，和 AGENTS.md 保持同一套约束。',
    }],
    ['.workflow/workspace.json', {
      type: '配置',
      editable: false,
      description: '当前需求配置账本，记录 PRD、应用目录、skills、rules、上下文和分支规则。通过页面配置修改。',
    }],
    ['.workflow/workflow.json', {
      type: '流程',
      editable: false,
      description: '可组合单元和基础节点定义，后续进入流程配置中心修改，不建议在初始化页手改。',
    }],
    ['.workflow/progress.md', {
      type: '状态',
      editable: false,
      description: '给人看的全流程进度账本，AI 和页面会维护状态，默认只读。',
    }],
    ['.workflow/progress.json', {
      type: '状态',
      editable: false,
      description: '给页面读取的结构化进度账本，用于刷新状态和判断下一步，禁止手工编辑。',
    }],
    ['.workflow/commands/00-load-context.md', {
      type: '命令模板',
      editable: true,
      description: '加载上下文节点的默认命令模板，高级用户可按团队习惯调整。',
    }],
    ['context/knowledge-version.md', {
      type: '说明',
      editable: true,
      description: '记录本次需求使用的团队知识、规则和上下文快照版本。',
    }],
  ]);
}

function renderLocalStepPanel(step) {
  if (!els.localStepFiles || !step || step.kind !== 'local') {
    return;
  }
  const docs = initWorkspaceFileDocs();
  const outputStatuses = (step.outputStatuses || []).filter((item) => item && item.path && !item.path.endsWith('/**'));
  const extraPaths = step.id === 'init-workspace'
    ? ['.workflow/workspace.json', '.workflow/workflow.json', '.workflow/progress.md', '.workflow/progress.json']
    : [];
  const byPath = new Map(outputStatuses.map((item) => [item.path, item]));
  for (const path of extraPaths) {
    if (!byPath.has(path)) {
      byPath.set(path, {
        path,
        exists: false,
      });
    }
  }
  const rows = Array.from(byPath.values());
  if (!rows.length) {
    els.localStepFiles.innerHTML = '<p class="fieldHelp">当前本地步骤暂无需要展示的文件。</p>';
    return;
  }
  els.localStepFiles.innerHTML = rows
    .map((item) => {
      const exists = Boolean(item.exists);
      const statusClass = exists ? 'done' : 'waiting';
      const statusText = exists ? '已生成' : '未生成';
      const selectedClass = state.previewMode === 'file' && state.previewPath === item.path ? ' selected' : '';
      const doc = docs.get(item.path) || {
        type: '文件',
        editable: item.path.endsWith('.md'),
        description: '本步骤生成的 workspace 文件。',
      };
      const editButton = doc.editable && exists
        ? `<button type="button" data-local-file-action="edit" data-path="${escapeHtml(item.path)}">编辑</button>`
        : '';
      const viewButton = exists
        ? `<button type="button" data-local-file-action="view" data-path="${escapeHtml(item.path)}">查看</button>`
        : '';
      return `<div class="localFileRow${selectedClass}" data-local-file-path="${escapeHtml(item.path)}" data-local-file-exists="${exists ? 'true' : 'false'}">
        <div>
          <strong>${escapeHtml(item.path)}</strong>
          <small>${escapeHtml(doc.type)} / ${doc.editable ? '可编辑' : '只读'}</small>
        </div>
        <div class="localFileActions">
          <span class="badge ${statusClass}">${statusText}</span>
          ${viewButton}
          ${editButton}
        </div>
      </div>`;
    })
    .join('');
  els.localStepFiles.querySelectorAll('[data-local-file-path]').forEach((row) => {
    row.addEventListener('click', () => {
      if (row.dataset.localFileExists !== 'true') {
        return;
      }
      openLocalStepFile(row.dataset.localFilePath, false).catch((error) => setMessage(error.message, 'error'));
    });
  });
  els.localStepFiles.querySelectorAll('[data-local-file-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openLocalStepFile(button.dataset.path, button.dataset.localFileAction === 'edit').catch((error) => setMessage(error.message, 'error'));
    });
  });
}

function renderRuns() {
  if (!els.runList) {
    return;
  }
  const runs = state.selectedStepId === 'ai-adjust'
    ? (state.runs || []).filter((run) => run.stepId === 'ai-adjust')
    : getRunsForCurrentStep();
  if (!runs.length) {
    els.runList.innerHTML = '<option value="">当前步骤暂无运行记录</option>';
    els.runStatus.textContent = '当前步骤暂无运行记录';
    els.runStatus.className = 'statePill';
    els.openRunLogBtn.disabled = true;
    return;
  }
  els.openRunLogBtn.disabled = false;
  els.runList.innerHTML = runs
    .map((run) => {
      const label = `${formatDateTime(run.startedAt)} / ${run.stepId} / ${run.executor} / ${runStatusLabel(run.status)}`;
      const selected = run.runId === state.activeRunId ? ' selected' : '';
      return `<option value="${escapeHtml(run.runId)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');
  const selectedRun = runs.find((run) => run.runId === els.runList.value) || runs[0];
  if (selectedRun) {
    state.activeRunId = selectedRun.runId;
    els.runStatus.textContent = `${runStatusLabel(selectedRun.status)}：${selectedRun.stepId}`;
    els.runStatus.className = `statePill ${selectedRun.status === 'success' ? 'done' : selectedRun.status === 'failed' ? 'waiting' : 'active'}`;
  }
}

function renderAiAdjustPanel() {
  if (!els.aiAdjustPanel) {
    return;
  }
  const visibleUnits = new Set(['design-to-code', 'code-review', 'delivery']);
  const visible = Boolean(state.status && state.status.isWorkspace && visibleUnits.has(state.selectedUnitId));
  els.aiAdjustPanel.classList.toggle('hidden', !visible);
  if (!visible) {
    return;
  }
  if (!els.adjustTaskId.value && els.taskId.value) {
    els.adjustTaskId.value = els.taskId.value.trim().toUpperCase();
  }
  const apps = state.status && state.status.config && Array.isArray(state.status.config.apps)
    ? state.status.config.apps
    : [];
  const currentValue = els.adjustApp.value;
  els.adjustApp.innerHTML = apps.length
    ? [
        '<option value="">全部应用</option>',
        ...apps.map((app) => `<option value="${escapeHtml(app.name)}">${escapeHtml(app.name)} / ${escapeHtml(app.worktreePath || app.sourcePath || app.path || '')}</option>`),
      ].join('')
    : '<option value="">未配置应用</option>';
  if (currentValue && Array.from(els.adjustApp.options).some((option) => option.value === currentValue)) {
    els.adjustApp.value = currentValue;
  }
  els.refreshDiffBtn.disabled = !apps.length;
  els.openIdeaBtn.disabled = !apps.length;
}

function render() {
  renderWorkspaceState();
  renderGlobalConfigStatus(state.teamProfile);
  renderStartupReadiness();
  renderContextOverview();
  renderKnowledgeReservation();
  renderWorkspaceSidebar();
  renderAppAccessPanel();
  renderDomainHarnessPanel();
  renderAiWorkPanel();
  renderStagePanels();
  renderFlow();
  renderDetail();
  renderTaskSelectors();
  renderCurrentStep();
  renderNextStepPanel();
  renderTaskSummary();
  renderStepCapabilityPanel();
  renderSemanticArtifactsPanel();
  renderArtifacts();
  renderCheckpointPanel();
  renderAiAdjustPanel();
  renderRuns();
  syncPreviewVisibility();
  if (!document.body.dataset.navPage) {
    setActiveNavPage(state.status && state.status.isWorkspace ? 'workbench' : 'workspace');
  } else if (document.body.dataset.navPage === 'workbench' && !(state.status && state.status.isWorkspace)) {
    setActiveNavPage('workspace');
  } else if (!['workbench', 'artifacts'].includes(document.body.dataset.navPage)) {
    renderNavPage(document.body.dataset.navPage);
  }
}

function buildStarterPromptText() {
  const unit = getSelectedUnit();
  if (!unit || unit.id === 'workspace') {
    return '';
  }
  const step = getStep(state.selectedStepId);
  const actionPackage = stageActionPackage(unit, step);
  const agentContract = step ? agentContractForStep(step.id) : null;
  const writebacks = actionPackage.writebacks || [];
  const contractWritebacks = agentContract && Array.isArray(agentContract.outputs) && agentContract.outputs.length
    ? agentContract.outputs.map((item) => `- ${item}`).join('\n')
    : '';
  const writebackText = contractWritebacks || (writebacks.length
    ? writebacks.map((item) => `- ${item.path}：${item.label}`).join('\n')
    : '- 按当前阶段模板写回对应 Markdown 产物。');
  return [
    `# ${(agentContract && agentContract.name) || actionPackage.title} - AI 交接提示词`,
    '',
    '你将在当前 workspace 内推进本阶段交付。页面负责组装上下文和验收产物，AI 负责多轮推理、澄清和文件回写。',
    '',
    agentContract ? [
      '## 当前 Agent',
      `- 角色：${agentContract.name}`,
      `- 职责：${agentContract.role}`,
      `- 会话：${agentContract.session}`,
      '- 原则：用户可以在 AI 里多轮沟通，但结束时必须留下结构化文件。',
      '',
    ].join('\n') : '',
    '## 本阶段目标',
    actionPackage.summary,
    '',
    '## 三层边界',
    '1. Harness 内置规则：不可覆盖，负责流程边界、允许读写范围、人工确认点和回写要求。',
    '2. 团队能力：来自团队配置库的 rules、skills、templates、app-index，只能增强当前阶段。',
    '3. 用户补充：只补 PRD、业务上下文、技术定位和人工确认结论，不直接改系统工作流定义。',
    '',
    '## 执行方式',
    '1. 先读取 AGENTS.md、CLAUDE.md、.workflow/progress.md 和 .workflow/workspace.json。',
    '2. 按当前阶段命令文件执行，不修改本阶段禁止修改的内容，不跳过人工确认点。',
    '3. 与用户多轮澄清后，把结论写回 workspace 文件，聊天结论不算最终交付。',
    '4. 如果本阶段产物不满足用户要求，继续在同一个 AI 会话修正，直到产物可回到页面验收。',
    '5. 完成后执行 delivery-workflow done，并回到页面验收。',
    '',
    '## AI 需要回写',
    writebackText,
    '',
    '## 用户下一步',
    actionPackage.primaryAction === '先补充材料'
      ? '先点击“补充材料与上下文”导入 PRD、候选应用和技术线索，再交给 Agent 处理本阶段。'
      : '点击“交给 Agent 处理本阶段”，在 Codex / Claude 中继续对话。'
  ].join('\n');
}

function renderStarterPromptPreview() {
  if (!els.preview || !state.status || !state.status.isWorkspace) {
    return false;
  }
  const content = buildStarterPromptText();
  if (!content) {
    return false;
  }
  state.previewText = content;
  els.preview.value = content;
  els.previewMeta.textContent = '交接提示词：实际交给 AI 时会自动补充完整上下文';
  setPreviewState({ mode: 'prompt' });
  return true;
}

function renderArtifactEmptyPreview() {
  if (!els.preview || !state.status || !state.status.isWorkspace) {
    return false;
  }
  const unit = getSelectedUnit();
  const step = getStep(state.selectedStepId);
  const actionPackage = unit && unit.id !== 'workspace' ? stageActionPackage(unit, step) : null;
  const writebacks = actionPackage && Array.isArray(actionPackage.writebacks) ? actionPackage.writebacks : [];
  const expected = writebacks.length
    ? writebacks.map((item) => `- ${item.label}：${item.path}`).join('\n')
    : '- 当前阶段完成后会在这里展示 Markdown 产物。';
  state.previewText = '';
  els.preview.value = [
    '# 产物展示',
    '',
    '当前阶段还没有可展示的产物。',
    '',
    '完成右侧动作后，Agent 回写的文件会自动出现在这里。',
    '',
    '## 预期产物',
    expected,
  ].join('\n');
  els.previewMeta.textContent = '等待 Agent 回写产物';
  setPreviewState({ mode: 'prompt' });
  if (els.workbenchTitle) {
    els.workbenchTitle.textContent = '产物展示';
  }
  if (els.previewSourceLabel) {
    els.previewSourceLabel.textContent = '产物';
    els.previewSourceLabel.className = 'statePill';
  }
  return true;
}

function syncPreviewVisibility() {
  if (!els.previewBox) {
    return;
  }
  if (!String(els.preview.value || '').trim() && state.previewMode === 'empty') {
    renderArtifactEmptyPreview();
  }
  const hasPreviewContent = Boolean(String(els.preview.value || '').trim());
  const shouldHide = state.previewMode === 'empty' || !hasPreviewContent;
  els.previewBox.classList.toggle('hidden', shouldHide);
  if (els.previewPanel) {
    const hasWorkbenchContent = [
      els.previewBox,
      els.checkpointPanel,
      els.localStepPanel,
      els.aiAdjustPanel,
    ].some((item) => item && !item.classList.contains('hidden'));
    els.previewPanel.classList.toggle('hidden', !hasWorkbenchContent);
  }
}

async function chooseLocalDirectory(targetInput, options = {}) {
  if (!targetInput) {
    return;
  }
  const button = options.button;
  if (button) {
    setLoading(button, true, '选择中...');
  }
  try {
    const data = await api('/api/system/select-directory', {
      method: 'POST',
      timeoutMs: 120000,
      body: JSON.stringify({
        initialPath: targetInput.value.trim(),
        title: options.title || '选择目录',
      }),
    });
    if (!data || !data.path) {
      return;
    }
    targetInput.value = data.path;
    if (targetInput === els.workspaceRoot) {
      els.outputRoot.value = data.path;
    }
    await saveState();
    if (targetInput === els.outputRoot || targetInput === els.workspaceRoot) {
      await loadWorkspaces();
    }
    if (targetInput === els.workspacePath) {
      await refreshAll();
    }
  } finally {
    if (button) {
      setLoading(button, false);
    }
  }
}

async function chooseLocalFile(targetInput, options = {}) {
  if (!targetInput) {
    return;
  }
  const button = options.button;
  if (button) {
    setLoading(button, true, '选择中...');
  }
  try {
    const data = await api('/api/system/select-file', {
      method: 'POST',
      timeoutMs: 120000,
      body: JSON.stringify({
        initialPath: targetInput.value.trim(),
        title: options.title || '选择文件',
        filter: options.filter || 'All files (*.*)|*.*',
      }),
    });
    if (!data || !data.path) {
      return;
    }
    targetInput.value = data.path;
    await saveState();
  } finally {
    if (button) {
      setLoading(button, false);
    }
  }
}

function pathBaseName(value) {
  return String(value || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'item';
}

function compactPathLabel(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  const normalized = text.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return normalized;
  }
  const parent = parts.length > 1 ? parts[parts.length - 2] : '';
  const current = parts[parts.length - 1];
  return parent ? `${parent}/${current}` : current;
}

function appendTextareaLine(textarea, value) {
  if (!textarea || !value) {
    return;
  }
  const current = textarea.value.trim();
  textarea.value = current ? `${current}\n${value}` : value;
}

function renderAvailableApps() {
  if (!els.availableApps) {
    return;
  }
  const apps = state.availableApps || [];
  els.availableApps.innerHTML = [
    '<option value="">从应用索引选择应用</option>',
    ...(apps.length
      ? apps.map((app) => {
      const source = app.source === 'app-index'
        ? '索引'
        : app.source === 'team-config'
          ? '团队'
          : app.source === 'repo-root'
            ? '根目录'
            : '本机';
      const label = `${app.name} / ${source} / ${app.path || '未解析路径'}`;
      return `<option value="${escapeHtml(app.name)}">${escapeHtml(label)}</option>`;
      })
      : ['<option value="">未发现应用，请检查业务代码根目录或配置 app-index.json</option>']),
  ].join('');
}

async function loadAvailableApps() {
  if (!els.availableApps) {
    return;
  }
  const data = await api('/api/apps/available');
  state.availableApps = data.apps || [];
  renderAvailableApps();
}

function renderWhitepaperContext(context = {}) {
  if (!els.whitepaperContextPanel) {
    return;
  }
  const primary = context.primaryFunction;
  if (!primary) {
    els.whitepaperContextPanel.classList.add('hidden');
    els.whitepaperContextPanel.innerHTML = '';
    return;
  }
  const localApps = (context.applications || []).filter((item) => item.sourceState === 'local');
  const remoteApps = (context.applications || []).filter((item) => item.sourceState !== 'local');
  els.whitepaperContextPanel.classList.remove('hidden');
  els.whitepaperContextPanel.innerHTML = [
    '<strong>已加载本次白皮书上下文</strong>',
    `<span>功能点：${escapeHtml(primary.name)}${primary.id ? ` (${escapeHtml(primary.id)})` : ''}</span>`,
    context.whitepaperRefs && context.whitepaperRefs.length ? `<span>白皮书：${escapeHtml(context.whitepaperRefs.join('、'))}</span>` : '',
    context.riskTags && context.riskTags.length ? `<span>风险：${escapeHtml(context.riskTags.join('、'))}</span>` : '',
    localApps.length ? `<span>已定位本地应用：${escapeHtml(localApps.map((item) => item.name).join('、'))}</span>` : '',
    remoteApps.length ? `<span>待获取代码：${escapeHtml(remoteApps.map((item) => item.name).join('、'))}</span>` : '',
    ...remoteApps.map((item) => `<button type="button" data-fetch-whitepaper-app="${escapeHtml(item.id)}">获取 ${escapeHtml(item.name)} 代码</button>`),
  ].filter(Boolean).join('');
  els.whitepaperContextPanel.querySelectorAll('[data-fetch-whitepaper-app]').forEach((button) => {
    button.addEventListener('click', () => fetchWhitepaperApplication(button.dataset.fetchWhitepaperApp).catch((error) => setMessage(error.message, 'error')));
  });
}

function domainHarnessContext() {
  const config = state.status && state.status.config ? state.status.config : {};
  return config.domainContext && config.domainContext.root
    ? { ...config.domainContext, ...(config.domain || {}) }
    : (config.domain || {});
}

function renderDomainHarnessPanel() {
  if (!els.domainHarnessPanel) {
    return;
  }
  const domain = domainHarnessContext();
  const inspection = state.domainHarnessInspection || null;
  const inputRoot = els.domainHarnessRoot ? els.domainHarnessRoot.value.trim() : '';
  const attached = Boolean(domain.root);
  const inspectedCurrentRoot = inspection && inspection.root
    && inputRoot
    && inspection.root.toLowerCase() === inputRoot.toLowerCase();
  if (els.domainHarnessRoot && attached && document.activeElement !== els.domainHarnessRoot) {
    els.domainHarnessRoot.value = domain.root;
  }
  if (els.attachDomainHarnessBtn) {
    els.attachDomainHarnessBtn.disabled = !(state.status && state.status.isWorkspace);
  }
  if (attached) {
    const repositories = domain.codeRepositories || [];
    const availableCode = repositories.filter((item) => item.sourceExists).map((item) => item.name);
    els.domainHarnessPanel.classList.remove('hidden');
    els.domainHarnessPanel.innerHTML = [
      `<strong>已挂载：${escapeHtml(domain.name || domain.id || '领域 Harness')}</strong>`,
      `<span>目录：${escapeHtml(domain.root)}</span>`,
      domain.revision ? `<span>版本：${escapeHtml(domain.revision)}</span>` : '',
      `<span>Catalog ${escapeHtml(String((domain.catalogDocuments || []).length))} · 领域文档 ${escapeHtml(String((domain.productDocuments || []).length))} · 领域记忆 ${escapeHtml(String((domain.memoryDocuments || []).length))} · Rules ${escapeHtml(String((domain.rules || []).length))} · Skills ${escapeHtml(String((domain.skills || []).length))}</span>`,
      repositories.length ? `<span>候选代码仓：${escapeHtml(repositories.map((item) => item.name).join('、'))}</span>` : '',
      availableCode.length ? `<span>本地可读代码：${escapeHtml(availableCode.join('、'))}</span>` : '<span>候选代码仓尚未就绪；方案阶段会保留为待确认入口。</span>',
      '<span>已生成 `context/domain-summary.md`，Agent 会按摘要读取。</span>',
    ].filter(Boolean).join('');
    return;
  }
  if (inspectedCurrentRoot) {
    els.domainHarnessPanel.classList.remove('hidden');
    if (!inspection.available) {
      els.domainHarnessPanel.innerHTML = `<strong>不能挂载</strong><span>${escapeHtml(inspection.reason || '目录不是有效领域 Harness')}</span>`;
      return;
    }
    els.domainHarnessPanel.innerHTML = [
      `<strong>可挂载：${escapeHtml((inspection.manifest && inspection.manifest.name) || '领域 Harness')}</strong>`,
      `<span>Catalog ${escapeHtml(String((inspection.catalogDocuments || []).length))} · 领域文档 ${escapeHtml(String((inspection.productDocuments || []).length))} · 领域记忆 ${escapeHtml(String((inspection.memoryDocuments || []).length))} · 代码仓 ${escapeHtml(String((inspection.codeRepositories || []).length))}</span>`,
      inspection.graph && inspection.graph.exists ? '<span>已发现 Graphify 图谱。</span>' : '<span>未发现 Graphify 图谱，不影响挂载。</span>',
      inspection.missing && inspection.missing.length ? `<span>缺口：${escapeHtml(inspection.missing.join('；'))}</span>` : '',
    ].filter(Boolean).join('');
    return;
  }
  els.domainHarnessPanel.classList.add('hidden');
  els.domainHarnessPanel.innerHTML = '';
}

async function inspectDomainHarness() {
  const root = els.domainHarnessRoot ? els.domainHarnessRoot.value.trim() : '';
  if (!root) {
    throw new Error('请先选择领域 Harness 目录');
  }
  setLoading(els.inspectDomainHarnessBtn, true, '检测中...');
  try {
    state.domainHarnessInspection = await api(`/api/domain-harness/inspect?root=${encodeURIComponent(root)}`);
    renderDomainHarnessPanel();
    if (!state.domainHarnessInspection.available) {
      throw new Error(state.domainHarnessInspection.reason || '当前目录不是可挂载的领域 Harness');
    }
    setMessage(`领域 Harness 可挂载：${state.domainHarnessInspection.manifest.name}`);
  } finally {
    setLoading(els.inspectDomainHarnessBtn, false);
  }
}

async function attachDomainHarness() {
  const workspacePath = els.workspacePath.value.trim();
  const domainRoot = els.domainHarnessRoot ? els.domainHarnessRoot.value.trim() : '';
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  if (!domainRoot) {
    throw new Error('请先选择领域 Harness 目录');
  }
  setLoading(els.attachDomainHarnessBtn, true, '挂载中...');
  try {
    const data = await api('/api/workspace/domain-context', {
      method: 'POST',
      body: JSON.stringify({ workspacePath, domainRoot }),
    });
    state.domainHarnessInspection = data.context || null;
    await loadStatus();
    setMessage(`已挂载领域 Harness：${data.context && data.context.manifest ? data.context.manifest.name : domainRoot}`);
  } finally {
    setLoading(els.attachDomainHarnessBtn, false);
  }
}

function renderWhitepaperCandidates(data = {}) {
  if (!els.functionCandidates) {
    return;
  }
  state.whitepaperCatalog = data;
  if (!data.available) {
    els.functionCandidates.innerHTML = `<span class="emptyAppTags">${escapeHtml(data.reason || '请先在全局配置中选择白皮书 Git 目录')}</span>`;
    return;
  }
  const functions = data.functions || [];
  els.functionCandidates.innerHTML = functions.length
    ? functions.map((item) => [
      `<button type="button" class="selectedAppTag" data-function-id="${escapeHtml(item.id)}">`,
      `<strong>${escapeHtml(item.name)}</strong>`,
      `<small>${escapeHtml(item.domain || item.id)}</small>`,
      '</button>',
    ].join('')).join('')
    : '<span class="emptyAppTags">未匹配到功能点，请换一个业务关键词。</span>';
  els.functionCandidates.querySelectorAll('[data-function-id]').forEach((button) => {
    button.addEventListener('click', () => resolveWhitepaperFunction(button.dataset.functionId).catch((error) => setMessage(error.message, 'error')));
  });
}

async function loadWhitepaperCatalog(query = '') {
  if (!els.functionCandidates) {
    return;
  }
  const data = await api(`/api/whitepaper/catalog?query=${encodeURIComponent(query)}`);
  renderWhitepaperCandidates(data);
  const context = state.status && state.status.config ? state.status.config.whitepaperContext : null;
  renderWhitepaperContext(context || {});
}

async function resolveWhitepaperFunction(functionId) {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  const data = await api('/api/workspace/whitepaper-context', {
    method: 'POST',
    body: JSON.stringify({ workspacePath, primaryFunctionId: functionId }),
  });
  configToText(data.config || {});
  if (els.functionQuery) {
    els.functionQuery.value = data.context && data.context.primaryFunction ? data.context.primaryFunction.name : '';
  }
  renderWhitepaperContext(data.context || {});
  await loadStatus();
  setMessage('已固化功能点、白皮书版本和应用上下文；Agent 将按本次快照执行。');
}

async function fetchWhitepaperApplication(appId) {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  if (!window.confirm('将按白皮书中的 Git 地址拉取代码到本机缓存目录。不会覆盖已有目录或执行 git pull，是否继续？')) {
    return;
  }
  const data = await api('/api/workspace/app-source/fetch', {
    method: 'POST',
    body: JSON.stringify({ workspacePath, appId, confirm: true }),
    timeoutMs: 120000,
  });
  configToText(data.config || {});
  renderWhitepaperContext(data.context || {});
  await loadStatus();
  setMessage(`已${data.status === 'cloned' ? '拉取' : '复用'}本地代码：${data.sourcePath || ''}`);
}

function addSelectedAvailableApps() {
  if (!els.availableApps || !state.availableApps.length) {
    return;
  }
  const selectedNames = [els.availableApps.value].filter(Boolean);
  const selectedApps = state.availableApps.filter((app) => selectedNames.includes(app.name));
  const existing = new Set(parseAppPaths(els.appPaths.value).map((app) => app.name.toLowerCase()));
  for (const app of selectedApps) {
    if (existing.has(app.name.toLowerCase())) {
      continue;
    }
    appendTextareaLine(els.appPaths, `${app.name}=${app.path || ''}`);
    existing.add(app.name.toLowerCase());
  }
  els.availableApps.value = '';
  renderSelectedAppTags();
}

function setSelectedApps(apps) {
  els.appPaths.value = apps
    .map((item) => `${item.name || ''}${item.name ? '=' : ''}${item.path || ''}`)
    .join('\n');
  renderSelectedAppTags();
}

function renderSelectedAppTags() {
  if (!els.selectedAppTags || !els.appPaths) {
    return;
  }
  const apps = parseAppPaths(els.appPaths.value);
  els.selectedAppTags.innerHTML = apps.length
    ? apps.map((app) => [
      `<span class="selectedAppTag" title="${escapeHtml(app.path || '')}">`,
      `<strong>${escapeHtml(app.name || pathBaseName(app.path))}</strong>`,
      app.path ? `<small>${escapeHtml(compactPathLabel(app.path))}</small>` : '',
      `<button type="button" data-remove-app="${escapeHtml(app.name || app.path)}">移除</button>`,
      '</span>',
    ].join('')).join('')
    : '<span class="emptyAppTags">还没有选择候选应用</span>';
  els.selectedAppTags.querySelectorAll('[data-remove-app]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.removeApp;
      const next = parseAppPaths(els.appPaths.value).filter((app) => (app.name || app.path) !== key);
      setSelectedApps(next);
    });
  });
}

async function appendPickedPath(textarea, options = {}) {
  const button = options.button;
  if (button) {
    setLoading(button, true, options.kind === 'file' ? '选择中...' : '选择中...');
  }
  try {
    const endpoint = options.kind === 'file' ? '/api/system/select-file' : '/api/system/select-directory';
    const data = await api(endpoint, {
      method: 'POST',
      timeoutMs: 120000,
      body: JSON.stringify({
        title: options.title || (options.kind === 'file' ? '选择文件' : '选择目录'),
        filter: options.filter || 'All files (*.*)|*.*',
      }),
    });
    if (!data || !data.path) {
      return;
    }
    const line = options.named ? `${pathBaseName(data.path)}=${data.path}` : data.path;
    appendTextareaLine(textarea, line);
    if (textarea === els.appPaths) {
      renderSelectedAppTags();
    }
    await saveState();
  } finally {
    if (button) {
      setLoading(button, false);
    }
  }
}

async function useWorkspace() {
  const selected = els.workspaceList.value;
  if (selected) {
    els.workspacePath.value = selected;
  }
  await saveState();
  await loadStatus();
  setMessage('Workspace 已切换。');
}

async function useSidebarWorkspace(workspacePath) {
  if (!workspacePath) {
    return;
  }
  els.workspacePath.value = workspacePath;
  await saveState();
  await loadStatus();
  setMessage('Workspace 已切换。');
}

async function clearWorkspaceSelection() {
  els.workspacePath.value = '';
  state.status = null;
  await saveState({ workspacePath: '' });
  render();
  setMessage('已返回工作区入口。原目录不会被删除，可以重新创建或打开其他工作区。');
}

async function openDeliveryConfig() {
  if (!els.setupGuidePanel) {
    return;
  }
  els.setupGuidePanel.open = true;
  els.setupGuidePanel.classList.add('modalOpen');
  setActiveConfigDomain('startup');
  loadAvailableApps().catch((error) => setMessage(error.message, 'error'));
}

function closeDeliveryConfig() {
  if (!els.setupGuidePanel) {
    return;
  }
  els.setupGuidePanel.classList.remove('modalOpen');
  els.setupGuidePanel.open = false;
}

function openStageMaterials() {
  if (!els.stageMaterialsModal) {
    return;
  }
  els.stageMaterialsModal.open = true;
  els.stageMaterialsModal.classList.add('modalOpen');
  renderSelectedAppTags();
  loadAvailableApps().catch((error) => setMessage(error.message, 'error'));
  loadWhitepaperCatalog(els.functionQuery ? els.functionQuery.value : '').catch((error) => setMessage(error.message, 'error'));
  ensureKnownFactsLoaded().catch((error) => setMessage(error.message, 'error'));
}

function closeStageMaterials() {
  if (!els.stageMaterialsModal) {
    return;
  }
  els.stageMaterialsModal.classList.remove('modalOpen');
  els.stageMaterialsModal.open = false;
}

async function goNextRecommendation() {
  const recommendation = state.status && state.status.nextRecommendation;
  const fallbackStepId = state.selectedStepId || (getSelectedUnit() && getSelectedUnit().steps && getSelectedUnit().steps[0]);
  if (!recommendation && !fallbackStepId) {
    return;
  }
  if (recommendation && recommendation.unitId) {
    state.selectedUnitId = recommendation.unitId;
  }
  await saveState({ selectedUnitId: state.selectedUnitId });
  const stepId = recommendation && recommendation.stepId ? recommendation.stepId : fallbackStepId;
  selectStep(stepId);
  setMessage(`已定位到：${recommendation && recommendation.title ? recommendation.title : stepId}`);
}

async function uploadPrd() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  if (!els.prdFiles.files.length) {
    throw new Error('请选择要上传的 PRD 文件');
  }

  setLoading(els.uploadPrdBtn, true, '上传中...');
  try {
    const form = new FormData();
    form.append('workspacePath', workspacePath);
    form.append('targetSubdir', getPrdTarget());
    Array.from(els.prdFiles.files).forEach((file) => form.append('files', file));
    const data = await api('/api/workspace/upload-prd', { method: 'POST', body: form });
    await loadStatus();
    setMessage(`已导入 ${data.imported.length} 个文件。`);
  } finally {
    setLoading(els.uploadPrdBtn, false);
  }
}

async function copyLocalPrd() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  const sourcePaths = parseLines(els.localPrdPaths.value);
  if (!sourcePaths.length) {
    throw new Error('请填写本机文件或目录路径');
  }
  setLoading(els.copyLocalPrdBtn, true, '复制中...');
  try {
    const data = await api('/api/workspace/import-local-prd', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        sourcePaths,
        targetSubdir: getPrdTarget(),
      }),
    });
    await loadStatus();
    setMessage(`已复制 ${data.imported.length} 个路径。`);
  } finally {
    setLoading(els.copyLocalPrdBtn, false);
  }
}

async function saveConfig() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  setLoading(els.saveConfigBtn, true, '保存中...');
  try {
    await api('/api/workspace/config', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        appPaths: parseAppPaths(els.appPaths.value),
        knowledge: parseKnowledgePaths(els.knowledgePaths ? els.knowledgePaths.value : ''),
        skills: els.workspaceSkills ? parseLines(els.workspaceSkills.value) : [],
        rules: els.workspaceRules ? parseLines(els.workspaceRules.value) : [],
        branchPattern: els.branchPattern ? els.branchPattern.value.trim() : '',
        feishuDocs: parseLines(els.feishuDocs.value),
        loadAppContextForClarification: Boolean(els.loadAppContextForClarification && els.loadAppContextForClarification.checked),
        notes: els.notes.value,
      }),
    });
    await loadStatus();
    setMessage('配置已保存到 .workflow/workspace.json。');
  } finally {
    setLoading(els.saveConfigBtn, false);
  }
}

async function importFeishuPrdToLocal(options = {}) {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  const links = parseLines(els.feishuDocs.value);
  if (!links.length) {
    throw new Error('请先填写飞书文档链接');
  }
  const button = options.button || els.importFeishuPrdBtn;
  if (button) {
    setLoading(button, true, '读取中...');
  }
  if (els.feishuImportStatus) {
    els.feishuImportStatus.textContent = '正在读取飞书文档并转换为本地 PRD...';
  }
  const shouldShowResult = options.showResult !== false;
  try {
    await api('/api/workspace/config', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        appPaths: parseAppPaths(els.appPaths.value),
        knowledge: parseKnowledgePaths(els.knowledgePaths ? els.knowledgePaths.value : ''),
        skills: els.workspaceSkills ? parseLines(els.workspaceSkills.value) : [],
        rules: els.workspaceRules ? parseLines(els.workspaceRules.value) : [],
        branchPattern: els.branchPattern ? els.branchPattern.value.trim() : '',
        feishuDocs: links,
        loadAppContextForClarification: Boolean(els.loadAppContextForClarification && els.loadAppContextForClarification.checked),
        notes: els.notes.value,
      }),
    });
    const data = await api('/api/workspace/import-feishu-prd', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        links,
      }),
      timeoutMs: 90000,
    });
    const imported = data.imported || [];
    const failed = data.failed || [];
    await loadStatus();
    if (imported.length) {
      const message = `已读取 ${imported.length} 个飞书文档到本地：${data.documentPath || 'prd/document.md'}`;
      if (els.feishuImportStatus) {
        els.feishuImportStatus.textContent = message;
      }
      setMessage(`${message}${failed.length ? `；失败 ${failed.length} 个` : ''}`);
      if (shouldShowResult) {
        showSyncResult({
          title: '已同步到本地',
          body: `已读取 ${imported.length} 个飞书文档，后续 Agent 会优先使用本地 PRD Markdown。`,
          paths: [
            data.documentPath || 'prd/document.md',
            data.sourcePath || 'prd/source-feishu.json',
          ],
        });
      }
    } else {
      const errorText = failed[0] && failed[0].error ? failed[0].error : '未能读取飞书文档';
      if (els.feishuImportStatus) {
        els.feishuImportStatus.textContent = `读取失败：${errorText}`;
      }
      throw new Error(`飞书读取失败：${errorText}`);
    }
    return data;
  } catch (error) {
    if (els.feishuImportStatus) {
      els.feishuImportStatus.textContent = `读取失败：${error.message}`;
    }
    if (shouldShowResult) {
      showSyncResult({
        type: 'error',
        title: '同步失败',
        body: error.message,
      });
    }
    throw error;
  } finally {
    if (button) {
      setLoading(button, false);
    }
  }
}

async function saveMaterialsAndContext() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  setLoading(els.saveInputsBtn, true, '保存中...');
  try {
    await api('/api/workspace/config', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        appPaths: parseAppPaths(els.appPaths.value),
        knowledge: parseKnowledgePaths(els.knowledgePaths ? els.knowledgePaths.value : ''),
        skills: els.workspaceSkills ? parseLines(els.workspaceSkills.value) : [],
        rules: els.workspaceRules ? parseLines(els.workspaceRules.value) : [],
        branchPattern: els.branchPattern ? els.branchPattern.value.trim() : '',
        feishuDocs: parseLines(els.feishuDocs.value),
        loadAppContextForClarification: Boolean(els.loadAppContextForClarification && els.loadAppContextForClarification.checked),
        notes: els.notes.value,
      }),
    });

    const imported = [];
    if (els.prdFiles.files.length) {
      const form = new FormData();
      form.append('workspacePath', workspacePath);
      form.append('targetSubdir', getPrdTarget());
      Array.from(els.prdFiles.files).forEach((file) => form.append('files', file));
      const data = await api('/api/workspace/upload-prd', { method: 'POST', body: form });
      imported.push(...data.imported);
    }

    const sourcePaths = els.localPrdPaths ? parseLines(els.localPrdPaths.value) : [];
    if (sourcePaths.length) {
      const data = await api('/api/workspace/import-local-prd', {
        method: 'POST',
        body: JSON.stringify({
          workspacePath,
          sourcePaths,
          targetSubdir: getPrdTarget(),
        }),
      });
      imported.push(...data.imported);
    }

    const feishuLinks = parseLines(els.feishuDocs.value);
    let feishuFailedCount = 0;
    if (feishuLinks.length) {
      const data = await importFeishuPrdToLocal({ button: null, showResult: false });
      imported.push(...(data.imported || []).map((item) => item.url || item.token || 'feishu'));
      feishuFailedCount = Array.isArray(data.failed) ? data.failed.length : 0;
    }

    await loadStatus();
    closeStageMaterials();
    if (imported.length) {
      setMessage(`已保存本次需求材料，并导入 ${imported.length} 个 PRD 来源${feishuFailedCount ? `；飞书失败 ${feishuFailedCount} 个` : ''}。`);
    } else {
      setMessage(feishuFailedCount
        ? `已保存本次需求材料。飞书读取失败 ${feishuFailedCount} 个，请检查授权或先上传本地 PRD。`
        : '已保存本次需求材料。外部链接和上下文已记录。');
    }
  } finally {
    setLoading(els.saveInputsBtn, false);
  }
}

async function loadKnownFacts() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    return;
  }
  const data = await api(`/api/workspace/known-facts?workspacePath=${encodeURIComponent(workspacePath)}`);
  els.knownFacts.value = normalizeKnownFactsForEditing(data.content || '');
  renderKnownFactsPreview();
  els.knownFactsState.textContent = data.exists ? '已保存' : '未保存';
  els.knownFactsState.className = `badge ${data.exists ? 'done' : 'waiting'}`;
  state.knownFactsLoadedFor = workspacePath;
}

async function ensureKnownFactsLoaded() {
  if (state.selectedUnitId !== 'prd-to-design') {
    return;
  }
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath || state.knownFactsLoadedFor === workspacePath) {
    return;
  }
  await loadKnownFacts();
}

async function saveKnownFacts() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  setLoading(els.saveKnownFactsBtn, true, '保存中...');
  try {
    const data = await api('/api/workspace/known-facts', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        content: els.knownFacts.value,
      }),
    });
    await loadStatus();
    els.knownFactsState.textContent = '已保存';
    els.knownFactsState.className = 'badge done';
    renderKnownFactsPreview();
    state.knownFactsLoadedFor = workspacePath;
    setMessage(`已保存补充材料到 ${data.path}`);
  } finally {
    setLoading(els.saveKnownFactsBtn, false);
  }
}

function renderKnownFactsPreview() {
  if (!els.knownFactsPreview) {
    return;
  }
  const content = els.knownFacts.value.trim();
  els.knownFactsPreview.innerHTML = content
    ? renderSimpleMarkdown(content)
    : '<p class="emptyPreview">暂无补充内容。</p>';
}

function setKnownFactsMode(mode) {
  const isPreview = mode === 'preview';
  renderKnownFactsPreview();
  els.knownFacts.classList.toggle('hidden', isPreview);
  els.knownFactsPreview.classList.toggle('hidden', !isPreview);
  els.knownFactsEditTab.classList.toggle('active', !isPreview);
  els.knownFactsPreviewTab.classList.toggle('active', isPreview);
}

function markKnownFactsDirty() {
  if (!els.knownFactsState) {
    return;
  }
  els.knownFactsState.textContent = '未保存';
  els.knownFactsState.className = 'badge waiting';
}

async function previewKnownFacts() {
  await saveKnownFacts();
  const workspacePath = els.workspacePath.value.trim();
  const data = await api(`/api/file?workspacePath=${encodeURIComponent(workspacePath)}&path=${encodeURIComponent('design/known-facts.md')}`);
  state.previewText = data.content;
  els.preview.value = data.content;
  els.previewMeta.textContent = '产物预览：design/known-facts.md';
  setPreviewState({ mode: 'file', path: 'design/known-facts.md' });
}

function appendLineIfMissing(textarea, value) {
  const lines = parseLines(textarea.value);
  if (!lines.some((line) => line.toLowerCase() === value.toLowerCase())) {
    lines.push(value);
  }
  textarea.value = lines.join('\n');
}

function addGlobalPrdWordSkill() {
  const root = (state.tools && state.tools.defaultSkillsRoot) || els.defaultSkillsRoot.value.trim() || 'C:\\code\\team-ai-config\\skills\\common';
  const skillPath = `${root.replace(/[\\\/]+$/, '')}\\prd-word-to-md`;
  appendLineIfMissing(
    els.globalSkills,
    skillPath
  );
  if (!els.globalNotes.value.trim()) {
    els.globalNotes.value = '如当前任务涉及 Word PRD 转 Markdown，优先使用 Word PRD 转 MD skill，输出到 workspace 的 prd/ 目录，并保留图片、表格、附件和 metadata。';
  }
  setMessage('已加入团队 skills。保存团队 / 需求配置后，后续 workspace 会默认带上。');
}

async function showPrompt() {
  await previewPrompt({ scroll: true });
}

function normalizeKnownFactsForEditing(content) {
  const value = String(content || '').trim();
  if (!value) {
    return '';
  }
  const isOldTemplate = value.includes('# 技术方案生成输入')
    && value.includes('## 1. 建议涉及应用')
    && value.includes('- 应用名：')
    && value.includes('## 2. 建议代码入口');
  return isOldTemplate ? '' : value;
}

async function previewPrompt(options = {}) {
  const workspacePath = els.workspacePath.value.trim();
  const stepId = state.selectedStepId;
  if (!stepId) {
    if (options.silent) return false;
    throw new Error('请先选择步骤');
  }
  const step = getStep(stepId);
  if (!step || step.kind !== 'agent') {
    if (options.silent) return false;
    throw new Error('只有 AI 执行步骤才有 AI 提示词');
  }
  if (stepId === '06-implement-task' && !/^T\d{3}$/i.test(els.taskId.value.trim())) {
    if (options.silent) return false;
    throw new Error('06 单任务实现必须先填写任务编号，例如 T001');
  }
  const data = await api(
    `/api/prompt?workspacePath=${encodeURIComponent(workspacePath)}&stepId=${encodeURIComponent(stepId)}&taskId=${encodeURIComponent(els.taskId.value.trim())}`
  );
  state.previewText = data.prompt;
  els.preview.value = data.prompt;
  els.previewMeta.textContent = `步骤提示词：${getStep(stepId).title || stepId} / 可临时编辑后复制`;
  setPreviewState({ mode: 'prompt' });
  if (options.scroll && els.previewBox) {
    els.previewBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return true;
}

async function openAgentCli(agent) {
  const workspacePath = els.workspacePath.value.trim();
  const stepId = state.selectedStepId;
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  if (!stepId) {
    throw new Error('请先选择步骤');
  }
  const step = getStep(stepId);
  if (!step || step.kind !== 'agent') {
    throw new Error('当前步骤不需要交给 Codex / Claude');
  }
  if (step.blocked) {
    throw new Error('当前步骤还有前置确认未完成');
  }
  assertCurrentStageReadyForAgent();
  if (stepId === '06-implement-task' && !/^T\d{3}$/i.test(els.taskId.value.trim())) {
    throw new Error('06 单任务实现必须先填写任务编号，例如 T001');
  }
  const button = agent === 'claude' ? els.openClaudeCliBtn : els.openCodexCliBtn;
  setLoading(button, true, '打开中...');
  try {
    const data = await api('/api/agent/open-cli', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        stepId,
        taskId: els.taskId.value.trim(),
        agent,
      }),
    });
    state.previewText = data.prompt || '';
    els.preview.value = data.prompt || `已生成 handoff：${data.handoffFile}`;
    els.previewMeta.textContent = `${agent === 'claude' ? 'Claude Code' : 'Codex'} handoff：${data.handoffFile}`;
    setPreviewState({ mode: 'prompt' });
    const agentLabel = agent === 'claude' ? 'Claude' : 'Codex';
    const sessionAction = data.resumed ? '已恢复' : '已建立';
    if (els.handoffStatus) {
      els.handoffStatus.textContent = `${sessionAction} ${agentLabel} 会话：${data.session && data.session.sessionName ? data.session.sessionName : data.handoffFile}`;
    }
    state.activeHandoff = {
      stepId: data.stepId,
      returnStepId: data.returnStepId || data.stepId,
      agent,
      handoffFile: data.handoffFile,
      doneFile: data.doneFile,
      sessionName: data.session && data.session.sessionName ? data.session.sessionName : '',
      resumed: Boolean(data.resumed),
    };
    startHandoffPolling();
    renderAiWorkPanel();
    await loadStatus();
    setMessage(`${sessionAction} ${agentLabel} 会话，并生成 ${data.handoffFile}。AI 完成后执行 delivery-workflow done，再回到页面验收。`);
  } finally {
    setLoading(button, false);
  }
}

async function runPrimaryStageAction() {
  if (getHandoffDonePayload()) {
    await goReviewStepFromHandoff();
    return;
  }
  await openAgentCli('codex');
}

function stopHandoffPolling() {
  if (state.handoffPollTimer) {
    clearInterval(state.handoffPollTimer);
    state.handoffPollTimer = null;
  }
}

function startHandoffPolling() {
  stopHandoffPolling();
  state.handoffPollTimer = setInterval(() => {
    refreshHandoffReview(false).catch((error) => {
      stopHandoffPolling();
      setMessage(error.message, 'error');
    });
  }, 4000);
}

async function refreshHandoffReview(showMessage = true) {
  const wasDone = Boolean(state.status && state.status.handoffState && state.status.handoffState.done);
  await loadStatus();
  const handoffState = state.status && state.status.handoffState ? state.status.handoffState : null;
  const isDone = Boolean(handoffState && handoffState.done);
  if (isDone) {
    stopHandoffPolling();
    if (!wasDone || showMessage) {
      setMessage('已检测到 AI 完成标记，可以进入验收。');
    }
  } else if (showMessage) {
    setMessage('已刷新 workspace 状态，暂未检测到 AI 完成标记。');
  }
}

async function goReviewStepFromHandoff() {
  const donePayload = state.status && state.status.handoffState ? state.status.handoffState.donePayload : null;
  const targetStep = (donePayload && (donePayload.returnStepId || donePayload.stepId)) ||
    (state.activeHandoff && (state.activeHandoff.returnStepId || state.activeHandoff.stepId));
  if (!targetStep) {
    throw new Error('暂无可进入的验收步骤');
  }
  state.selectedUnitId = unitIdForStep(targetStep) || state.selectedUnitId;
  await saveState({ selectedUnitId: state.selectedUnitId });
  selectStep(targetStep);
  setMessage(`已进入验收步骤：${targetStep}`);
}

async function openWorkspaceFolder(button = els.openWorkspaceFolderBtn) {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  setLoading(button, true, '打开中...');
  try {
    const data = await api('/api/workspace/open-folder', {
      method: 'POST',
      body: JSON.stringify({ workspacePath }),
    });
    setMessage(`已打开 workspace：${data.targetPath}`);
  } finally {
    setLoading(button, false);
  }
}

async function openCommandTemplate() {
  const workspacePath = els.workspacePath.value.trim();
  const stepId = state.selectedStepId;
  const step = getStep(stepId);
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  if (!step || !step.commandFile) {
    throw new Error('当前步骤没有可编辑的提示词模板');
  }
  const data = await api(`/api/command-template?workspacePath=${encodeURIComponent(workspacePath)}&stepId=${encodeURIComponent(stepId)}`);
  state.previewText = data.content || '';
  els.preview.value = data.content || '';
  els.previewMeta.textContent = `步骤模板：${data.path}${data.customized ? ' / 已自定义' : ' / 默认内容'}`;
  setPreviewState({ mode: 'file', path: data.path, editable: true });
  setMessage('正在编辑当前步骤模板。保存后，后续生成提示词和运行 AI 都会使用这份模板。');
}

async function resetCommandTemplate() {
  const workspacePath = els.workspacePath.value.trim();
  const stepId = state.selectedStepId;
  const step = getStep(stepId);
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  if (!step || !step.commandFile) {
    throw new Error('当前步骤没有可恢复的提示词模板');
  }
  setLoading(els.resetTemplateBtn, true, '恢复中...');
  try {
    const data = await api('/api/command-template/reset', {
      method: 'POST',
      body: JSON.stringify({ workspacePath, stepId }),
    });
    await loadStatus();
    const fileData = await api(`/api/file?workspacePath=${encodeURIComponent(workspacePath)}&path=${encodeURIComponent(data.path)}`);
    state.previewText = fileData.content || '';
    els.preview.value = fileData.content || '';
    els.previewMeta.textContent = `步骤模板：${data.path} / 已恢复默认`;
    setPreviewState({ mode: 'file', path: data.path, editable: true });
    setMessage(`已恢复脚手架默认模板：${data.path}`);
  } finally {
    setLoading(els.resetTemplateBtn, false);
  }
}

async function copyText(text) {
  if (!text) {
    throw new Error('没有可复制内容');
  }
  await navigator.clipboard.writeText(text);
  setMessage('已复制到剪贴板。');
}

async function boot() {
  try {
    resetButtonLabels();
    await loadDefinition();
    await loadState();
    await applyUrlOverrides();
    await loadToolsConfig();
    await loadAvailableApps();
    await refreshAll();
    await ensureKnownFactsLoaded();
    resetButtonLabels();
  } catch (error) {
    console.warn('Delivery Workflow startup warning:', error);
    setMessage('');
    render();
  }
}

function stageMetaText(unit) {
  if (!unit || !unit.id) {
    return '阶段推进';
  }
  if (unit.status === 'done') {
    return '已完成';
  }
  if (unit.status === 'blocked') {
    return '需处理';
  }
  const labels = {
    'prd-to-design': 'AI 工作包',
    'design-to-code': '确认后实施',
    'quality-gate': '检查与修复',
    'release-and-archive': '归档闭环',
  };
  return labels[unit.id] || '阶段推进';
}

window.DWAppDomains = {
  renderSelectedAppTags,
  renderToolsConfig,
  render,
  getStep,
  getCurrentArtifactPath,
  renderLocalStepPanel,
  setPreviewState,
  loadRuns,
  loadStatus,
  openArtifact,
  renderRuns,
  previewPrompt,
  renderStarterPromptPreview,
  renderArtifactEmptyPreview,
  configToText,
  ensureSelectedStepInUnit,
  focusNextActionAfterWorkspaceInit,
  ensureKnownFactsLoaded,
  autoPreviewSelectedStep,
};

setupConfigCenterLayout();

els.initBtn.addEventListener('click', () => initWorkspace().catch((error) => setMessage(error.message, 'error')));
if (els.chooseOutputRootBtn) {
  els.chooseOutputRootBtn.addEventListener('click', () => chooseLocalDirectory(els.outputRoot, {
    button: els.chooseOutputRootBtn,
    title: '选择工作区父目录',
  }).catch((error) => setMessage(error.message, 'error')));
}
if (els.chooseInitDomainRootBtn) {
  els.chooseInitDomainRootBtn.addEventListener('click', () => chooseLocalDirectory(els.initDomainRoot, {
    button: els.chooseInitDomainRootBtn,
    title: '选择领域 Harness 目录',
  }).catch((error) => setMessage(error.message, 'error')));
}
if (els.chooseWorkspacePathBtn) {
  els.chooseWorkspacePathBtn.addEventListener('click', () => chooseLocalDirectory(els.workspacePath, {
    button: els.chooseWorkspacePathBtn,
    title: '选择已有工作区目录',
  }).catch((error) => setMessage(error.message, 'error')));
}
[
  [els.chooseCodexPathBtn, els.codexPath, '选择 Codex CLI', 'Command files (*.cmd;*.exe;*.ps1)|*.cmd;*.exe;*.ps1|All files (*.*)|*.*'],
  [els.chooseCodexDesktopPathBtn, els.codexDesktopPath, '选择 Codex 桌面端', 'Executable files (*.exe)|*.exe|All files (*.*)|*.*'],
  [els.chooseClaudePathBtn, els.claudePath, '选择 Claude Code', 'Command files (*.cmd;*.exe;*.ps1)|*.cmd;*.exe;*.ps1|All files (*.*)|*.*'],
  [els.chooseIdeaPathBtn, els.ideaPath, '选择 IntelliJ IDEA', 'Executable files (*.exe;*.cmd)|*.exe;*.cmd|All files (*.*)|*.*'],
  [els.chooseAppIndexPathBtn, els.appIndexPath, '选择应用索引 JSON', 'JSON files (*.json)|*.json|All files (*.*)|*.*'],
].forEach(([button, input, title, filter]) => {
  if (!button) return;
  button.addEventListener('click', () => chooseLocalFile(input, { button, title, filter }).catch((error) => setMessage(error.message, 'error')));
});
[
  [els.chooseWorkspaceRootBtn, els.workspaceRoot, '选择工作区默认目录'],
  [els.chooseTeamConfigRootBtn, els.teamConfigRoot, '选择团队配置仓库'],
  [els.chooseWhitepaperRootBtn, els.whitepaperRoot, '选择领域白皮书 Git 仓库'],
  [els.chooseRepoRootBtn, els.repoRoot, '选择业务代码根目录'],
  [els.chooseDefaultSkillsRootBtn, els.defaultSkillsRoot, '选择备用 skills 目录'],
].forEach(([button, input, title]) => {
  if (!button) return;
  button.addEventListener('click', () => chooseLocalDirectory(input, { button, title }).catch((error) => setMessage(error.message, 'error')));
});
[
  [els.appendGlobalSkillDirBtn, els.globalSkills, 'directory', '追加团队 skill 目录', false],
  [els.appendGlobalSkillFileBtn, els.globalSkills, 'file', '追加团队 skill 文件', false],
  [els.appendGlobalRuleDirBtn, els.globalRules, 'directory', '追加团队 rule 目录', false],
  [els.appendGlobalRuleFileBtn, els.globalRules, 'file', '追加团队 rule 文件', false],
  [els.appendAppPathBtn, els.appPaths, 'directory', '选择候选应用目录', true],
  [els.appendKnowledgeDirBtn, els.knowledgePaths, 'directory', '追加背景知识目录', true],
  [els.appendKnowledgeFileBtn, els.knowledgePaths, 'file', '追加背景知识文件', true],
  [els.appendWorkspaceSkillDirBtn, els.workspaceSkills, 'directory', '追加本次 skill 目录', false],
  [els.appendWorkspaceSkillFileBtn, els.workspaceSkills, 'file', '追加本次 skill 文件', false],
  [els.appendWorkspaceRuleDirBtn, els.workspaceRules, 'directory', '追加本次 rule 目录', false],
  [els.appendWorkspaceRuleFileBtn, els.workspaceRules, 'file', '追加本次 rule 文件', false],
].forEach(([button, textarea, kind, title, named]) => {
  if (!button) return;
  button.addEventListener('click', () => appendPickedPath(textarea, { button, kind: kind === 'file' ? 'file' : 'directory', title, named }).catch((error) => setMessage(error.message, 'error')));
});
els.useWorkspaceBtn.addEventListener('click', () => useWorkspace().catch((error) => setMessage(error.message, 'error')));
els.openConfigBtn.addEventListener('click', () => openDeliveryConfig().catch((error) => setMessage(error.message, 'error')));
const startupOpenConfigBtn = document.querySelector('#startupOpenConfigBtn');
if (startupOpenConfigBtn) {
  startupOpenConfigBtn.addEventListener('click', () => openDeliveryConfig().catch((error) => setMessage(error.message, 'error')));
}
if (els.chooseDomainHarnessRootBtn) {
  els.chooseDomainHarnessRootBtn.addEventListener('click', () => chooseLocalDirectory(els.domainHarnessRoot, {
    button: els.chooseDomainHarnessRootBtn,
    title: '选择领域 Harness 目录',
  }).catch((error) => setMessage(error.message, 'error')));
}
if (els.inspectDomainHarnessBtn) {
  els.inspectDomainHarnessBtn.addEventListener('click', () => inspectDomainHarness().catch((error) => setMessage(error.message, 'error')));
}
if (els.attachDomainHarnessBtn) {
  els.attachDomainHarnessBtn.addEventListener('click', () => attachDomainHarness().catch((error) => setMessage(error.message, 'error')));
}
document.querySelectorAll('[data-knowledge-source]').forEach((button) => {
  button.addEventListener('click', () => {
    const labels = {
      team: '团队能力库',
      whitepaper: '领域白皮书',
      apps: '应用索引',
      local: '本次补充知识',
    };
    setMessage(`${labels[button.dataset.knowledgeSource] || '知识库'}入口已预留，后续会接入加载、命中预览和 handoff 选择。`);
  });
});
document.querySelectorAll('[data-nav-target]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.navTarget;
    if (['workbench', 'artifacts'].includes(target) && !(state.status && state.status.isWorkspace)) {
      setActiveNavPage('workspace');
      setMessage('请先选择项目目录，再进入交付流。');
      return;
    }
    setActiveNavPage(target);
    if (target === 'settings') {
      openDeliveryConfig().catch((error) => setMessage(error.message, 'error'));
      return;
    }
    if (target === 'knowledge') {
      setMessage('上下文入口已预留：后续会统一管理 PRD、知识源、应用索引和本次补充材料。');
      return;
    }
  });
});
if (els.authorizeFeishuBtn) {
  els.authorizeFeishuBtn.addEventListener('click', () => {
    authorizeFeishu().catch((error) => {
      setMessage(error.message, 'error');
      if (els.feishuAuthStatus) {
        els.feishuAuthStatus.textContent = error.message;
      }
    });
  });
}
if (els.useOfficialFeishuCliPresetBtn) {
  els.useOfficialFeishuCliPresetBtn.addEventListener('click', applyOfficialFeishuCliPreset);
}
if (els.useFeishuAppInitPresetBtn) {
  els.useFeishuAppInitPresetBtn.addEventListener('click', applyFeishuAppInitPreset);
}
[
  els.feishuMode,
  els.feishuAppId,
  els.feishuRedirectUri,
  els.feishuAuthUrl,
  els.feishuTokenRef,
  els.feishuProxyBaseUrl,
  els.feishuCliCommand,
  els.feishuCliAuthArgs,
  els.feishuCliArgs,
].forEach((input) => {
  if (!input) return;
  input.addEventListener('input', () => renderFeishuAuthStatus((collectIntegrationsConfig().feishu || {})));
  input.addEventListener('change', () => renderFeishuAuthStatus((collectIntegrationsConfig().feishu || {})));
});
if (els.closeGlobalConfigBtn) {
  els.closeGlobalConfigBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeDeliveryConfig();
  });
}
if (els.openStageMaterialsBtn) {
  els.openStageMaterialsBtn.addEventListener('click', () => openStageMaterials());
}
if (els.closeStageMaterialsBtn) {
  els.closeStageMaterialsBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeStageMaterials();
  });
}
if (els.stageMaterialsModal) {
  const stageMaterialsSummary = els.stageMaterialsModal.querySelector('summary');
  if (stageMaterialsSummary) {
    stageMaterialsSummary.addEventListener('click', (event) => {
      if (event.target === els.closeStageMaterialsBtn || event.target === els.saveInputsBtn) {
        return;
      }
      event.preventDefault();
    });
  }
}
if (els.availableApps) {
  els.availableApps.addEventListener('change', () => {
    addSelectedAvailableApps();
  });
}
if (els.newSidebarWorkspaceBtn) {
  els.newSidebarWorkspaceBtn.addEventListener('click', () => clearWorkspaceSelection().catch((error) => setMessage(error.message, 'error')));
}
if (els.sideSwitchWorkspaceBtn) {
  els.sideSwitchWorkspaceBtn.addEventListener('click', () => clearWorkspaceSelection().catch((error) => setMessage(error.message, 'error')));
}
if (els.workspaceSidebarList) {
  els.workspaceSidebarList.addEventListener('click', (event) => {
    const item = event.target.closest('[data-workspace-path]');
    if (!item) {
      return;
    }
    useSidebarWorkspace(item.dataset.workspacePath).catch((error) => setMessage(error.message, 'error'));
  });
}
els.changeWorkspaceBtn.addEventListener('click', () => clearWorkspaceSelection().catch((error) => setMessage(error.message, 'error')));
els.goNextStepBtn.addEventListener('click', () => goNextRecommendation().catch((error) => setMessage(error.message, 'error')));
if (els.nextStepOpenArtifactBtn) {
  els.nextStepOpenArtifactBtn.addEventListener('click', () => openCurrentArtifact().catch((error) => setMessage(error.message, 'error')));
}
els.saveToolsConfigBtn.addEventListener('click', () => saveToolsConfig().catch((error) => {
  setLoading(els.saveToolsConfigBtn, false);
  setMessage(error.message, 'error');
}));
if (els.saveCapabilitiesBtn) {
  els.saveCapabilitiesBtn.addEventListener('click', () => saveDeliveryConfig().catch((error) => {
    setLoading(els.saveCapabilitiesBtn, false);
    setMessage(error.message, 'error');
  }));
}
if (els.uploadPrdBtn) {
  els.uploadPrdBtn.addEventListener('click', () => uploadPrd().catch((error) => setMessage(error.message, 'error')));
}
if (els.copyLocalPrdBtn) {
  els.copyLocalPrdBtn.addEventListener('click', () => copyLocalPrd().catch((error) => setMessage(error.message, 'error')));
}
if (els.importFeishuPrdBtn) {
  els.importFeishuPrdBtn.addEventListener('click', () => importFeishuPrdToLocal().catch((error) => setMessage(error.message, 'error')));
}
if (els.matchFunctionBtn) {
  els.matchFunctionBtn.addEventListener('click', () => loadWhitepaperCatalog(els.functionQuery ? els.functionQuery.value : '').catch((error) => setMessage(error.message, 'error')));
}
if (els.functionQuery) {
  els.functionQuery.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadWhitepaperCatalog(els.functionQuery.value).catch((error) => setMessage(error.message, 'error'));
    }
  });
}
if (els.closeSyncResultBtn) {
  els.closeSyncResultBtn.addEventListener('click', closeSyncResult);
}
if (els.syncResultDialog) {
  els.syncResultDialog.addEventListener('click', (event) => {
    if (event.target === els.syncResultDialog) {
      closeSyncResult();
    }
  });
}
if (els.saveConfigBtn) {
  els.saveConfigBtn.addEventListener('click', () => saveConfig().catch((error) => setMessage(error.message, 'error')));
}
els.saveInputsBtn.addEventListener('click', () => saveMaterialsAndContext().catch((error) => setMessage(error.message, 'error')));
els.saveKnownFactsBtn.addEventListener('click', () => saveKnownFacts().catch((error) => setMessage(error.message, 'error')));
els.previewKnownFactsBtn.addEventListener('click', () => previewKnownFacts().catch((error) => setMessage(error.message, 'error')));
els.knownFactsEditTab.addEventListener('click', () => setKnownFactsMode('edit'));
els.knownFactsPreviewTab.addEventListener('click', () => setKnownFactsMode('preview'));
els.knownFacts.addEventListener('input', markKnownFactsDirty);
els.showPromptBtn.addEventListener('click', () => showPrompt().catch((error) => setMessage(error.message, 'error')));
els.openCodexCliBtn.addEventListener('click', () => runPrimaryStageAction().catch((error) => {
  setLoading(els.openCodexCliBtn, false);
  setMessage(error.message, 'error');
}));
els.openClaudeCliBtn.addEventListener('click', () => openAgentCli('claude').catch((error) => {
  setLoading(els.openClaudeCliBtn, false);
  setMessage(error.message, 'error');
}));
els.openWorkspaceFolderBtn.addEventListener('click', () => openWorkspaceFolder(els.openWorkspaceFolderBtn).catch((error) => {
  setLoading(els.openWorkspaceFolderBtn, false);
  setMessage(error.message, 'error');
}));
if (els.sideOpenWorkspaceBtn) {
  els.sideOpenWorkspaceBtn.addEventListener('click', () => openWorkspaceFolder(els.sideOpenWorkspaceBtn).catch((error) => {
    setLoading(els.sideOpenWorkspaceBtn, false);
    setMessage(error.message, 'error');
  }));
}
els.openCurrentIdeaBtn.addEventListener('click', () => openIdea().catch((error) => {
  setLoading(els.openCurrentIdeaBtn, false);
  setMessage(error.message, 'error');
}));
els.refreshHandoffBtn.addEventListener('click', () => refreshHandoffReview(true).catch((error) => setMessage(error.message, 'error')));
els.goReviewStepBtn.addEventListener('click', () => goReviewStepFromHandoff().catch((error) => setMessage(error.message, 'error')));
if (els.addGlobalPrdWordSkillBtn) {
  els.addGlobalPrdWordSkillBtn.addEventListener('click', addGlobalPrdWordSkill);
}
els.editTemplateBtn.addEventListener('click', () => openCommandTemplate().catch((error) => setMessage(error.message, 'error')));
els.resetTemplateBtn.addEventListener('click', () => resetCommandTemplate().catch((error) => {
  setLoading(els.resetTemplateBtn, false);
  setMessage(error.message, 'error');
}));
els.runStepBtn.addEventListener('click', () => runCurrentStep().catch((error) => {
  setLoading(els.runStepBtn, false);
  setMessage(error.message, 'error');
}));
els.refreshDiffBtn.addEventListener('click', () => refreshDiff().catch((error) => {
  setLoading(els.refreshDiffBtn, false);
  setMessage(error.message, 'error');
}));
els.openIdeaBtn.addEventListener('click', () => openIdea().catch((error) => {
  setLoading(els.openIdeaBtn, false);
  setMessage(error.message, 'error');
}));
els.runAdjustBtn.addEventListener('click', () => runAiAdjust().catch((error) => {
  setLoading(els.runAdjustBtn, false);
  setMessage(error.message, 'error');
}));
els.openRunLogBtn.addEventListener('click', () => openRunLog().catch((error) => setMessage(error.message, 'error')));
els.openTechnicalReviewBtn.addEventListener('click', () => openTechnicalReview().catch((error) => setMessage(error.message, 'error')));
els.saveTechnicalReviewBtn.addEventListener('click', () => saveTechnicalReview().catch((error) => setMessage(error.message, 'error')));
els.openTaskConfirmationBtn.addEventListener('click', () => openTaskConfirmation().catch((error) => setMessage(error.message, 'error')));
els.saveTaskConfirmationBtn.addEventListener('click', () => saveTaskConfirmation().catch((error) => setMessage(error.message, 'error')));
els.approveCheckpointBtn.addEventListener('click', () => submitCheckpoint('approve').catch((error) => setMessage(error.message, 'error')));
els.rejectCheckpointBtn.addEventListener('click', () => submitCheckpoint('reject').catch((error) => setMessage(error.message, 'error')));
els.runList.addEventListener('change', () => {
  state.activeRunId = els.runList.value;
  renderRuns();
});
els.artifactList.addEventListener('change', () => {
  openArtifact().catch((error) => {
    state.previewText = '';
    els.preview.value = error.message;
    els.previewMeta.textContent = '产物预览';
    setPreviewState({ mode: 'empty' });
  });
});
els.editPreviewBtn.addEventListener('click', () => {
  try {
    togglePreviewEdit();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});
els.savePreviewBtn.addEventListener('click', () => savePreviewFile().catch((error) => setMessage(error.message, 'error')));
els.copyPreviewBtn.addEventListener('click', () => copyText(els.preview.value).catch((error) => setMessage(error.message, 'error')));
els.preview.addEventListener('input', () => setPreviewDirty(true));
els.taskId.addEventListener('change', () => {
  const nextTaskId = els.taskId.value.trim().toUpperCase();
  if (Array.from(els.adjustTaskId.options).some((option) => option.value === nextTaskId)) {
    els.adjustTaskId.value = nextTaskId;
  }
  renderCurrentStep();
  renderTaskSummary();
});
els.outputRoot.addEventListener('change', () => saveState().then(refreshAll).catch((error) => setMessage(error.message, 'error')));
els.workspacePath.addEventListener('change', () => saveState().then(loadStatus).catch((error) => setMessage(error.message, 'error')));

boot();
