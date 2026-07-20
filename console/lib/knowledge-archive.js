const path = require('path');

const KNOWLEDGE_PROPOSAL_FILE = 'archive/knowledge-update-proposal.json';
const KNOWLEDGE_PATCH_FILE = 'archive/knowledge-patch.md';

function safeFilePart(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'delivery-case';
}

function createKnowledgeArchiveRuntime(deps) {
  const {
    normalizeUserPath,
    exists,
    readWorkspaceConfig,
    readWorkspaceTextFileIfExists,
    readJsonFileIfExists,
    writeWorkspaceJsonFile,
    writeWorkspaceTextFile,
  } = deps;

  async function createKnowledgeUpdateProposal(workspacePathValue) {
    const workspacePath = normalizeUserPath(workspacePathValue);
    if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
      throw new Error('\u5f53\u524d\u76ee\u5f55\u4e0d\u662f\u6709\u6548\u7684 Delivery Workflow workspace');
    }

    const config = await readWorkspaceConfig(workspacePath);
    const context = config.whitepaperContext || {};
    const primary = context.primaryFunction;
    if (!primary) {
      throw new Error('\u7f3a\u5c11\u5df2\u786e\u8ba4\u529f\u80fd\u70b9\uff0c\u4e0d\u80fd\u751f\u6210\u767d\u76ae\u4e66\u66f4\u65b0\u63d0\u6848');
    }

    const domain = safeFilePart(primary.domain || 'general');
    const caseId = `${safeFilePart(config.demandName || path.basename(workspacePath))}-${new Date().toISOString().slice(0, 10)}`;
    const quality = await readJsonFileIfExists(workspacePath, '.workflow/quality-summary.json') || null;
    const knowledgeCard = await readWorkspaceTextFileIfExists(workspacePath, 'archive/knowledge-card.md');
    const targetCasePath = `domains/${domain}/cases/${caseId}.md`;
    const proposal = {
      status: 'pending-knowledge-owner-review',
      generatedAt: new Date().toISOString(),
      whitepaperRoot: context.root || '',
      whitepaperRevision: context.revision || '',
      primaryFunction: primary,
      relatedFunctions: context.relatedFunctions || [],
      whitepaperRefs: context.whitepaperRefs || [],
      riskTags: context.riskTags || [],
      qualityStatus: quality ? quality.status : 'not-generated',
      evidence: {
        qualitySummary: '.workflow/quality-summary.json',
        knowledgeCard: 'archive/knowledge-card.md',
      },
      suggestedChanges: [
        {
          action: 'create-or-update-case',
          target: targetCasePath,
          source: 'archive/knowledge-card.md',
        },
        {
          action: 'review-function-index',
          target: `domains/${domain}/function-index.json`,
          reason: '\u4ec5\u5728\u672c\u6b21\u529f\u80fd\u70b9\u3001\u522b\u540d\u3001\u98ce\u9669\u6216\u5173\u8054\u5e94\u7528\u53d1\u751f\u7a33\u5b9a\u53d8\u5316\u65f6\u66f4\u65b0\u3002',
        },
      ],
      mergePolicy: '\u77e5\u8bc6\u8d1f\u8d23\u4eba\u5ba1\u6838\u540e\uff0c\u901a\u8fc7\u767d\u76ae\u4e66 Git \u5206\u652f\u548c\u5408\u5e76\u8bf7\u6c42\u5165\u5e93\uff1bDelivery Workflow \u4e0d\u81ea\u52a8\u63d0\u4ea4\u6216\u5408\u5e76\u3002',
    };

    const patch = [
      '# \u767d\u76ae\u4e66\u77e5\u8bc6\u66f4\u65b0\u63d0\u6848',
      '',
      `- \u72b6\u6001\uff1a${proposal.status}`,
      `- \u529f\u80fd\u70b9\uff1a${primary.name} (${primary.id})`,
      `- \u767d\u76ae\u4e66\u7248\u672c\uff1a${proposal.whitepaperRevision || '\u672a\u8bc6\u522b'}`,
      `- \u8d28\u91cf\u72b6\u6001\uff1a${proposal.qualityStatus}`,
      '',
      '## \u5efa\u8bae\u53d8\u66f4',
      '',
      `1. \u5c06\u672c\u6b21\u6848\u4f8b\u6574\u7406\u5230 ${targetCasePath}\u3002`,
      '2. \u4ec5\u5728\u53d1\u73b0\u7a33\u5b9a\u3001\u53ef\u590d\u7528\u7684\u9886\u57df\u53d8\u5316\u65f6\u66f4\u65b0 function-index.json\u3002',
      '3. \u77e5\u8bc6\u8d1f\u8d23\u4eba\u5ba1\u6838\u540e\u81ea\u884c\u521b\u5efa Git \u5206\u652f\u3001\u63d0\u4ea4\u548c\u5408\u5e76\u8bf7\u6c42\uff1b\u7981\u6b62\u7531\u672c\u5de5\u5177\u81ea\u52a8\u5408\u5e76\u3002',
      '',
      '## \u9886\u57df\u98ce\u9669',
      '',
      ...(proposal.riskTags.length ? proposal.riskTags.map((item) => `- ${item}`) : ['- \u65e0\u65b0\u589e\u98ce\u9669\u6807\u7b7e\u3002']),
      '',
      '## \u4ea4\u4ed8\u77e5\u8bc6\u5361\u6458\u8981',
      '',
      knowledgeCard.trim() || '\u5f85\u8865\u5145 archive/knowledge-card.md\u3002',
      '',
    ].join('\n');

    await writeWorkspaceJsonFile(workspacePath, KNOWLEDGE_PROPOSAL_FILE, proposal);
    await writeWorkspaceTextFile(workspacePath, KNOWLEDGE_PATCH_FILE, patch);
    return proposal;
  }

  return {
    createKnowledgeUpdateProposal,
  };
}

module.exports = {
  KNOWLEDGE_PROPOSAL_FILE,
  KNOWLEDGE_PATCH_FILE,
  createKnowledgeArchiveRuntime,
};
