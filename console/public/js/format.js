(function attachFormat(global) {
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function renderSimpleMarkdown(text) {
    const lines = String(text || '').split(/\r?\n/);
    const html = [];
    let inList = false;
    const closeList = () => {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        closeList();
        continue;
      }
      const heading = /^(#{1,4})\s+(.+)$/.exec(line);
      if (heading) {
        closeList();
        const level = Math.min(heading[1].length + 2, 4);
        html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
        continue;
      }
      const bullet = /^[-*]\s+(.+)$/.exec(line);
      if (bullet) {
        if (!inList) {
          html.push('<ul>');
          inList = true;
        }
        html.push(`<li>${escapeHtml(bullet[1])}</li>`);
        continue;
      }
      closeList();
      html.push(`<p>${escapeHtml(line)}</p>`);
    }
    closeList();
    return html.join('');
  }

  function statusLabel(status) {
    return {
      idle: '未开始',
      active: '进行中',
      waiting: '等待确认',
      done: '已完成',
    }[status] || status || '未知';
  }

  function runStatusLabel(status) {
    return {
      running: '运行中',
      success: '成功',
      failed: '失败',
    }[status] || status || '未知';
  }

  function capabilityTypeLabel(type) {
    return {
      'prd-convert': 'PRD 转换',
      'api-doc': '接口文档',
      'unit-test': '单测',
      'code-review': 'Review',
      rule: '规则',
      general: '通用',
    }[type] || type;
  }

  function stepKindLabel(kind) {
    return { local: '本地', agent: 'Agent', manual: '人工' }[kind] || kind || '-';
  }

  global.DWFormat = {
    escapeHtml,
    renderSimpleMarkdown,
    statusLabel,
    runStatusLabel,
    capabilityTypeLabel,
    stepKindLabel,
  };
})(window);
