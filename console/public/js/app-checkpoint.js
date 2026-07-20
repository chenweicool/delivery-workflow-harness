(function attachCheckpointDomain(global) {
  const { state, els, setMessage, setLoading } = global.DWAppState;
  const { api } = global.DWApi;
  const { escapeHtml } = global.DWFormat;

  function callApp(name, ...args) {
    return global.DWAppDomains[name](...args);
  }

  function getStep(...args) { return callApp('getStep', ...args); }
  function setPreviewState(...args) { return callApp('setPreviewState', ...args); }
  async function loadStatus(...args) { return callApp('loadStatus', ...args); }

function renderCheckpointPanel() {
  const step = getStep(state.selectedStepId);
  if (!step || step.kind !== 'manual') {
    els.checkpointPanel.classList.add('hidden');
    els.technicalReviewActions.classList.add('hidden');
    els.taskConfirmationActions.classList.add('hidden');
    return;
  }

  els.checkpointPanel.classList.remove('hidden');
  els.technicalReviewActions.classList.toggle('hidden', step.id !== 'manual-technical');
  els.taskConfirmationActions.classList.toggle('hidden', step.id !== 'manual-task');
  const checkpoint = step.checkpoint || {};
  const status = checkpoint.status || 'pending';
  const reviewFiles = checkpoint.reviewFiles || [];
  const missingFiles = reviewFiles.filter((item) => !item.optional && !item.exists).map((item) => item.path);
  const hasReviewFiles = reviewFiles.length > 0 && missingFiles.length === 0;
  const existingPayload = checkpoint.approval || checkpoint.rejection || {};
  const existingChecklist = new Map((existingPayload.checklist || []).map((item) => [item.id, item]));
  const checklistTemplate = step.checklist || existingPayload.checklistTemplate || [];
  els.checkpointChecklist.innerHTML = checklistTemplate.length
    ? checklistTemplate
        .map((item) => {
          const existing = existingChecklist.get(item.id);
          const checked = existing && existing.checked ? ' checked' : '';
          return `<label class="checkItem">
            <input type="checkbox" data-check-id="${escapeHtml(item.id)}"${checked} />
            <span>${escapeHtml(item.label)}</span>
          </label>`;
        })
        .join('')
    : '<p class="fieldHelp">当前确认点暂无清单模板。</p>';

  const updateChecklistState = () => {
    const items = getCheckpointChecklistValues();
    const checkedCount = items.filter((item) => item.checked).length;
    els.checklistProgress.textContent = `${checkedCount}/${items.length}`;
    els.checklistProgress.className = `badge ${items.length && checkedCount === items.length ? 'done' : 'waiting'}`;
    els.approveCheckpointBtn.disabled = !hasReviewFiles || (items.length > 0 && checkedCount !== items.length);
  };
  els.checkpointChecklist.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', updateChecklistState);
  });

  if (status === 'approved') {
    els.checkpointStatusText.textContent = `已确认：${checkpoint.approvalFile || ''}`;
    els.checkpointStatusBadge.textContent = '已确认';
    els.checkpointStatusBadge.className = 'statePill done';
    els.checkpointNote.value = (checkpoint.approval && checkpoint.approval.note) || '';
  } else if (status === 'rejected') {
    els.checkpointStatusText.textContent = `已退回：${checkpoint.rejectionFile || ''}。评审意见会写入 technical-review.md，重新运行上一步可修订方案。`;
    els.checkpointStatusBadge.textContent = '已退回';
    els.checkpointStatusBadge.className = 'statePill rejected';
    els.checkpointNote.value = (checkpoint.rejection && checkpoint.rejection.note) || '';
  } else if (!hasReviewFiles) {
    els.checkpointStatusText.textContent = `待确认产物未生成：${missingFiles.join('、') || '无待确认文件'}`;
    els.checkpointStatusBadge.textContent = '等待产物';
    els.checkpointStatusBadge.className = 'statePill waiting';
  } else {
    els.checkpointStatusText.textContent = `请先预览并确认：${reviewFiles.map((item) => item.path).join('、')}`;
    els.checkpointStatusBadge.textContent = '等待确认';
    els.checkpointStatusBadge.className = 'statePill waiting';
  }

  els.rejectCheckpointBtn.disabled = !reviewFiles.length;
  updateChecklistState();
}

function getCheckpointChecklistValues() {
  return Array.from(els.checkpointChecklist.querySelectorAll('input[type="checkbox"]')).map((input) => ({
    id: input.dataset.checkId,
    label: input.closest('label') ? input.closest('label').innerText.trim() : input.dataset.checkId,
    checked: input.checked,
  }));
}


async function submitCheckpoint(action) {
  const workspacePath = els.workspacePath.value.trim();
  const step = getStep(state.selectedStepId);
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  if (!step || step.kind !== 'manual') {
    throw new Error('当前步骤不是人工确认步骤');
  }
  const button = action === 'approve' ? els.approveCheckpointBtn : els.rejectCheckpointBtn;
  setLoading(button, true, action === 'approve' ? '确认中...' : '退回中...');
  try {
    await api(`/api/checkpoint/${action}`, {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        stepId: state.selectedStepId,
        note: els.checkpointNote.value,
        checklist: getCheckpointChecklistValues(),
      }),
    });
    await loadStatus();
    setMessage(action === 'approve' ? '已确认终版，后续步骤可以继续执行。' : '已退回，评审意见已记录；请重新运行上一 Agent 步骤修订方案。');
  } finally {
    setLoading(button, false);
  }
}

async function openTechnicalReview() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  const data = await api(`/api/workspace/technical-review?workspacePath=${encodeURIComponent(workspacePath)}`);
  state.previewText = data.content || '';
  els.preview.value = data.content || '';
  els.previewMeta.textContent = `评审意见：${data.path}`;
  setPreviewState({ mode: 'file', path: data.path, editable: true });
  els.saveTechnicalReviewBtn.classList.remove('hidden');
  els.saveTechnicalReviewBtn.disabled = false;
}

async function saveTechnicalReview() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  setLoading(els.saveTechnicalReviewBtn, true, '保存中...');
  try {
    const data = await api('/api/workspace/technical-review', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        content: els.preview.value,
      }),
    });
    await loadStatus();
    setPreviewState({ mode: 'file', path: data.path, editable: true });
    setMessage(`已保存评审意见到 ${data.path}`);
  } finally {
    setLoading(els.saveTechnicalReviewBtn, false);
  }
}

async function openTaskConfirmation() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  const data = await api(`/api/workspace/task-confirmation?workspacePath=${encodeURIComponent(workspacePath)}`);
  state.previewText = data.content || '';
  els.preview.value = data.content || '';
  els.previewMeta.textContent = `任务确认：${data.path}`;
  setPreviewState({ mode: 'file', path: data.path, editable: true });
  els.saveTaskConfirmationBtn.classList.remove('hidden');
  els.saveTaskConfirmationBtn.disabled = false;
}

async function saveTaskConfirmation() {
  const workspacePath = els.workspacePath.value.trim();
  if (!workspacePath) {
    throw new Error('请先选择 workspace');
  }
  setLoading(els.saveTaskConfirmationBtn, true, '保存中...');
  try {
    const data = await api('/api/workspace/task-confirmation', {
      method: 'POST',
      body: JSON.stringify({
        workspacePath,
        content: els.preview.value,
      }),
    });
    await loadStatus();
    setPreviewState({ mode: 'file', path: data.path, editable: true });
    setMessage(`已保存任务确认到 ${data.path}`);
  } finally {
    setLoading(els.saveTaskConfirmationBtn, false);
  }
}


  global.DWCheckpointDomain = {
    renderCheckpointPanel,
    getCheckpointChecklistValues,
    submitCheckpoint,
    openTechnicalReview,
    saveTechnicalReview,
    openTaskConfirmation,
    saveTaskConfirmation,
  };
})(window);
