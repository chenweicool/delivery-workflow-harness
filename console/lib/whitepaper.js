const fsp = require('fs/promises');
const path = require('path');

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createWhitepaperRuntime(deps) {
  const { exists, normalizeUserPath, gitHead } = deps;

  async function readJsonIfExists(filePath) {
    if (!(await exists(filePath))) {
      return null;
    }
    try {
      return JSON.parse(await fsp.readFile(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  async function readIndexFiles(root, fileName) {
    const candidates = [path.join(root, fileName)];
    const domainsDir = path.join(root, 'domains');
    if (await exists(domainsDir)) {
      const entries = await fsp.readdir(domainsDir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.isDirectory()) {
          candidates.push(path.join(domainsDir, entry.name, fileName));
        }
      }
    }
    const result = [];
    for (const candidate of candidates) {
      const data = await readJsonIfExists(candidate);
      if (data) {
        result.push({ path: candidate, data });
      }
    }
    return result;
  }

  function normalizeFunction(raw, sourcePath, catalogRoot) {
    const id = String(raw && (raw.id || raw.functionId || raw.name) || '').trim();
    if (!id) {
      return null;
    }
    const domain = String(raw.domain || path.basename(path.dirname(sourcePath)) || '').trim();
    const defaultWhitepaperPath = path.join(path.dirname(sourcePath), 'whitepaper.md');
    const whitepaperRefs = normalizeStringList(raw.whitepaperRefs || raw.whitepaperRef);
    if (!whitepaperRefs.length) {
      whitepaperRefs.push(path.relative(catalogRoot, defaultWhitepaperPath).replace(/\\/g, '/'));
    }
    return {
      id,
      name: String(raw.name || id).trim(),
      aliases: normalizeStringList(raw.aliases),
      domain,
      description: String(raw.description || '').trim(),
      whitepaperRefs,
      relatedAppIds: normalizeStringList(raw.relatedAppIds || raw.appIds || raw.apps),
      riskTags: normalizeStringList(raw.riskTags || raw.risks),
      recommendedCapabilities: normalizeStringList(raw.recommendedCapabilities || raw.capabilities),
      sourcePath,
    };
  }

  function normalizeApplication(raw, sourcePath) {
    const id = String(raw && (raw.id || raw.appId || raw.repoKey || raw.name) || '').trim();
    if (!id) {
      return null;
    }
    return {
      id,
      name: String(raw.name || id).trim(),
      repoKey: String(raw.repoKey || id).trim(),
      sourcePath: String(raw.sourcePath || raw.defaultRelativePath || raw.relativePath || '').trim(),
      localDiscovery: raw.localDiscovery && typeof raw.localDiscovery === 'object' ? raw.localDiscovery : {},
      remote: raw.remote && typeof raw.remote === 'object' ? raw.remote : {},
      baseBranch: String(raw.baseBranch || (raw.remote && raw.remote.baseBranch) || '').trim(),
      type: String(raw.type || (raw.tech && raw.tech.type) || '').trim(),
      role: String(raw.role || '').trim(),
      testCommand: String(raw.testCommand || (raw.tech && raw.tech.testCommand) || '').trim(),
      sourceIndexPath: sourcePath,
    };
  }

  async function readWhitepaperCatalog(rootValue) {
    const root = normalizeUserPath(rootValue || '');
    if (!root || !(await exists(root))) {
      return {
        available: false,
        root,
        reason: root ? '白皮书仓库不存在' : '尚未配置白皮书仓库',
        revision: '',
        functions: [],
        applications: [],
      };
    }

    const functionIndexes = await readIndexFiles(root, 'function-index.json');
    const applicationIndexes = await readIndexFiles(root, 'application-index.json');
    const functions = [];
    const applications = [];
    for (const index of functionIndexes) {
      const entries = Array.isArray(index.data) ? index.data : (Array.isArray(index.data.functions) ? index.data.functions : []);
      for (const entry of entries) {
        const normalized = normalizeFunction(entry || {}, index.path, root);
        if (normalized) {
          functions.push(normalized);
        }
      }
    }
    for (const index of applicationIndexes) {
      const entries = Array.isArray(index.data) ? index.data : (Array.isArray(index.data.apps) ? index.data.apps : []);
      for (const entry of entries) {
        const normalized = normalizeApplication(entry || {}, index.path);
        if (normalized) {
          applications.push(normalized);
        }
      }
    }
    const dedupeById = (items) => Array.from(new Map(items.map((item) => [item.id.toLowerCase(), item])).values());
    return {
      available: functionIndexes.length > 0 || applicationIndexes.length > 0,
      root,
      reason: functionIndexes.length || applicationIndexes.length ? '' : '未找到 function-index.json 或 application-index.json',
      revision: await gitHead(root),
      functions: dedupeById(functions).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
      applications: dedupeById(applications).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
      indexFiles: {
        functions: functionIndexes.map((item) => path.relative(root, item.path).replace(/\\/g, '/')),
        applications: applicationIndexes.map((item) => path.relative(root, item.path).replace(/\\/g, '/')),
      },
    };
  }

  function matchFunctions(catalog, query) {
    const text = String(query || '').trim().toLowerCase();
    const candidates = (catalog.functions || []).map((item) => {
      const terms = [item.id, item.name, ...item.aliases].map((value) => String(value || '').toLowerCase());
      const score = !text ? 1 : terms.reduce((best, term) => {
        if (term === text) return Math.max(best, 100);
        if (term.startsWith(text)) return Math.max(best, 70);
        if (term.includes(text)) return Math.max(best, 50);
        return best;
      }, 0);
      return { ...item, score };
    }).filter((item) => item.score > 0);
    return candidates.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, 'zh-CN')).slice(0, 20);
  }

  function resolveWhitepaperContext(catalog, primaryFunctionId, relatedFunctionIds = []) {
    const byId = new Map((catalog.functions || []).map((item) => [item.id.toLowerCase(), item]));
    const primary = byId.get(String(primaryFunctionId || '').trim().toLowerCase());
    if (!primary) {
      throw new Error('请先从已配置的白皮书功能索引中选择功能点');
    }
    const selected = [primary];
    for (const relatedId of normalizeStringList(relatedFunctionIds)) {
      const candidate = byId.get(relatedId.toLowerCase());
      if (candidate && !selected.some((item) => item.id === candidate.id)) {
        selected.push(candidate);
      }
    }
    const applicationIds = Array.from(new Set(selected.flatMap((item) => item.relatedAppIds)));
    const appById = new Map((catalog.applications || []).map((item) => [item.id.toLowerCase(), item]));
    const applications = applicationIds.map((id) => appById.get(id.toLowerCase())).filter(Boolean);
    return {
      root: catalog.root,
      revision: catalog.revision,
      resolvedAt: new Date().toISOString(),
      primaryFunction: primary,
      relatedFunctions: selected.slice(1),
      whitepaperRefs: Array.from(new Set(selected.flatMap((item) => item.whitepaperRefs))),
      riskTags: Array.from(new Set(selected.flatMap((item) => item.riskTags))),
      recommendedCapabilities: Array.from(new Set(selected.flatMap((item) => item.recommendedCapabilities))),
      applications,
      unresolvedApplicationIds: applicationIds.filter((id) => !appById.has(id.toLowerCase())),
    };
  }

  function whitepaperContextMarkdown(context) {
    const functionLines = [context.primaryFunction, ...(context.relatedFunctions || [])]
      .filter(Boolean)
      .map((item) => `- ${item.name} (${item.id})`);
    const appLines = (context.applications || []).map((item) => `- ${item.name} (${item.id})`);
    return [
      '# Whitepaper Context Snapshot',
      '',
      `repository: ${context.root || ''}`,
      `revision: ${context.revision || 'unversioned'}`,
      `resolved_at: ${context.resolvedAt || ''}`,
      '',
      '## Confirmed Function Points',
      functionLines.join('\n') || '- none',
      '',
      '## Whitepaper References',
      (context.whitepaperRefs || []).map((item) => `- ${item}`).join('\n') || '- none',
      '',
      '## Related Applications',
      appLines.join('\n') || '- none',
      '',
      '## Risk Tags',
      (context.riskTags || []).map((item) => `- ${item}`).join('\n') || '- none',
      '',
      '## Recommended Capabilities',
      (context.recommendedCapabilities || []).map((item) => `- ${item}`).join('\n') || '- none',
      '',
    ].join('\n');
  }

  return {
    readWhitepaperCatalog,
    matchFunctions,
    resolveWhitepaperContext,
    whitepaperContextMarkdown,
  };
}

module.exports = {
  createWhitepaperRuntime,
};
