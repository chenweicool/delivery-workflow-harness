const path = require('path');

function normalizeCapabilityList(value) {
  const result = [];
  const source = Array.isArray(value) ? value : [];
  for (const item of source) {
    if (!item) {
      continue;
    }
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) {
        result.push({ id: text, name: path.basename(text), path: text, type: 'skill', installed: false, enabled: false });
      }
      continue;
    }
    if (typeof item === 'object') {
      const id = String(item.id || item.name || item.path || '').trim();
      const rawPath = String(item.path || item.file || item.dir || '').trim();
      if (!id && !rawPath) {
        continue;
      }
      result.push({
        id: id || rawPath,
        type: String(item.type || '').trim() || 'skill',
        name: String(item.name || id || path.basename(rawPath)).trim(),
        description: String(item.description || '').trim(),
        path: rawPath,
        appliesToSteps: Array.isArray(item.appliesToSteps) ? item.appliesToSteps.map(String).filter(Boolean) : [],
        capabilityTypes: Array.isArray(item.capabilityTypes) ? item.capabilityTypes.map(String).filter(Boolean) : [],
        fallback: String(item.fallback || '').trim(),
        requiredFor: Array.isArray(item.requiredFor) ? item.requiredFor.map(String).filter(Boolean) : [],
        installed: String(item.type || '').trim() === 'rule' ? true : item.installed === true,
        enabled: String(item.type || '').trim() === 'rule' ? item.enabled !== false : item.installed === true && item.enabled === true,
        selectionSource: String(item.selectionSource || '').trim(),
      });
    }
  }
  return result;
}

function capabilityPathValue(entry) {
  if (entry && typeof entry === 'object') {
    return entry.path || entry.id || entry.name || '';
  }
  return entry;
}

function capabilityDisplayName(entry) {
  if (entry && typeof entry === 'object') {
    const suffix = entry.path ? ` (${entry.path})` : '';
    return `${entry.name || entry.id || entry.path}${suffix}`;
  }
  return String(entry || '');
}

function classifyCapability(text) {
  const value = String(text || '').toLowerCase();
  if (/(prd|word|docx|feishu).*(md|markdown)|word-to-md|prd-word|feishu-word|document/.test(value)) {
    return 'prd-convert';
  }
  if (/code-review|代码评审|risk taxonomy|资损|回归风险/.test(value)) {
    return 'code-review';
  }
  if (/api-doc|接口文档|controller|request\/response|dto|openapi/.test(value)) {
    return 'api-doc';
  }
  if (/unit-test|java-unit|junit|mockito|单元测试|单测/.test(value)) {
    return 'unit-test';
  }
  if (/rule|rules|规范|约束|coding standard/.test(value)) {
    return 'rule';
  }
  return 'general';
}

function stepAllowedCapabilityTypes(stepId, workflow = null) {
  const configured = workflow && workflow.steps && workflow.steps[stepId] && workflow.steps[stepId].metadata
    ? workflow.steps[stepId].metadata.capabilityTypes
    : null;
  if (Array.isArray(configured) && configured.length) {
    return new Set(configured);
  }
  return {
    'import-prd': new Set(['prd-convert']),
    '00-load-context': new Set(['rule']),
    '01-clarify-requirement': new Set(['prd-convert', 'rule']),
    '02-generate-technical-design': new Set(['api-doc', 'rule']),
    '05-split-tasks': new Set(['rule']),
    '06-implement-task': new Set(['unit-test', 'api-doc', 'rule']),
    '07-review-code': new Set(['code-review', 'rule']),
    '08-delivery-summary': new Set(['rule']),
  }[stepId] || new Set(['rule']);
}

module.exports = {
  normalizeCapabilityList,
  capabilityPathValue,
  capabilityDisplayName,
  classifyCapability,
  stepAllowedCapabilityTypes,
};
