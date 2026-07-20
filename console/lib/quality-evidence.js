const path = require('path');

const QUALITY_SUMMARY_FILE = '.workflow/quality-summary.json';

function countSeverities(text) {
  const source = String(text || '');
  return ['P0', 'P1', 'P2', 'P3'].reduce((result, severity) => ({
    ...result,
    [severity]: (source.match(new RegExp(`\\b${severity}\\b`, 'g')) || []).length,
  }), {});
}

function createQualityEvidenceRuntime(deps) {
  const {
    normalizeUserPath,
    exists,
    readWorkspaceConfig,
    readWorkspaceTextFileIfExists,
    writeWorkspaceJsonFile,
  } = deps;

  async function refreshQualitySummary(workspacePathValue) {
    const workspacePath = normalizeUserPath(workspacePathValue);
    if (!(await exists(path.join(workspacePath, 'AGENTS.md')))) {
      throw new Error('当前目录不是有效的 Delivery Workflow workspace');
    }
    const config = await readWorkspaceConfig(workspacePath);
    const files = [
      ['aiReview', 'review/ai-review.md'],
      ['riskList', 'review/risk-list.md'],
      ['unitTestPlan', 'review/unit-test-plan.md'],
      ['unitTestResult', 'review/unit-test-result.md'],
    ];
    const evidence = {};
    let combinedText = '';
    for (const [id, relativePath] of files) {
      const content = await readWorkspaceTextFileIfExists(workspacePath, relativePath);
      evidence[id] = {
        path: relativePath,
        exists: Boolean(content.trim()),
      };
      combinedText += `\n${content}`;
    }
    const severities = countSeverities(combinedText);
    const requiredEvidenceReady = evidence.aiReview.exists
      && evidence.riskList.exists
      && evidence.unitTestPlan.exists
      && evidence.unitTestResult.exists;
    const status = severities.P0 > 0
      ? 'blocked'
      : requiredEvidenceReady
        ? 'ready'
        : 'incomplete';
    const whitepaper = config.whitepaperContext || {};
    const summary = {
      generatedAt: new Date().toISOString(),
      status,
      functionPoint: whitepaper.primaryFunction || null,
      whitepaperRisks: whitepaper.riskTags || [],
      evidence,
      severities,
      requiredEvidenceReady,
      nextAction: status === 'blocked'
        ? '处理 P0 问题后重新执行质量门禁。'
        : status === 'ready'
          ? '质量证据已齐备，可以进入上线准备与归档。'
          : '补齐 Review、风险清单、单测计划和单测结果。',
    };
    await writeWorkspaceJsonFile(workspacePath, QUALITY_SUMMARY_FILE, summary);
    return summary;
  }

  return {
    refreshQualitySummary,
  };
}

module.exports = {
  QUALITY_SUMMARY_FILE,
  createQualityEvidenceRuntime,
};
