/**
 * Downloads every system where the squadron's faction is present from Spansh and writes it
 * to `public/data/bgs.json`, which the app loads as a static file.
 *
 * Spansh sends no CORS headers, so the browser can't query it directly. This does what
 * Canonn's `canonnbgs` Cloud Function does (Canonn-GCloud, query/function/localpackage/
 * canonnbgs.py): save a search, recall it page by page, and strip what the table doesn't use.
 *
 * Usage: `npm run fetch-data` (Node 18+, no dependencies). With `--if-missing` it does
 * nothing when the file already exists — what `npm start`/`npm run build` use, so a local
 * server doesn't query Spansh on every start.
 */
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../src/core/config.json' with { type: 'json' };

/** The squadron's faction, from the same `src/core/config.json` the app reads. */
export const FACTION_NAME = config.faction;

const SEARCH_URL = 'https://spansh.co.uk/api/systems/search/save';
const RECALL_URL = 'https://spansh.co.uk/api/systems/search/recall';
const PAGE_SIZE = 500;
/** EDCD Tick Detector: the time of the last BGS tick, as a JSON string. */
const TICK_URL = 'https://tick.edcd.io/api/tick';
const USER_AGENT = 'acfs-bgs-tool (+https://github.com/ed-acfs/acfs-bgs-tool)';
const TIMEOUT_MS = 60_000;
/** Spansh's pseudo-faction for fleet carriers, which aren't stations the BGS cares about. */
const FLEET_CARRIER_FACTION = 'FleetCarrier';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(repoRoot, 'public', 'data', 'bgs.json');

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Keeps what the app reads, drops the heavy fields (bodies, synthesis recipes, full station
 * details) and summarises the stations: their count without fleet carriers, and a short list
 * for the system info dialog.
 */
export function slimSystem(system) {
  const { bodies, stations, synthesis_recipes, ...rest } = system;
  const realStations = (stations ?? []).filter(s => s.controlling_minor_faction !== FLEET_CARRIER_FACTION);
  return {
    ...rest,
    station_count: realStations.length,
    assets: realStations.map(s => ({
      name: s.name,
      type: s.type ?? null,
      controlling_minor_faction: s.controlling_minor_faction ?? null,
    })),
  };
}

export async function fetchFactionSystems(faction = FACTION_NAME) {
  const saved = await request(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filters: { minor_faction_presences: [{ name: [faction] }] },
      sort: [{ updated_at: { direction: 'desc' } }],
      size: PAGE_SIZE,
      page: 0,
    }),
  });
  const reference = saved.search_reference;
  if (!reference) {
    throw new Error('Spansh did not return a search_reference');
  }

  const systems = [];
  for (let page = 0; ; page++) {
    const data = await request(`${RECALL_URL}/${reference}/${page}`);
    systems.push(...(data.results ?? []).map(slimSystem));
    if (systems.length >= data.count || (data.results ?? []).length === 0) {
      return systems;
    }
  }
}

/**
 * The last BGS tick as an ISO 8601 string, or null if the Tick Detector can't be reached —
 * it only labels the data, so it must never stop the download.
 */
export async function fetchLastTick() {
  try {
    const tick = await request(TICK_URL);
    return typeof tick === 'string' && !Number.isNaN(Date.parse(tick)) ? new Date(tick).toISOString() : null;
  } catch (error) {
    console.warn(`Tick Detector unavailable: ${error.message}`);
    return null;
  }
}

async function main() {
  if (process.argv.includes('--if-missing')) {
    try {
      await access(OUTPUT_PATH);
      console.log(`${path.relative(repoRoot, OUTPUT_PATH)} already exists; run \`npm run fetch-data\` to refresh it.`);
      return;
    } catch {
      // Not there yet: download it.
    }
  }
  const startedAt = Date.now();
  const [results, tickAt] = await Promise.all([fetchFactionSystems(), fetchLastTick()]);
  const payload = {
    faction: FACTION_NAME,
    generated_at: new Date().toISOString(),
    tick_at: tickAt,
    source: 'spansh.co.uk',
    count: results.length,
    results,
  };
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload));
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Wrote ${results.length} systems for "${FACTION_NAME}" to ${path.relative(repoRoot, OUTPUT_PATH)} in ${seconds}s`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
