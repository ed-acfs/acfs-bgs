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
/** EliteBGS systems API: conflict scores, which Spansh doesn't have. */
const EBGS_SYSTEMS_URL = 'https://elitebgs.app/api/ebgs/v5/systems';
/** Systems per EliteBGS page (fixed by its API). */
const EBGS_PAGE_SIZE = 10;
/** Shorter than Spansh's: when its database is down EliteBGS takes ~35 s to answer with an error. */
const EBGS_TIMEOUT_MS = 20_000;
/** Spansh station search: unlike the system search, it says which kind of trader or broker a station has. */
const STATIONS_URL = 'https://spansh.co.uk/api/stations/search';
/** System names per station search, as the squadron map's `spansh_sync.py` does. */
const STATIONS_CHUNK = 40;
/** Station services worth showing in the table, and the dataset field each is kept in. */
const SERVICE_FIELDS = { 'Material Trader': 'material_trader', 'Technology Broker': 'technology_broker' };
/** Placeholder for a service Spansh lists without saying its kind (Raw/Encoded…, Human/Guardian). */
export const UNKNOWN_SERVICE_TYPE = 'unknown';
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
    assets: realStations.map(slimStation),
  };
}

/**
 * One station for the `assets` list. A station with a Material Trader or Technology Broker also
 * keeps its distance from the arrival star and the service, as {@link UNKNOWN_SERVICE_TYPE} until
 * {@link applyServiceTypes} fills in the kind from the station search.
 */
function slimStation(station) {
  const asset = {
    name: station.name,
    type: station.type ?? null,
    controlling_minor_faction: station.controlling_minor_faction ?? null,
  };
  const services = Object.entries(SERVICE_FIELDS).filter(([service]) => (station.services ?? []).includes(service));
  if (services.length > 0) {
    asset.distance_to_arrival = typeof station.distance_to_arrival === 'number' ? Math.round(station.distance_to_arrival) : null;
    for (const [, field] of services) {
      asset[field] = UNKNOWN_SERVICE_TYPE;
    }
  }
  return asset;
}

/** The systems with at least one Material Trader or Technology Broker, the only ones worth a station search. */
export function serviceSystems(systems) {
  const fields = Object.values(SERVICE_FIELDS);
  return systems.filter(system => (system.assets ?? []).some(asset => fields.some(field => asset[field]))).map(system => system.name);
}

const stationKey = (systemName, stationName) => `${String(systemName).toLowerCase()} / ${String(stationName).toLowerCase()}`;

/**
 * The kind of each Material Trader and Technology Broker in the given systems, from Spansh's
 * station search, keyed by system and station name. Like the EliteBGS scores, this only adds
 * detail: on an error it returns null and the services stay {@link UNKNOWN_SERVICE_TYPE}.
 */
export async function fetchServiceTypes(systemNames) {
  const types = new Map();
  if (systemNames.length === 0) {
    return types;
  }
  try {
    for (let i = 0; i < systemNames.length; i += STATIONS_CHUNK) {
      const chunk = systemNames.slice(i, i + STATIONS_CHUNK);
      for (let page = 0; ; page++) {
        const data = await request(STATIONS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters: { system_name: { value: chunk } }, size: 100, page }),
        });
        for (const station of data.results ?? []) {
          if (station.material_trader || station.technology_broker) {
            types.set(stationKey(station.system_name, station.name), {
              material_trader: station.material_trader || null,
              technology_broker: station.technology_broker || null,
            });
          }
        }
        if ((page + 1) * 100 >= (data.count ?? 0) || (data.results ?? []).length === 0) {
          break;
        }
      }
    }
    return types;
  } catch (error) {
    console.warn(`Spansh station search unavailable (${error.message}): trader and broker kinds unknown this time.`);
    return null;
  }
}

/** Replaces {@link UNKNOWN_SERVICE_TYPE} with the kind the station search found, where it found one. */
export function applyServiceTypes(systems, types) {
  if (!types) {
    return;
  }
  for (const system of systems) {
    for (const asset of system.assets ?? []) {
      const found = types.get(stationKey(system.name, asset.name));
      for (const field of Object.values(SERVICE_FIELDS)) {
        if (asset[field] && found?.[field]) {
          asset[field] = found[field];
        }
      }
    }
  }
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

/** Game state names (normalised like `src/core/bgs.ts` does) whose conflicts have a score. */
const CONFLICT_STATES = new Set(['war', 'civilwar', 'election']);
const normalizeState = state => String(state).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The systems where the squadron's faction is in an active war, civil war or election — the
 * only ones with a score worth asking EliteBGS for (a pending conflict is always 0-0).
 */
export function activeConflictSystems(systems, faction = FACTION_NAME) {
  return systems
    .filter(system =>
      (system.minor_faction_presences ?? []).some(
        presence => presence.name === faction && (presence.active_states ?? []).some(state => CONFLICT_STATES.has(normalizeState(state))),
      ),
    )
    .map(system => system.name);
}

/** One conflict as EliteBGS stores it, cut down to what the app shows. */
function slimConflict(conflict) {
  const side = faction => ({ name: faction?.name ?? null, stake: faction?.stake || null, days_won: faction?.days_won ?? null });
  return { type: conflict.type ?? null, status: conflict.status ?? null, faction1: side(conflict.faction1), faction2: side(conflict.faction2) };
}

/**
 * Conflict scores (days won) from EliteBGS for the given systems, keyed by lowercased system
 * name (the two sources needn't agree on capitalisation): `{ updated_at, conflicts }`. Spansh doesn't carry them (see ROADMAP.md, "Punteggio dei
 * conflitti").
 *
 * EliteBGS is often down for weeks, so this never fails the download: on the first error it
 * gives up and returns null (scores unknown), and the app falls back to its Inara link. Its
 * database errors sometimes come back as HTTP 200, so a reply counts only if it has `docs`.
 * The API returns 10 systems per page, so names are asked for 10 at a time.
 */
export async function fetchConflictScores(systemNames) {
  if (systemNames.length === 0) {
    return {};
  }
  const scores = {};
  try {
    for (let i = 0; i < systemNames.length; i += EBGS_PAGE_SIZE) {
      const query = systemNames.slice(i, i + EBGS_PAGE_SIZE).map(name => `name=${encodeURIComponent(name)}`).join('&');
      const response = await fetch(`${EBGS_SYSTEMS_URL}?${query}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(EBGS_TIMEOUT_MS),
      });
      const body = response.ok ? await response.json() : null;
      if (!Array.isArray(body?.docs)) {
        throw new Error(body?.message ?? `HTTP ${response.status}`);
      }
      for (const system of body.docs) {
        scores[String(system.name).toLowerCase()] = { updated_at: system.updated_at ?? null, conflicts: (system.conflicts ?? []).map(slimConflict) };
      }
    }
    return scores;
  } catch (error) {
    console.warn(`EliteBGS unavailable (${error.message}): no conflict scores this time.`);
    return null;
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
  const [scores, serviceTypes] = await Promise.all([
    fetchConflictScores(activeConflictSystems(results)),
    fetchServiceTypes(serviceSystems(results)),
  ]);
  applyServiceTypes(results, serviceTypes);
  for (const system of results) {
    const score = scores?.[system.name.toLowerCase()];
    if (score) {
      system.ebgs_conflicts = score;
    }
  }
  const payload = {
    faction: FACTION_NAME,
    generated_at: new Date().toISOString(),
    tick_at: tickAt,
    source: 'spansh.co.uk',
    // False when EliteBGS couldn't be reached, so the app can say why scores are missing.
    conflict_scores_available: scores !== null,
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
