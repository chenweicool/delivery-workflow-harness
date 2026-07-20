const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createWhitepaperRuntime } = require('../console/lib/whitepaper');

async function main() {
  const root = path.resolve(__dirname, '..', 'team-config.example');
  const runtime = createWhitepaperRuntime({
    exists: async (target) => fs.existsSync(target),
    normalizeUserPath: (target) => path.resolve(target),
    gitHead: async () => 'fixture-revision',
  });
  const catalog = await runtime.readWhitepaperCatalog(root);
  assert.equal(catalog.available, true, 'example catalog should be available');
  assert.equal(catalog.functions.length, 1, 'example function should load');
  assert.equal(catalog.applications.length, 1, 'example application should load');
  const matches = runtime.matchFunctions(catalog, '金额调整');
  assert.equal(matches[0].id, 'settlement.bill-adjustment', 'alias should match');
  const context = runtime.resolveWhitepaperContext(catalog, 'settlement.bill-adjustment');
  assert.equal(context.applications[0].id, 'settlement-service', 'function should resolve application');
  assert(context.whitepaperRefs.includes('domains/settlement/whitepaper.md'), 'whitepaper reference should be root-relative');
  console.log('whitepaper catalog check passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
