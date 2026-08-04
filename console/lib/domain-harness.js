const fsp = require('fs/promises');
const path = require('path');

const DOMAIN_LOCK_FILE = '.workflow/domain.lock.json';
const DOMAIN_SUMMARY_FILE = 'context/domain-summary.md';

function parseYamlScalar(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text.replace(/\s+#.*$/, '').trim();
}

function parseModuleManifest(text) {
  const manifest = {
    name: '',
    description: '',
    status: '',
    entrypoints: {},
    memoryFiles: [],
    specPaths: [],
    skillPaths: [],
    contextPaths: [],
    workspacePaths: [],
    boundRepositories: [],
  };
  const aliases = {
    memory_files: 'memoryFiles',
    spec_paths: 'specPaths',
    skill_paths: 'skillPaths',
    context_paths: 'contextPaths',
    workspace_paths: 'workspacePaths',
  };
  let section = '';
  let currentRepository = null;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) {
      continue;
    }
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    if (indent === 0) {
      const match = line.match(/^([\w-]+):(?:\s*(.*))?$/);
      if (!match) {
        continue;
      }
      section = match[1];
      currentRepository = null;
      const target = aliases[section];
      if (target) {
        manifest[target] = [];
      } else if (section === 'bound_repositories') {
        manifest.boundRepositories = [];
      } else if (section === 'entrypoints') {
        manifest.entrypoints = {};
      } else if (Object.prototype.hasOwnProperty.call(manifest, section)) {
        manifest[section] = parseYamlScalar(match[2]);
      }
      continue;
    }
    if (section === 'entrypoints') {
      const match = line.match(/^([\w-]+):\s*(.*)$/);
      if (match) {
        manifest.entrypoints[match[1]] = parseYamlScalar(match[2]);
      }
      continue;
    }
    const target = aliases[section];
    if (target) {
      const match = line.match(/^-\s*(.*)$/);
      if (match) {
        manifest[target].push(parseYamlScalar(match[1]));
      }
      continue;
    }
    if (section === 'bound_repositories') {
      const firstField = line.match(/^-\s*([\w-]+):\s*(.*)$/);
      if (firstField && indent === 2) {
        currentRepository = { [firstField[1]]: parseYamlScalar(firstField[2]) };
        manifest.boundRepositories.push(currentRepository);
        continue;
      }
      const field = line.match(/^([\w-]+):\s*(.*)$/);
      if (field && currentRepository && indent === 4) {
        currentRepository[field[1]] = parseYamlScalar(field[2]);
      }
    }
  }
  return manifest;
}

function uniquePaths(paths) {
  const seen = new Set();
  return paths.filter((item) => {
    const key = String(item.path || item || '').toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function createDomainHarnessRuntime(deps) {
  const {
    exists,
    normalizeUserPath,
    gitHead,
    readWorkspaceConfig,
    writeWorkspaceConfig,
    writeWorkspaceJsonFile,
    writeWorkspaceTextFile,
  } = deps;

  async function collectMarkdownFiles(root, relativeDir, limit = 30) {
    const basePath = path.join(root, relativeDir);
    if (!(await exists(basePath))) {
      return [];
    }
    const results = [];
    async function walk(currentPath) {
      if (results.length >= limit) {
        return;
      }
      const entries = await fsp.readdir(currentPath, { withFileTypes: true }).catch(() => []);
      entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
      for (const entry of entries) {
        if (results.length >= limit) {
          return;
        }
        const child = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          await walk(child);
        } else if (/\.(md|mdx)$/i.test(entry.name)) {
          results.push(path.relative(root, child).replace(/\\/g, '/'));
        }
      }
    }
    await walk(basePath);
    return results;
  }

  async function inspectDomainHarness(rootValue) {
    const root = normalizeUserPath(rootValue || '');
    const manifestPath = path.join(root, '.module-manifest.yaml');
    if (!root || !(await exists(root))) {
      return {
        available: false,
        root,
        reason: root ? '领域 Harness 目录不存在' : '尚未选择领域 Harness 目录',
      };
    }
    if (!(await exists(manifestPath))) {
      return {
        available: false,
        root,
        reason: '未找到 .module-manifest.yaml，当前目录不是可挂载的领域 Harness',
      };
    }
    let manifest;
    try {
      manifest = parseModuleManifest(await fsp.readFile(manifestPath, 'utf8'));
    } catch {
      return {
        available: false,
        root,
        reason: '无法读取 .module-manifest.yaml',
      };
    }
    const codeRepositories = [];
    for (const repository of manifest.boundRepositories || []) {
      const directory = String(repository.directory || '').trim();
      const sourcePath = directory ? path.resolve(root, directory) : '';
      codeRepositories.push({
        id: String(repository.name || directory || '').trim(),
        name: String(repository.name || directory || '').trim(),
        description: String(repository.description || '').trim(),
        layer: String(repository.layer || '').trim(),
        directory: directory.replace(/\\/g, '/'),
        sourcePath,
        sourceExists: Boolean(sourcePath && await exists(sourcePath)),
        gitHttp: String(repository.git_http || '').trim(),
        gitSsh: String(repository.git_ssh || '').trim(),
      });
    }
    const skillPaths = uniquePaths((manifest.skillPaths || []).map((relativePath) => ({
      path: path.resolve(root, relativePath),
      relativePath: relativePath.replace(/\\/g, '/'),
    }))).map((item) => ({ ...item, exists: false }));
    for (const item of skillPaths) {
      item.exists = await exists(item.path);
    }
    const rules = await collectMarkdownFiles(root, 'rules');
    const productDocuments = await collectMarkdownFiles(root, 'docs/domain');
    const memoryDocuments = await collectMarkdownFiles(root, 'docs/memory');
    const catalogDocuments = await collectMarkdownFiles(root, 'catalog');
    const graphPath = path.join(root, 'graphify-out', 'graph.json');
    const declaredEntrypoints = Object.entries(manifest.entrypoints || {})
      .filter(([, value]) => value)
      .map(([id, relativePath]) => ({
        id,
        path: String(relativePath).replace(/\\/g, '/'),
        exists: false,
      }));
    for (const item of declaredEntrypoints) {
      item.exists = await exists(path.resolve(root, item.path));
    }
    const missing = [
      productDocuments.length ? '' : '未发现 docs/domain 下的产品文档',
      codeRepositories.length ? '' : 'manifest 未声明 bound_repositories',
    ].filter(Boolean);
    return {
      available: true,
      root,
      revision: await gitHead(root),
      manifestPath,
      manifest: {
        name: manifest.name || path.basename(root),
        description: manifest.description || '',
        status: manifest.status || '',
      },
      entrypoints: declaredEntrypoints,
      productDocuments,
      memoryDocuments,
      catalogDocuments,
      rules,
      skills: skillPaths,
      graph: {
        path: 'graphify-out/graph.json',
        exists: await exists(graphPath),
      },
      codeRepositories,
      missing,
      inspectedAt: new Date().toISOString(),
    };
  }

  function domainContextMarkdown(context) {
    const productDocuments = (context.productDocuments || []).map((item) => `- ${item}`);
    const memoryDocuments = (context.memoryDocuments || []).map((item) => `- ${item}`);
    const catalogDocuments = (context.catalogDocuments || []).map((item) => `- ${item}`);
    const rules = (context.rules || []).map((item) => `- ${item}`);
    const skills = (context.skills || []).map((item) => `- ${item.relativePath}${item.exists ? '' : '（未找到）'}`);
    const repositories = (context.codeRepositories || []).map((item) => [
      `- ${item.name || item.id}${item.layer ? `（${item.layer}）` : ''}`,
      item.description ? `：${item.description}` : '',
      item.directory ? `；目录 ${item.directory}` : '',
      item.sourceExists ? '；本地可读' : '；本地未就绪',
    ].join(''));
    return [
      '# Domain Harness Context Snapshot',
      '',
      `domain: ${context.manifest && context.manifest.name || ''}`,
      `root: ${context.root || ''}`,
      `revision: ${context.revision || 'unversioned'}`,
      `manifest: .module-manifest.yaml`,
      `attached_at: ${context.attachedAt || context.inspectedAt || ''}`,
      '',
      '## 阅读顺序',
      '',
      '1. 先读 PRD，确认目标行为和验收口径。',
      '2. 再读领域 Catalog，按业务场景、数据对象和运行时边界缩小影响范围。',
      '3. 再读产品白皮书与领域记忆，理解领域边界和历史风险。',
      '4. 必须回读本地可用代码，确认当前入口、真实约束和实现影响。',
      '5. Graphify 仅用于缩小检索范围，命中后仍需回读源码。',
      '',
      '## 领域 Catalog',
      catalogDocuments.join('\n') || '- 未发现；不得因缺失跳过 PRD、代码和人工确认。',
      '',
      '## 产品文档',
      productDocuments.join('\n') || '- 未发现',
      '',
      '## 领域记忆',
      memoryDocuments.join('\n') || '- 未发现',
      '',
      '## 绑定代码仓',
      repositories.join('\n') || '- manifest 未声明',
      '',
      '## 领域 Rules',
      rules.join('\n') || '- 未发现',
      '',
      '## 领域 Skills',
      skills.join('\n') || '- 未发现',
      '',
      '## Graphify',
      context.graph && context.graph.exists ? `- ${context.graph.path}` : '- 当前未生成 graph.json',
      '',
      '## 知识缺口',
      (context.missing || []).map((item) => `- ${item}`).join('\n') || '- 无基础缺口',
      '',
    ].join('\n');
  }

  async function attachDomainHarness({ workspacePath: workspacePathValue, domainRoot }) {
    const workspacePath = normalizeUserPath(workspacePathValue || '');
    if (!workspacePath || !(await exists(path.join(workspacePath, 'AGENTS.md')))) {
      throw new Error('请选择有效的 Delivery Workflow workspace');
    }
    const context = await inspectDomainHarness(domainRoot);
    if (!context.available) {
      throw new Error(context.reason || '领域 Harness 不可用');
    }
    const current = await readWorkspaceConfig(workspacePath);
    if (current.domain && current.domain.root && path.resolve(current.domain.root).toLowerCase() !== context.root.toLowerCase()) {
      throw new Error('一个 Workspace 只能挂载一个领域 Harness；如需跨领域，请拆分需求');
    }
    const localApps = (context.codeRepositories || [])
      .filter((item) => item.sourceExists && item.sourcePath)
      .map((item) => ({
        name: item.name || item.id,
        sourcePath: item.sourcePath,
        repoKey: item.id || item.name,
        role: item.description,
        type: 'java-backend',
      }));
    const apps = Array.from(new Map([...(current.apps || []), ...localApps].map((item) => [
      `${String(item.name || '').toLowerCase()}|${String(item.sourcePath || '').toLowerCase()}`,
      item,
    ])).values());
    const skills = uniquePaths([
      ...(current.skills || []).map((item) => ({ path: item })),
      ...(context.skills || []).filter((item) => item.exists).map((item) => ({ path: item.path })),
    ]).map((item) => item.path);
    const rules = uniquePaths([
      ...(current.rules || []).map((item) => ({ path: item })),
      ...(context.rules || []).map((item) => ({ path: path.resolve(context.root, item) })),
    ]).map((item) => item.path);
    const domain = {
      id: context.manifest.name || path.basename(context.root),
      name: context.manifest.name || path.basename(context.root),
      root: context.root,
      revision: context.revision,
      manifestPath: '.module-manifest.yaml',
      attachedAt: new Date().toISOString(),
    };
    const config = await writeWorkspaceConfig(workspacePath, {
      apps,
      skills,
      rules,
      domain,
      domainContext: {
        root: context.root,
        revision: context.revision,
        manifestPath: '.module-manifest.yaml',
        productDocuments: context.productDocuments,
        memoryDocuments: context.memoryDocuments,
        catalogDocuments: context.catalogDocuments,
        graph: context.graph,
        codeRepositories: context.codeRepositories,
        skills: context.skills.map((item) => item.relativePath),
        rules: context.rules,
      },
    });
    const lock = {
      schemaVersion: 1,
      ...context,
      attachedAt: domain.attachedAt,
    };
    await writeWorkspaceJsonFile(workspacePath, DOMAIN_LOCK_FILE, lock);
    await writeWorkspaceTextFile(workspacePath, DOMAIN_SUMMARY_FILE, domainContextMarkdown(lock));
    return { context: lock, config };
  }

  return {
    DOMAIN_LOCK_FILE,
    DOMAIN_SUMMARY_FILE,
    parseModuleManifest,
    inspectDomainHarness,
    attachDomainHarness,
    domainContextMarkdown,
  };
}

module.exports = {
  DOMAIN_LOCK_FILE,
  DOMAIN_SUMMARY_FILE,
  createDomainHarnessRuntime,
};
