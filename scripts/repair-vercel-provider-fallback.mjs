import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(path.join(root, 'lib', 'ai', 'provider-fallback.ts'))) {
  console.error('Run this script from the LeonardX repository root. No files were changed.');
  process.exit(2);
}

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.next', 'out', 'dist', 'build'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll(path.sep, '/');
    if (entry.isDirectory()) walk(full, results);
    else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name) && rel !== 'provider-fallback.ts' && !rel.startsWith('tmp/leo_patch/')) results.push({ full, rel });
  }
  return results;
}

const changes = [];
const rootDuplicate = path.join(root, 'provider-fallback.ts');
if (fs.existsSync(rootDuplicate)) {
  const content = fs.readFileSync(rootDuplicate, 'utf8');
  if (!content.includes("'./model-catalog.ts'") && !content.includes('"./model-catalog.ts"')) {
    console.error('Refusing to remove root provider-fallback.ts: it does not match the known misplaced duplicate. Inspect it manually.');
    process.exit(3);
  }
  const rootImportPattern = /(?:from\s*|import\s*\()\s*['"](?:\.\/|\.\.\/)*provider-fallback(?:\.ts)?['"]/;
  const references = [];
  for (const file of walk(root)) {
    const text = fs.readFileSync(file.full, 'utf8');
    if (rootImportPattern.test(text)) references.push(file.rel);
  }
  if (references.length) {
    console.error('Refusing to remove root duplicate because possible imports were found in:');
    for (const file of references) console.error(` - ${file}`);
    process.exit(4);
  }
  fs.unlinkSync(rootDuplicate);
  changes.push('Removed unreferenced root-level provider-fallback.ts');
} else {
  changes.push('Root-level provider-fallback.ts already absent');
}

const tempDir = path.join(root, 'tmp', 'leo_patch');
if (fs.existsSync(tempDir)) {
  const allowed = new Set(['provider-fallback.ts', 'provider-fallback-sdk-status.test.mjs']);
  const entries = fs.readdirSync(tempDir, { withFileTypes: true });
  const unexpected = entries.filter(entry => !entry.isFile() || !allowed.has(entry.name));
  if (unexpected.length) {
    console.warn('Preserved tmp/leo_patch because it contains files outside the known patch artifacts:');
    for (const entry of unexpected) console.warn(` - ${entry.name}`);
  } else {
    for (const entry of entries) fs.unlinkSync(path.join(tempDir, entry.name));
    fs.rmdirSync(tempDir);
    const tmpRoot = path.join(root, 'tmp');
    if (fs.existsSync(tmpRoot) && fs.readdirSync(tmpRoot).length === 0) fs.rmdirSync(tmpRoot);
    changes.push('Removed known temporary tmp/leo_patch artifacts');
  }
} else {
  changes.push('tmp/leo_patch already absent');
}

const tsconfigPath = path.join(root, 'tsconfig.json');
const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
tsconfig.exclude = Array.isArray(tsconfig.exclude) ? tsconfig.exclude : [];
for (const item of ['tmp', 'tmp/**']) if (!tsconfig.exclude.includes(item)) tsconfig.exclude.push(item);
fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
changes.push('Ensured tsconfig.json excludes tmp and tmp/**');

console.log('LeonardX provider-fallback repair completed:');
for (const change of changes) console.log(`- ${change}`);
console.log('\nCanonical implementation preserved: lib/ai/provider-fallback.ts');
console.log('No commit or deployment was performed.');
