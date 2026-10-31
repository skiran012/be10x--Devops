import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

// SpendSight is served as native HTML/CSS/JS modules, so build verifies source syntax without bundling.
const roots = ['js', 'tests'];
const files = [];

function collect(path) {
  for (const name of readdirSync(path)) {
    const fullPath = join(path, name);
    if (statSync(fullPath).isDirectory()) collect(fullPath);
    else if (fullPath.endsWith('.js')) files.push(fullPath);
  }
}

for (const root of roots) collect(root);
if (files.length === 0) {
  console.error('Build check failed: no JavaScript source files were found.');
  process.exit(1);
}

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`Build check failed: ${relative('.', file)}\n${result.stderr || result.stdout}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`Build check passed: syntax validated in ${files.length} JavaScript files.`);
