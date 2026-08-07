#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_DIRECTORIES = ['bin', 'console', 'scripts'];
const PRIVATE_ADDRESS_PATTERNS = [
  /\b10\.(?:\d{1,3}\.){2}\d{1,3}\b/g,
  /\b192\.168\.(?:\d{1,3}\.)\d{1,3}\b/g,
  /\b172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3}\b/g,
];

function collectJavaScriptFiles(directory) {
  const absoluteDirectory = path.join(ROOT_DIR, directory);
  const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectJavaScriptFiles(relativePath);
    }
    return entry.isFile() && entry.name.endsWith('.js') ? [relativePath] : [];
  });
}

function findPrivateAddresses(filePath) {
  const content = fs.readFileSync(path.join(ROOT_DIR, filePath), 'utf8');
  return PRIVATE_ADDRESS_PATTERNS.flatMap((pattern) => content.match(pattern) || []);
}

const violations = SOURCE_DIRECTORIES
  .flatMap(collectJavaScriptFiles)
  .flatMap((filePath) => findPrivateAddresses(filePath).map((address) => ({ filePath, address })));

if (violations.length) {
  console.error('Private network addresses must not be committed in JavaScript source or tests:');
  for (const violation of violations) {
    console.error(`- ${violation.filePath}: ${violation.address}`);
  }
  process.exit(1);
}

console.log('Private endpoint check passed');
