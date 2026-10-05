// GitHub Pages has no rewrite rules: a direct link to a client-side route such as /ordini
// asks for a file that doesn't exist and gets the site's 404.html. Making 404.html a copy of
// index.html loads the app instead, and the Angular router then shows the right page.
// Runs after `npm run build:pages` (as `postbuild:pages`).
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'dist/acfs-bgs-tool/browser';
const index = join(outDir, 'index.html');

if (!existsSync(index)) {
  console.error(`spa-fallback: ${index} not found — run the build first.`);
  process.exit(1);
}

copyFileSync(index, join(outDir, '404.html'));
console.log(`spa-fallback: ${join(outDir, '404.html')} written.`);
