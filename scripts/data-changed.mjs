/**
 * Tells whether `public/data/bgs.json`, just downloaded by `fetch-bgs.mjs`, differs from the
 * one already on the site. The half-hourly workflow run uses it to skip the build and the
 * deploy when Spansh has nothing new: most runs, outside the hours after a tick.
 *
 * Usage: `node scripts/data-changed.mjs`. Prints the answer and, inside GitHub Actions,
 * writes `changed=true|false` to `$GITHUB_OUTPUT`. If the published file can't be read it
 * answers `true`: publishing once too often is harmless, missing an update isn't.
 */
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLISHED_URL = 'https://flottastellare.it/acfs-bgs-tool/data/bgs.json';
const USER_AGENT = 'acfs-bgs-tool (+https://github.com/ed-acfs/acfs-bgs-tool)';
const TIMEOUT_MS = 60_000;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_PATH = path.join(repoRoot, 'public', 'data', 'bgs.json');

/**
 * What counts as "the data": everything except `generated_at`, which changes on every
 * download, with the systems in name order so Spansh's ordering of equal timestamps can't
 * pass for a change.
 */
export function dataFingerprint(dataset) {
  const { generated_at, results, ...rest } = dataset;
  const sorted = [...(results ?? [])].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return JSON.stringify({ ...rest, results: sorted });
}

export function dataChanged(downloaded, published) {
  return published == null || dataFingerprint(downloaded) !== dataFingerprint(published);
}

async function fetchPublished() {
  try {
    const response = await fetch(PUBLISHED_URL, {
      headers: { 'User-Agent': USER_AGENT },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn(`Published data unavailable (${error.message}): treating the download as new.`);
    return null;
  }
}

async function main() {
  const downloaded = JSON.parse(await readFile(LOCAL_PATH, 'utf8'));
  const published = await fetchPublished();
  const changed = dataChanged(downloaded, published);
  console.log(changed ? 'The data has changed: publishing.' : 'Same data as the site: nothing to publish.');
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
