const fsp = require('fs/promises');
const path = require('path');
const { normalizeUserPath } = require('./fs-utils');

function normalizeTextList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === 'object') {
          return String(item.path || item.id || item.name || '').trim();
        }
        return String(item || '').trim();
      })
      .filter(Boolean);
  }
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeNamedPaths(value) {
  const result = [];
  const seen = new Set();
  const source = Array.isArray(value) ? value : [];
  for (const item of source) {
    const rawPath = item && item.path ? String(item.path).trim() : '';
    if (!rawPath) {
      continue;
    }
    const normalizedPath = normalizeUserPath(rawPath);
    const name = String(item.name || path.basename(normalizedPath)).trim();
    const description = String(item.description || '').trim();
    const key = `${name.toLowerCase()}|${normalizedPath.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ name, path: normalizedPath, description });
  }
  return result;
}

function createCapabilityRoutingRuntime(deps) {
  const {
    exists,
    ensureDir,
    assertWithin,
    sanitizeName,
    copyRecursive,
    capabilityPathValue,
    capabilityDisplayName,
    classifyCapability,
    stepAllowedCapabilityTypes,
  } = deps;

function capabilityAliases(entry) {
  const value = capabilityPathValue(entry);
  const baseName = path.basename(String(value || '')).replace(/\.(md|json)$/i, '');
  return [
    entry && typeof entry === 'object' ? entry.id : '',
    entry && typeof entry === 'object' ? entry.name : '',
    value,
    baseName,
  ].map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
}

function dedupeCapabilities(entries) {
  const seen = new Map();
  for (const entry of entries || []) {
    const key = `${entry && entry.type ? entry.type : ''}|${String(capabilityPathValue(entry) || '').toLowerCase()}`;
    if (!key || key.endsWith('|')) {
      continue;
    }
    const existing = seen.get(key);
    if (!existing || (entry && entry.selectionSource === 'whitepaper')) {
      seen.set(key, entry);
    }
  }
  return Array.from(seen.values());
}

function asCapabilityEntry(entry, type) {
  if (entry && typeof entry === 'object') {
    return { ...entry, type: entry.type || type };
  }
  const value = String(entry || '').trim();
  return {
    id: path.basename(value).replace(/\.(md|json)$/i, ''),
    name: path.basename(value),
    path: value,
    type,
  };
}

function safeLinkName(sourcePath, fallback) {
  const base = sanitizeName(path.basename(sourcePath || '') || fallback || 'item');
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

async function createSymlinkOrCopy(sourcePath, linkPath) {
  await ensureDir(path.dirname(linkPath));
  if (await exists(linkPath)) {
    return;
  }
  const stat = await fsp.stat(sourcePath);
  try {
    await fsp.symlink(sourcePath, linkPath, process.platform === 'win32' && stat.isDirectory() ? 'junction' : stat.isDirectory() ? 'dir' : 'file');
  } catch {
    if (stat.isDirectory()) {
      await copyRecursive(sourcePath, linkPath);
    } else {
      await ensureDir(path.dirname(linkPath));
      await fsp.copyFile(sourcePath, linkPath);
    }
  }
}

async function linkExternalCapability(workspacePath, value, kind) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const candidate = path.isAbsolute(raw) ? raw : path.resolve(workspacePath, raw);
  if (!(await exists(candidate))) {
    return raw;
  }
  const relativeToWorkspace = path.relative(workspacePath, candidate);
  if (!relativeToWorkspace.startsWith('..') && !path.isAbsolute(relativeToWorkspace)) {
    return relativeToWorkspace.replace(/\\/g, '/');
  }
  const linkRoot = kind === 'rules'
    ? path.join(workspacePath, 'context', 'rules', 'linked')
    : path.join(workspacePath, 'context', 'skills', 'linked');
  await ensureDir(linkRoot);
  const existingEntries = await fsp.readdir(linkRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of existingEntries) {
    const linkPath = path.join(linkRoot, entry.name);
    try {
      const real = await fsp.realpath(linkPath);
      if (real.toLowerCase() === path.resolve(candidate).toLowerCase()) {
        return path.relative(workspacePath, linkPath).replace(/\\/g, '/');
      }
    } catch {
      // Ignore damaged links and create a new one below.
    }
  }
  const linkName = safeLinkName(candidate, kind);
  const linkPath = path.join(linkRoot, linkName);
  assertWithin(workspacePath, linkPath);
  await createSymlinkOrCopy(candidate, linkPath);
  return path.relative(workspacePath, linkPath).replace(/\\/g, '/');
}

async function linkCapabilityEntry(workspacePath, entry, kind) {
  if (entry && typeof entry === 'object') {
    const rawPath = String(capabilityPathValue(entry) || '').trim();
    const candidate = path.isAbsolute(rawPath) ? rawPath : path.resolve(workspacePath, rawPath);
    const available = Boolean(rawPath && await exists(candidate));
    const linkedPath = available ? await linkExternalCapability(workspacePath, rawPath, kind) : '';
    return {
      ...entry,
      path: linkedPath || entry.path || '',
      availability: available ? 'available' : 'unavailable',
    };
  }
  return linkExternalCapability(workspacePath, entry, kind);
}

async function linkGlobalCapabilities(workspacePath, tools) {
  const skills = [];
  const rules = [];
  for (const item of normalizeTextList(tools.globalSkills)) {
    skills.push(await linkExternalCapability(workspacePath, item, 'skills'));
  }
  for (const item of normalizeTextList(tools.globalRules)) {
    rules.push(await linkExternalCapability(workspacePath, item, 'rules'));
  }
  return {
    skills: skills.filter(Boolean),
    rules: rules.filter(Boolean),
    notes: String(tools.globalNotes || '').trim(),
  };
}

async function linkConfiguredCapabilities(workspacePath, tools, config) {
  const recommendedIds = new Set(
    (((config.whitepaperContext || {}).recommendedCapabilities) || [])
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const markSelection = (entry) => {
    if (!entry || typeof entry !== 'object') {
      return entry;
    }
    return capabilityAliases(entry).some((alias) => recommendedIds.has(alias))
      ? { ...entry, selectionSource: 'whitepaper' }
      : entry;
  };
  const skills = [];
  const rules = [];
  for (const item of [
    ...normalizeTextList(tools.globalSkills),
    ...normalizeTextList(config.skills),
  ]) {
    skills.push(await linkCapabilityEntry(workspacePath, markSelection(asCapabilityEntry(item, 'skill')), 'skills'));
  }
  for (const item of (config.capabilities || []).filter((capability) => capability.type === 'skill')) {
    skills.push(await linkCapabilityEntry(workspacePath, markSelection(asCapabilityEntry(item, 'skill')), 'skills'));
  }
  for (const item of [
    ...normalizeTextList(tools.globalRules),
    ...normalizeTextList(config.rules),
  ]) {
    rules.push(await linkCapabilityEntry(workspacePath, markSelection(asCapabilityEntry(item, 'rule')), 'rules'));
  }
  for (const item of (config.capabilities || []).filter((capability) => capability.type === 'rule')) {
    rules.push(await linkCapabilityEntry(workspacePath, markSelection(asCapabilityEntry(item, 'rule')), 'rules'));
  }
  const notes = [
    tools.teamName ? `团队：${tools.teamName}` : '',
    normalizeTextList(tools.templates).length ? `团队模板：\n${normalizeTextList(tools.templates).map((item) => `- ${item}`).join('\n')}` : '',
    String(tools.globalNotes || '').trim(),
    config.branchPattern ? `分支规则：${config.branchPattern}` : '',
    String(config.notes || '').trim(),
  ].filter(Boolean).join('\n');
  const resolved = dedupeCapabilities([...skills, ...rules].filter(Boolean));
  const resolvedRecommendedIds = new Set(resolved
    .filter((entry) => entry && typeof entry === 'object' && entry.selectionSource === 'whitepaper' && entry.availability !== 'unavailable')
    .flatMap((entry) => capabilityAliases(entry))
    .filter((alias) => recommendedIds.has(alias)));
  return {
    skills: resolved.filter((entry) => entry.type === 'skill'),
    rules: resolved.filter((entry) => entry.type === 'rule'),
    notes,
    selection: {
      requestedIds: Array.from(recommendedIds),
      resolvedIds: Array.from(resolvedRecommendedIds),
      missingIds: Array.from(recommendedIds).filter((id) => !resolvedRecommendedIds.has(id)),
    },
  };
}

async function capabilitySearchText(workspacePath, entry) {
  const value = String(capabilityPathValue(entry) || '').trim();
  if (!value) {
    return '';
  }
  const candidate = path.isAbsolute(value) ? value : path.resolve(workspacePath, value);
  const parts = [
    value,
    capabilityDisplayName(entry),
    entry && typeof entry === 'object' ? entry.description || '' : '',
    path.basename(value).replace(/[-_]/g, ' '),
  ];
  if (await exists(candidate)) {
    const stat = await fsp.stat(candidate);
    const files = stat.isDirectory()
      ? ['SKILL.md', 'README.md'].map((name) => path.join(candidate, name))
      : [candidate];
    for (const file of files) {
      if (await exists(file)) {
        try {
          parts.push((await fsp.readFile(file, 'utf8')).slice(0, 4000));
        } catch {
          // Ignore unreadable capability docs.
        }
      }
    }
  }
  return parts.join('\n').toLowerCase();
}

async function routeCapabilitiesForStep(workspacePath, stepId, capabilities, workflow = null) {
  const allowedTypes = stepAllowedCapabilityTypes(stepId, workflow);
  const matchEntries = async (entries) => {
    const enabled = [];
    const disabled = [];
    for (const entry of entries || []) {
      if (entry && typeof entry === 'object' && entry.availability === 'unavailable') {
        disabled.push(entry);
        continue;
      }
      if (entry && typeof entry === 'object' && entry.enabled === false) {
        disabled.push(entry);
        continue;
      }
      const explicitSteps = entry && typeof entry === 'object' && Array.isArray(entry.appliesToSteps)
        ? entry.appliesToSteps
        : [];
      if (explicitSteps.length) {
        (explicitSteps.includes(stepId) ? enabled : disabled).push(entry);
        continue;
      }
      const explicitTypes = entry && typeof entry === 'object' && Array.isArray(entry.capabilityTypes)
        ? entry.capabilityTypes
        : [];
      if (explicitTypes.length) {
        (explicitTypes.some((type) => allowedTypes.has(type)) ? enabled : disabled).push(entry);
        continue;
      }
      const text = await capabilitySearchText(workspacePath, entry);
      const type = classifyCapability(text);
      const matched = allowedTypes.has(type);
      (matched ? enabled : disabled).push(entry);
    }
    return { enabled, disabled };
  };
  const skillResult = await matchEntries(capabilities.skills || []);
  const ruleResult = await matchEntries(capabilities.rules || []);
  return {
    enabled: {
      skills: skillResult.enabled,
      rules: ruleResult.enabled,
      notes: capabilities.notes || '',
    },
    disabled: {
      skills: skillResult.disabled,
      rules: ruleResult.disabled,
    },
    selection: {
      ...(capabilities.selection || {}),
      enabledIds: [...skillResult.enabled, ...ruleResult.enabled]
        .filter((entry) => entry && entry.selectionSource === 'whitepaper')
        .map((entry) => entry.id || entry.name || capabilityPathValue(entry)),
      unavailableIds: [...skillResult.disabled, ...ruleResult.disabled]
        .filter((entry) => entry && entry.availability === 'unavailable')
        .map((entry) => entry.id || entry.name || capabilityPathValue(entry)),
    },
  };
}

  return {
    linkExternalCapability,
    linkCapabilityEntry,
    linkGlobalCapabilities,
    linkConfiguredCapabilities,
    capabilitySearchText,
    routeCapabilitiesForStep,
  };
}

module.exports = {
  normalizeTextList,
  normalizeNamedPaths,
  createCapabilityRoutingRuntime,
};
