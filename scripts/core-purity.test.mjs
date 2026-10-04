/**
 * `src/core/` must stay usable outside the browser (the Discord report runs in Node), so no
 * Angular, no DOM, no browser storage, and no imports reaching back into the app.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'core');

const FORBIDDEN = [
  { pattern: /from\s+['"]@angular\//, reason: 'imports Angular' },
  { pattern: /from\s+['"]\.\.\/app\//, reason: 'imports from the app' },
  { pattern: /\b(localStorage|sessionStorage)\s*\./, reason: 'uses browser storage' },
  { pattern: /\b(document|window)\./, reason: 'uses the DOM' },
];

test('core modules use no Angular, DOM or browser storage', async () => {
  const files = (await readdir(coreDir)).filter(name => name.endsWith('.ts') && !name.endsWith('.spec.ts'));
  assert.ok(files.length > 0, 'no core modules found');

  const problems = [];
  for (const name of files) {
    const source = await readFile(path.join(coreDir, name), 'utf8');
    for (const { pattern, reason } of FORBIDDEN) {
      if (pattern.test(source)) {
        problems.push(`${name} ${reason}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
