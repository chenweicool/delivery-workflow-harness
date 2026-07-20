(function attachRunDomain(global) {
  const { state, els, setMessage, setLoading } = global.DWAppState;
  const { api } = global.DWApi;
  const { runStatusLabel } = global.DWFormat;

  function callApp(name, ...args) {
    return global.DWAppDomains[name](...args);
  }

  function getStep(...args) { return callApp('getStep', ...args); }
  function setPreviewState(...args) { return callApp('setPreviewState', ...args); }
  async function loadRuns(...args) { return callApp('loadRuns', ...args); }
  async function loadStatus(...args) { return callApp('loadStatus', ...args); }
  async function openArtifact(...args) { return callApp('openArtifact', ...args); }
  function renderRuns(...args) { return callApp('renderRuns', ...args); }

function stopRunPolling() {
  if (state.runPollTimer) {
    clearInterval(state.runPollTimer);
    state.runPollTimer = null;
  }
  if (state.adjustPollTimer) {
    clearInterval(state.adjustPollTimer);
    state.adjustPollTimer = null;
  }
}

async function pollRun(workspacePath, runId) {
  const data = await api(`/api/runs/get?workspacePath=${encodeURIComponent(workspacePath)}&runId=${encodeURIComponent(runId)}`);
  const status = data.meta.status;
  els.preview.value = data.log || '';
  els.previewMeta.textContent = `运行日志：${data.meta.executor} / ${data.meta.stepId} / ${status}`;
  setPreviewState({ mode: 'log' });
  if (status !== 'running') {
    stopRunPolling();
    setLoading(els.runStepBtn, false);
    if (els.runAdjustBtn) {
      setLoading(els.runAdjustBtn, false);
    }
    await loadRuns();
    await loadStatus();
    if (status === 'success' && els.artifactList.value) {
      await openArtifact().catch(() => {});
    }
    setMessage(status === 'success' ? '步骤执行完成。' : `步骤执行失败：${data.meta.error || data.meta.exitCode || ''}`, status === 'success' ? '' : 'error');
  }
}

async function runCurrentStep() {
  const workspacePath = els.workspacePath.value.trim();
  const stepId = state.selectedStepId;
  const step = getStep(stepId);
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  if (!step || step.kind !== 'agent') {
    throw new Error('当前步骤不是 Agent 步骤，不能直接运行 CLI');
  }
  if (stepId === '06-implement-task' && !/^T\d{3}$/i.test(els.taskId.value.trim())) {
    throw new Error('06 单任务实现必须先填写任务编号，例如 T001');
  }
  stopRunPolling();
  setLoading(els.runStepBtn, true, '运行中...');
  const data = await api('/api/runs/start', {
    method: 'POST',
    body: JSON.stringify({
      workspacePath,
      unitId: state.selectedUnitId,
      stepId,
      executor: els.executor.value,
      taskId: els.taskId.value.trim(),
    }),
  });
  state.activeRunId = data.runId;
  els.preview.value = `已启动运行：${data.runId}\n正在等待日志...`;
  els.previewMeta.textContent = `运行日志：${els.executor.value} / ${stepId}`;
  setPreviewState({ mode: 'log' });
  state.runPollTimer = setInterval(() => {
    pollRun(workspacePath, data.runId).catch((error) => {
      stopRunPolling();
      setLoading(els.runStepBtn, false);
      setMessage(error.message, 'error');
    });
  }, 2000);
  await loadRuns();
  renderRuns();
  await pollRun(workspacePath, data.runId);
}

async function refreshDiff() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  setLoading(els.refreshDiffBtn, true, '读取中...');
  try {
    const data = await api('/api/ai-adjust/diff', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        appName: els.adjustApp.value,
      }),
    });
    state.previewText = data.diff || '';
    els.preview.value = data.diff || '暂无 diff';
    els.previewMeta.textContent = '代码 diff 摘要';
    setPreviewState({ mode: 'diff' });
    setMessage('已读取当前 worktree diff 摘要。');
  } finally {
    setLoading(els.refreshDiffBtn, false);
  }
}

async function openIdea() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  setLoading(els.openIdeaBtn, true, '打开中...');
  try {
    const data = await api('/api/ide/open-app', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        appName: els.adjustApp.value,
      }),
    });
    setMessage(`已尝试打开：${data.targetPath}`);
  } finally {
    setLoading(els.openIdeaBtn, false);
  }
}

async function runAiAdjust() {
  const workspacePath = els.workspacePath.value.trim();
  const instruction = els.adjustInstruction.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  if (!instruction) {
    throw new Error('请先填写本轮希望 AI 怎么调整');
  }
  stopRunPolling();
  setLoading(els.runAdjustBtn, true, '调整中...');
  const data = await api('/api/ai-adjust/start', {
    method: 'POST',
    body: JSON.stringify({
      workspacePath,
      executor: els.executor.value,
      taskId: els.adjustTaskId.value.trim() || els.taskId.value.trim(),
      appName: els.adjustApp.value,
      instruction,
    }),
  });
  state.selectedStepId = 'ai-adjust';
  state.activeRunId = data.runId;
  els.preview.value = `已启动 AI 调整：${data.runId}\n正在等待日志...`;
  els.previewMeta.textContent = `AI 调整：${els.executor.value}`;
  setPreviewState({ mode: 'log' });
  state.adjustPollTimer = setInterval(() => {
    pollRun(workspacePath, data.runId).catch((error) => {
      stopRunPolling();
      setLoading(els.runAdjustBtn, false);
      setMessage(error.message, 'error');
    });
  }, 2000);
  await loadRuns();
  renderRuns();
  await pollRun(workspacePath, data.runId);
}

async function openRunLog() {
  const workspacePath = els.workspacePath.value.trim();
  const runId = els.runList.value || state.activeRunId;
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  if (!runId) {
    throw new Error('暂无运行记录');
  }
  state.activeRunId = runId;
  const data = await api(`/api/runs/log?workspacePath=${encodeURIComponent(workspacePath)}&runId=${encodeURIComponent(runId)}`);
  els.preview.value = data.log || '';
  els.previewMeta.textContent = `运行日志：${data.meta.executor} / ${data.meta.stepId} / ${runStatusLabel(data.meta.status)}`;
  setPreviewState({ mode: 'log' });
  await loadRuns();
  renderRuns();
}


  global.DWRunsDomain = {
    stopRunPolling,
    pollRun,
    runCurrentStep,
    refreshDiff,
    openIdea,
    runAiAdjust,
    openRunLog,
  };
})(window);
