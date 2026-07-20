(function attachArtifactDomain(global) {
  const { state, els, setMessage, setLoading } = global.DWAppState;
  const { api } = global.DWApi;
  const { escapeHtml } = global.DWFormat;

  function callApp(name, ...args) {
    return global.DWAppDomains[name](...args);
  }

  function getStep(...args) { return callApp('getStep', ...args); }
  function getCurrentArtifactPath(...args) { return callApp('getCurrentArtifactPath', ...args); }
  function renderLocalStepPanel(...args) { return callApp('renderLocalStepPanel', ...args); }
  function setPreviewState(...args) { return callApp('setPreviewState', ...args); }
  async function loadStatus(...args) { return callApp('loadStatus', ...args); }
  async function previewPrompt(...args) { return callApp('previewPrompt', ...args); }
  function renderStarterPromptPreview(...args) { return callApp('renderStarterPromptPreview', ...args); }

async function openLocalStepFile(relativePath, editable) {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  const data = await api(`/api/file?workspacePath=${encodeURIComponent(workspacePath)}&path=${encodeURIComponent(relativePath)}`);
  state.previewText = data.content;
  els.preview.value = data.content;
  els.previewMeta.textContent = `${editable ? '编辑' : '查看'}：${relativePath}`;
  if (els.previewBox) {
    els.previewBox.classList.remove('hidden');
  }
  setPreviewState({ mode: 'file', path: relativePath, editable });
  const step = getStep(state.selectedStepId);
  if (step && step.kind === 'local') {
    renderLocalStepPanel(step);
  }
  setMessage(editable ? `正在编辑 ${relativePath}` : `正在查看 ${relativePath}`);
}

function renderArtifacts() {
  const files = state.status && state.status.artifactFiles ? state.status.artifactFiles.filter((item) => item.type === 'file') : [];
  const step = getStep(state.selectedStepId);
  const sourceStatuses = step.kind === 'manual' && step.checkpoint
    ? step.checkpoint.reviewFiles || []
    : step.outputStatuses || [];
  const outputStatuses = sourceStatuses.filter((item) => !item.path.endsWith('/**'));
  if (outputStatuses.length) {
    els.artifactList.innerHTML = outputStatuses
      .map((item) => {
        const file = files.find((candidate) => candidate.path === item.path);
        const value = item.exists ? item.path : '';
        const label = file
          ? item.path
          : item.exists
            ? item.path
          : step.kind === 'manual' && item.optional
            ? `可选评审记录未生成：${item.path}`
            : step.kind === 'manual'
              ? `待确认产物未生成：${item.path}`
              : `待生成：${item.path}`;
        return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
      })
      .join('');
    const firstExistingOutput = outputStatuses.find((item) => item.exists);
    if (firstExistingOutput) {
      els.artifactList.value = firstExistingOutput.path;
    }
    return;
  }

  els.artifactList.innerHTML = '<option value="">当前步骤无文件产物</option>';
}


async function openArtifact() {
  const workspacePath = els.workspacePath.value.trim();
  const artifactPath = els.artifactList.value;
  if (!artifactPath) {
    throw new Error('暂无可预览产物');
  }
  const data = await api(`/api/file?workspacePath=${encodeURIComponent(workspacePath)}&path=${encodeURIComponent(artifactPath)}`);
  state.previewText = data.content;
  els.preview.value = data.content;
  els.previewMeta.textContent = `产物预览：${artifactPath}`;
  setPreviewState({ mode: 'file', path: artifactPath });
}

async function openCurrentArtifact(relativePath) {
  const workspacePath = els.workspacePath.value.trim();
  const artifactPath = relativePath || getCurrentArtifactPath();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  if (!artifactPath) {
    throw new Error('暂无可预览产物');
  }
  const data = await api(`/api/file?workspacePath=${encodeURIComponent(workspacePath)}&path=${encodeURIComponent(artifactPath)}`);
  state.previewText = data.content;
  els.preview.value = data.content;
  els.previewMeta.textContent = `产物预览：${artifactPath}`;
  if (els.artifactList && Array.from(els.artifactList.options).some((option) => option.value === artifactPath)) {
    els.artifactList.value = artifactPath;
  }
  setPreviewState({ mode: 'file', path: artifactPath });
  if (els.previewBox) {
    els.previewBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function autoPreviewCurrentArtifact() {
  const step = getStep(state.selectedStepId);
  if (!step || step.kind !== 'manual' || !els.artifactList.value) {
    return;
  }
  await openArtifact();
}

async function autoPreviewSelectedStep() {
  const step = getStep(state.selectedStepId);
  if (!step || !step.id || !els.artifactList.value) {
    if (step && step.kind === 'agent') {
      try {
        const shown = await previewPrompt({ silent: true });
        if (shown) {
          return;
        }
      } catch (error) {
        console.warn('auto prompt preview failed:', error);
      }
      if (renderStarterPromptPreview()) {
        return;
      }
    }
    state.previewText = '';
    els.preview.value = '';
    els.previewMeta.textContent = step && step.id ? `当前步骤：${step.title || step.id}` : '';
    setPreviewState({ mode: 'empty' });
    return;
  }
  await openArtifact();
}

function togglePreviewEdit() {
  if (state.previewMode === 'prompt') {
    const nextEditable = els.preview.readOnly;
    setPreviewState({ mode: 'prompt', editable: nextEditable });
    setMessage(nextEditable
      ? '提示词已进入临时编辑模式。修改后可复制；运行当前步骤仍会使用系统按模板重新生成的提示词。'
      : '已切回只读预览。');
    return;
  }
  if (state.previewMode !== 'file' || !state.previewPath) {
    throw new Error('当前内容不是可编辑内容');
  }
  const nextEditable = els.preview.readOnly;
  setPreviewState({ mode: 'file', path: state.previewPath, editable: nextEditable });
}

async function savePreviewFile() {
  if (state.previewMode !== 'file' || !state.previewPath) {
    throw new Error('当前内容不是可保存文件');
  }
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  setLoading(els.savePreviewBtn, true, '保存中...');
  try {
    const data = await api('/api/file/save', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        path: state.previewPath,
        content: els.preview.value,
      }),
    });
    await loadStatus();
    await openArtifact();
    setPreviewState({ mode: 'file', path: data.path });
    const cleared = data.clearedCheckpoints && data.clearedCheckpoints.length
      ? `，已清除旧确认状态：${data.clearedCheckpoints.join('、')}`
      : '';
    setMessage(`已保存 ${data.path}${cleared}`);
  } finally {
    setLoading(els.savePreviewBtn, false);
  }
}


  global.DWArtifactDomain = {
    openLocalStepFile,
    renderArtifacts,
    openArtifact,
    openCurrentArtifact,
    autoPreviewCurrentArtifact,
    autoPreviewSelectedStep,
    togglePreviewEdit,
    savePreviewFile,
  };
})(window);
