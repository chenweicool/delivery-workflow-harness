const path = require('path');

function normalizeCapabilityList(value) {
  const result = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (!item) continue;
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) result.push({ id: text, name: path.basename(text), path: text, type: 'skill', installed: false, enabled: false });
      continue;
    }
    const id = String(item.id || item.name || item.path || '').trim();
    const rawPath = String(item.path || item.file || item.dir || '').trim();
    if (!id && !rawPath) continue;
    const type = String(item.type || '').trim() || 'skill';
    const installed = type === 'rule' || item.installed === true;
    result.push({
      id: id || rawPath,
      type,
      name: String(item.name || id || path.basename(rawPath)).trim(),
      description: String(item.description || '').trim(),
      path: rawPath,
      appliesToSteps: Array.isArray(item.appliesToSteps) ? item.appliesToSteps.map(String).filter(Boolean) : [],
      capabilityTypes: Array.isArray(item.capabilityTypes) ? item.capabilityTypes.map(String).filter(Boolean) : [],
      fallback: String(item.fallback || '').trim(),
      requiredFor: Array.isArray(item.requiredFor) ? item.requiredFor.map(String).filter(Boolean) : [],
      installed,
      enabled: installed && item.enabled === true,
      selectionSource: String(item.selectionSource || '').trim(),
    });
  }
  return result;
}

function capabilityPathValue(entry) { return entry && typeof entry === 'object' ? entry.path || entry.id || entry.name || '' : entry; }
function capabilityDisplayName(entry) { return entry && typeof entry === 'object' ? `${entry.name || entry.id || entry.path}${entry.path ? ` (${entry.path})` : ''}` : String(entry || ''); }
function classifyCapability(text) {
  const value = String(text || '').toLowerCase();
  if (/(prd|word|docx|feishu|document)/.test(value)) return 'prd-convert';
  if (/code-review|代码评审|risk|资损|回归/.test(value)) return 'code-review';
  if (/api-doc|接口文档|openapi/.test(value)) return 'api-doc';
  if (/unit-test|junit|mockito|单元测试|单测/.test(value)) return 'unit-test';
  if (/rule|rules|规范|约束/.test(value)) return 'rule';
  return 'general';
}
function stepAllowedCapabilityTypes(stepId, workflow = null) {
  const configured = workflow && workflow.steps && workflow.steps[stepId] && workflow.steps[stepId].metadata ? workflow.steps[stepId].metadata.capabilityTypes : null;
  return new Set(Array.isArray(configured) && configured.length ? configured : ['rule', 'general']);
}

module.exports = { normalizeCapabilityList, capabilityPathValue, capabilityDisplayName, classifyCapability, stepAllowedCapabilityTypes };
