(function attachWorkspaceDomain(global) {
  const { state, els, setMessage, setLoading } = global.DWAppState;
  const { api } = global.DWApi;
  const { escapeHtml } = global.DWFormat;

  function callApp(name, ...args) {
    return global.DWAppDomains[name](...args);
  }

  function renderToolsConfig(...args) { return callApp('renderToolsConfig', ...args); }
  function render(...args) { return callApp('render', ...args); }
  async function loadRuns(...args) { return callApp('loadRuns', ...args); }
  function configToText(...args) { return callApp('configToText', ...args); }
  function ensureSelectedStepInUnit(...args) { return callApp('ensureSelectedStepInUnit', ...args); }
  function focusNextActionAfterWorkspaceInit(...args) { return callApp('focusNextActionAfterWorkspaceInit', ...args); }
  async function ensureKnownFactsLoaded(...args) { return callApp('ensureKnownFactsLoaded', ...args); }
  async function autoPreviewSelectedStep(...args) { return callApp('autoPreviewSelectedStep', ...args); }

async function loadState() {
  state.appState = await api('/api/state');
  els.outputRoot.value = state.appState.outputRoot || state.definition.defaultOutputRoot;
  els.workspacePath.value = state.appState.workspacePath || '';
  state.selectedUnitId = state.appState.selectedUnitId || 'workspace';
  renderToolsConfig(state.appState.tools || {});
}

function unitIdForStep(stepId) {
  const units = state.definition && Array.isArray(state.definition.units) ? state.definition.units : [];
  const unit = units.find((item) => Array.isArray(item.steps) && item.steps.includes(stepId));
  return unit ? unit.id : '';
}

async function applyUrlOverrides() {
  const params = new URLSearchParams(window.location.search);
  const workspacePath = params.get('workspace') || params.get('workspacePath') || '';
  const stepId = params.get('step') || params.get('stepId') || '';
  if (!workspacePath && !stepId) {
    return;
  }
  if (workspacePath) {
    els.workspacePath.value = workspacePath;
  }
  if (stepId) {
    state.selectedStepId = stepId;
    state.selectedUnitId = unitIdForStep(stepId) || state.selectedUnitId;
  }
  await saveState({
    workspacePath: els.workspacePath.value.trim(),
    selectedUnitId: state.selectedUnitId,
  });
  window.history.replaceState({}, document.title, window.location.pathname);
}

async function saveState(patch = {}) {
  state.appState = await api('/api/state', {
    method: 'POST',
    body: JSON.stringify({
      ...patch,
      outputRoot: els.outputRoot.value.trim(),
      workspacePath: els.workspacePath.value.trim(),
      selectedUnitId: state.selectedUnitId,
    }),
  });
}


function renderWorkspaceSidebar() {
  if (!els.workspaceSidebarList) {
    return;
  }
  const currentPath = els.workspacePath.value.trim();
  if (!state.workspaces.length) {
    els.workspaceSidebarList.innerHTML = '<div class="emptySidebar">还没有发现工作区</div>';
    return;
  }
  els.workspaceSidebarList.innerHTML = state.workspaces.map((item) => {
    const active = currentPath && item.path === currentPath;
    return [
      `<button class="workspaceSideItem ${active ? 'active' : ''}" type="button" data-workspace-path="${escapeHtml(item.path)}">`,
      `<strong>${escapeHtml(item.name)}</strong>`,
      `<span>${escapeHtml(item.path)}</span>`,
      '</button>',
    ].join('');
  }).join('');
}


async function loadWorkspaces() {
  const data = await api(`/api/workspaces?outputRoot=${encodeURIComponent(els.outputRoot.value.trim())}`);
  state.workspaces = data.workspaces || [];
  els.workspaceList.innerHTML = [
    '<option value="">选择已有 workspace</option>',
    ...state.workspaces.map((item) => `<option value="${escapeHtml(item.path)}">${escapeHtml(item.name)}</option>`),
  ].join('');
  renderWorkspaceSidebar();
}

async function loadStatus() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    state.status = null;
    state.runs = [];
    render();
    return;
  }
  state.status = await api(`/api/workspace/status?workspacePath=${encodeURIComponent(workspacePath)}`);
  if (state.status && !state.status.isWorkspace) {
    els.workspacePath.value = '';
    state.status = null;
    state.runs = [];
    await saveState({ workspacePath: '' });
    render();
    return;
  }
  if (state.status && state.status.isWorkspace) {
    await loadRuns();
  } else {
    state.runs = [];
  }
  if (state.status && state.status.config) {
    configToText(state.status.config);
  }
  ensureSelectedStepInUnit();
  focusNextActionAfterWorkspaceInit();
  render();
  await ensureKnownFactsLoaded();
  setTimeout(() => {
    autoPreviewSelectedStep().catch((error) => console.warn('auto preview failed:', error));
  }, 0);
}


function renderWorkspaceState() {
  const mainPanel = document.querySelector('.main');
  if (!state.status) {
    if (els.workspaceState) {
      els.workspaceState.textContent = '未选择项目';
      els.workspaceState.className = 'statePill';
    }
    if (els.currentWorkspaceText) {
      els.currentWorkspaceText.textContent = '未选择';
    }
    els.startScreen.classList.remove('hidden');
    els.consoleScreen.classList.remove('hidden');
    if (mainPanel) {
      mainPanel.classList.add('hidden');
    }
    return;
  }
  if (!state.status.isWorkspace) {
    if (els.workspaceState) {
      els.workspaceState.textContent = state.status.message || '无效 workspace';
      els.workspaceState.className = 'statePill waiting';
    }
    if (els.currentWorkspaceText) {
      els.currentWorkspaceText.textContent = state.status.workspacePath || '无效目录';
    }
    els.startScreen.classList.remove('hidden');
    els.consoleScreen.classList.remove('hidden');
    if (mainPanel) {
      mainPanel.classList.add('hidden');
    }
    return;
  }
  const prdCount = state.status.materialPrdCount || 0;
  if (els.workspaceState) {
    els.workspaceState.textContent = `已选择 / PRD ${prdCount} 个`;
    els.workspaceState.className = 'statePill active';
  }
  els.currentWorkspaceText.textContent = state.status.workspacePath;
  els.startScreen.classList.add('hidden');
  els.consoleScreen.classList.remove('hidden');
  if (mainPanel) {
    mainPanel.classList.remove('hidden');
  }
}

function renderStagePanels() {
  const shouldShowMaterialInputs = Boolean(state.status && state.status.isWorkspace && state.selectedUnitId === 'prd-to-design');
  if (els.workspaceMaterialPanel) {
    els.workspaceMaterialPanel.classList.toggle('hidden', !shouldShowMaterialInputs);
  }
}


async function refreshAll() {
  await loadWorkspaces();
  await loadStatus();
}

async function initWorkspace() {
  setLoading(els.initBtn, true, '创建中...');
  try {
    const demandName = els.demandName.value.trim();
    const outputRoot = els.outputRoot.value.trim();
    const data = await api('/api/workspaces/init', {
      method: 'POST',
      body: JSON.stringify({ demandName, outputRoot }),
    });
    els.workspacePath.value = data.workspacePath;
    await saveState();
    await refreshAll();
    setMessage(`Workspace 已创建：${data.workspacePath}`);
  } finally {
    setLoading(els.initBtn, false);
  }
}


  global.DWWorkspaceDomain = {
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
  };
})(window);
