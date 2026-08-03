(function controlPlane() {
  const state = { workspacePath: '', status: null, gates: null };
  const $ = (selector) => document.querySelector(selector);
  const els = {
    message: $('#message'), startScreen: $('#startScreen'), workspaceScreen: $('#workspaceScreen'), workspaceBadge: $('#workspaceBadge'),
    demandName: $('#demandName'), outputRoot: $('#outputRoot'), domainRoot: $('#domainRoot'), initialPrdFiles: $('#initialPrdFiles'),
    chooseDomainBtn: $('#chooseDomainBtn'), chooseOutputRootBtn: $('#chooseOutputRootBtn'), createWorkspaceBtn: $('#createWorkspaceBtn'), newWorkspaceBtn: $('#newWorkspaceBtn'),
    workspaceName: $('#workspaceName'), workspacePath: $('#workspacePath'), nextTitle: $('#nextTitle'), nextDescription: $('#nextDescription'), nextCommand: $('#nextCommand'),
    domainCard: $('#domainCard'), prdCard: $('#prdCard'), gatesPanel: $('#gatesPanel'), artifactPanel: $('#artifactPanel'),
    changeWorkspaceBtn: $('#changeWorkspaceBtn'), openFolderBtn: $('#openFolderBtn'), switchWorkspaceDialog: $('#switchWorkspaceDialog'), existingWorkspacePath: $('#existingWorkspacePath'), chooseWorkspaceBtn: $('#chooseWorkspaceBtn'), useWorkspaceBtn: $('#useWorkspaceBtn'),
  };

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败：${response.status}`);
    return data;
  }
  const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  function message(text, type = '') { els.message.textContent = text; els.message.className = `message ${type}`.trim(); els.message.classList.toggle('hidden', !text); }
  function setLoading(button, loading, text) { if (!button) return; button.disabled = loading; button.textContent = loading ? text : button.dataset.idle || button.textContent; }
  function basename(value) { const parts = String(value || '').replace(/\\/g, '/').split('/').filter(Boolean); return parts[parts.length - 1] || value; }
  function domainContext() { const config = state.status && state.status.config ? state.status.config : {}; return config.domainContext && config.domainContext.root ? { ...config.domainContext, ...(config.domain || {}) } : (config.domain || {}); }

  async function chooseDirectory(input, title) {
    const data = await api('/api/system/select-directory', { method: 'POST', body: JSON.stringify({ initialPath: input.value.trim(), title }) });
    if (data.path) input.value = data.path;
  }
  async function uploadPrd(files) {
    if (!files || !files.length) return;
    const form = new FormData(); form.append('workspacePath', state.workspacePath); form.append('targetSubdir', '');
    Array.from(files).forEach((file) => form.append('files', file));
    await api('/api/workspace/upload-prd', { method: 'POST', body: form });
  }
  async function createWorkspace() {
    const demandName = els.demandName.value.trim(); const outputRoot = els.outputRoot.value.trim(); const domainRoot = els.domainRoot.value.trim();
    if (!demandName || !outputRoot || !domainRoot) throw new Error('请填写需求名称、工作区父目录和领域 Harness。');
    const button = els.createWorkspaceBtn; button.dataset.idle = '创建需求 Workspace'; setLoading(button, true, '创建中...');
    try {
      const result = await api('/api/workspaces/init', { method: 'POST', body: JSON.stringify({ demandName, outputRoot, domainRoot }) });
      state.workspacePath = result.workspacePath;
      await uploadPrd(els.initialPrdFiles.files);
      await loadWorkspace();
      message('需求 Workspace 已创建。下一步请补齐 PRD 后，在目录中使用你自己的 AI 工具开展澄清。');
    } finally { setLoading(button, false); }
  }
  async function loadWorkspace() {
    if (!state.workspacePath) return;
    state.status = await api(`/api/workspace/status?workspacePath=${encodeURIComponent(state.workspacePath)}`);
    if (!state.status.isWorkspace) throw new Error(state.status.message || '不是有效 Workspace');
    state.gates = await api('/api/gates/check', { method: 'POST', body: JSON.stringify({ workspacePath: state.workspacePath }) });
    render();
  }
  async function attachDomain() {
    const input = $('#attachDomainRoot'); const domainRoot = input ? input.value.trim() : '';
    if (!domainRoot) throw new Error('请选择领域 Harness 目录');
    await api('/api/workspace/domain-context', { method: 'POST', body: JSON.stringify({ workspacePath: state.workspacePath, domainRoot }) });
    await loadWorkspace(); message('领域 Harness 已挂载。');
  }
  async function uploadExistingPrd() {
    const input = $('#prdFiles'); await uploadPrd(input && input.files); await loadWorkspace(); message('PRD 已导入并进入本次需求快照。');
  }
  async function gateAction(gateId, action) {
    const noteInput = document.querySelector(`[data-gate-note="${CSS.escape(gateId)}"]`); const note = noteInput ? noteInput.value.trim() : '';
    await api(`/api/gates/${action}`, { method: 'POST', body: JSON.stringify({ workspacePath: state.workspacePath, gateId, note }) });
    await loadWorkspace(); message(`质量门禁已${action === 'approve' ? '通过' : '退回'}：${gateId}`);
  }
  async function openFolder() { await api('/api/workspace/open-folder', { method: 'POST', body: JSON.stringify({ workspacePath: state.workspacePath }) }); }

  function renderNext() {
    const domain = domainContext(); const prdCount = state.status.materialPrdCount || 0;
    if (!domain.root) { els.nextTitle.textContent = '先绑定领域 Harness'; els.nextDescription.textContent = '领域 Harness 提供白皮书、代码入口、领域规则和历史记忆。'; els.nextCommand.textContent = `dw domain attach --workspace "${state.workspacePath}" --root <领域Harness路径>`; }
    else if (!prdCount) { els.nextTitle.textContent = '导入 PRD'; els.nextDescription.textContent = 'PRD 是目标行为的第一事实源。导入后由 AI 在目录中开展需求澄清。'; els.nextCommand.textContent = `dw prd import <PRD文件> --workspace "${state.workspacePath}"`; }
    else { const nextGate = Object.values(state.gates.gates || {}).find((gate) => gate.status !== 'approved' && gate.status !== 'exception-approved'); els.nextTitle.textContent = nextGate ? `补齐并确认：${nextGate.title}` : '全部质量门禁已通过'; els.nextDescription.textContent = nextGate ? (nextGate.missing.length ? `还缺 ${nextGate.missing.length} 项证据；请在 Workspace 中用 AI 按阶段命令生成。` : '证据已齐备，等待对应责任人进行人工确认。') : '可以进入交付归档与领域知识更新提案。'; els.nextCommand.textContent = `cd "${state.workspacePath}"\n# 使用你自己的 Codex 或 Claude，按 AGENTS.md / CLAUDE.md 与当前阶段命令工作`; }
    els.nextCommand.classList.remove('hidden');
  }
  function renderDomainCard() {
    const domain = domainContext();
    if (!domain.root) {
      els.domainCard.innerHTML = `<p class="eyebrow">REQUIRED</p><h3>未绑定领域 Harness</h3><p>一个需求必须绑定一个领域。跨领域请拆分需求。</p><div class="picker-row"><input id="attachDomainRoot" placeholder="F:\\code\\harness-project\\..." /><button id="chooseAttachDomainBtn" type="button">选择目录</button></div><div class="card-actions"><button id="attachDomainBtn" class="primary" type="button">绑定领域</button></div>`;
      $('#chooseAttachDomainBtn').addEventListener('click', () => chooseDirectory($('#attachDomainRoot'), '选择领域 Harness 目录').catch((error) => message(error.message, 'error')));
      $('#attachDomainBtn').addEventListener('click', () => attachDomain().catch((error) => message(error.message, 'error')));
      return;
    }
    const repos = domain.codeRepositories || []; const local = repos.filter((repo) => repo.sourceExists).map((repo) => repo.name);
    els.domainCard.innerHTML = `<p class="eyebrow">DOMAIN HARNESS</p><h3>${escapeHtml(domain.name || domain.id || basename(domain.root))}</h3><p class="path">${escapeHtml(domain.root)}</p><span class="badge">版本 ${escapeHtml(String(domain.revision || 'unversioned').slice(0, 12))}</span><p>领域文档 ${(domain.productDocuments || []).length} · 领域记忆 ${(domain.memoryDocuments || []).length} · 代码仓 ${repos.length}</p><p>${local.length ? `本地可读：${escapeHtml(local.join('、'))}` : '代码入口已声明，当前本地代码尚未就绪。'}</p>`;
  }
  function renderPrdCard() {
    const files = state.status.prdFiles || []; const count = state.status.materialPrdCount || 0;
    els.prdCard.innerHTML = `<p class="eyebrow">PRD</p><h3>${count ? `已导入 ${count} 份需求材料` : '尚未导入 PRD'}</h3><p>${count ? escapeHtml(files.filter((file) => file.type === 'file').map((file) => file.path).slice(0, 3).join('、')) : '导入 Markdown、Word 转换结果或其他需求材料。'}</p><label><span>追加本地 PRD</span><input id="prdFiles" type="file" multiple /></label><div class="card-actions"><button id="uploadPrdBtn" class="primary" type="button">导入 PRD</button></div>`;
    $('#uploadPrdBtn').addEventListener('click', () => uploadExistingPrd().catch((error) => message(error.message, 'error')));
  }
  function gateBadge(status) { const labels = { blocked: '证据缺失', 'ready-for-approval': '等待确认', approved: '已通过', rejected: '已退回', 'exception-approved': '例外通过' }; return `<span class="badge status-${escapeHtml(status)}">${escapeHtml(labels[status] || status)}</span>`; }
  function renderGates() {
    const gates = Object.values((state.gates && state.gates.gates) || {});
    els.gatesPanel.innerHTML = gates.map((gate) => `<article class="card gate"><div><p class="eyebrow">${escapeHtml(gate.id)}</p><h3>${escapeHtml(gate.title)}</h3><small>审批角色：${escapeHtml(gate.approval || '未指定')}</small></div><div class="gate-evidence">${gate.evidence.map((item) => `<span class="evidence ${item.exists ? 'ok' : 'missing'}">${escapeHtml(item.path)}</span>`).join('')}</div><div class="gate-actions">${gateBadge(gate.status)}${gate.status === 'ready-for-approval' ? `<input data-gate-note="${escapeHtml(gate.id)}" placeholder="确认说明（可选）" /><button data-gate-action="approve" data-gate-id="${escapeHtml(gate.id)}" class="primary" type="button">人工通过</button><button data-gate-action="reject" data-gate-id="${escapeHtml(gate.id)}" type="button">退回</button>` : ''}</div></article>`).join('') || '<section class="card gate">未读取到质量策略。</section>';
    els.gatesPanel.querySelectorAll('[data-gate-action]').forEach((button) => button.addEventListener('click', () => gateAction(button.dataset.gateId, button.dataset.gateAction).catch((error) => message(error.message, 'error'))));
  }
  function renderArtifacts() {
    const artifacts = state.status.artifactFiles || [];
    els.artifactPanel.innerHTML = artifacts.length ? artifacts.map((item) => `<span class="artifact exists">${escapeHtml(item.path)}</span>`).join('') : '<span class="artifact">正式产物将在需求澄清、技术方案、测试与交付阶段回写到此处。</span>';
  }
  function render() {
    const active = Boolean(state.status && state.status.isWorkspace); els.startScreen.classList.toggle('hidden', active); els.workspaceScreen.classList.toggle('hidden', !active); els.workspaceBadge.textContent = active ? '当前需求' : '未选择需求';
    if (!active) return;
    els.workspaceName.textContent = state.status.config.demandName || basename(state.workspacePath); els.workspacePath.textContent = state.workspacePath; renderNext(); renderDomainCard(); renderPrdCard(); renderGates(); renderArtifacts();
  }
  async function openWorkspaceFromDialog() { const value = els.existingWorkspacePath.value.trim(); if (!value) throw new Error('请选择 Workspace 目录'); state.workspacePath = value; await loadWorkspace(); els.switchWorkspaceDialog.close(); }
  async function initialize() { const appState = await api('/api/state'); els.outputRoot.value = appState.outputRoot || ''; if (appState.workspacePath) { state.workspacePath = appState.workspacePath; try { await loadWorkspace(); } catch { state.workspacePath = ''; render(); } } else render(); }

  els.chooseDomainBtn.addEventListener('click', () => chooseDirectory(els.domainRoot, '选择领域 Harness 目录').catch((error) => message(error.message, 'error')));
  els.chooseOutputRootBtn.addEventListener('click', () => chooseDirectory(els.outputRoot, '选择工作区父目录').catch((error) => message(error.message, 'error')));
  els.createWorkspaceBtn.addEventListener('click', () => createWorkspace().catch((error) => message(error.message, 'error')));
  els.newWorkspaceBtn.addEventListener('click', () => { state.workspacePath = ''; state.status = null; state.gates = null; render(); });
  els.changeWorkspaceBtn.addEventListener('click', () => els.switchWorkspaceDialog.showModal());
  els.chooseWorkspaceBtn.addEventListener('click', () => chooseDirectory(els.existingWorkspacePath, '选择已有 Workspace').catch((error) => message(error.message, 'error')));
  els.useWorkspaceBtn.addEventListener('click', () => openWorkspaceFromDialog().catch((error) => message(error.message, 'error')));
  els.openFolderBtn.addEventListener('click', () => openFolder().catch((error) => message(error.message, 'error')));
  initialize().catch((error) => message(error.message, 'error'));
})();
