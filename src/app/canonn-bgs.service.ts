import { Injectable } from '@angular/core';
import { BUILD_ID } from './build-info';
import {
  AFFILIATION_NOT_A_COLONY,
  ARCHITECT_FORM_ACTION,
  ArchitectSubmission,
  buildArchitectFormBody,
} from './data/architect-form';
import {
  ArchitectInfo,
  ArchitectRegistryRow,
  buildArchitectInfoMap,
} from './data/architect-registry';
import { isHomeSystem } from './data/home-systems';
import { logger } from './data/logger';
import { PriorityWatchlistEntry, buildWatchlistMap, parseWatchlistTsv } from './data/priority-watchlist';

/**
 * The static dataset `scripts/fetch-bgs.mjs` downloads from Spansh. Relative, so it resolves
 * under whatever base href the app is deployed with.
 */
const BGS_DATA_URL = 'data/bgs.json';

/**
 * Galaxy-wide system name and coordinate lookup, for the "sort by distance" search box:
 * Canonn's public proxy of Spansh's own typeahead, which sends no CORS headers itself.
 */
const TYPEAHEAD_ENDPOINT = 'https://us-central1-canonn-api-236217.cloudfunctions.net/query/typeahead';

/**
 * The Architect Registry: a Google Form's response sheet, published to the web as TSV. Null
 * until the squadron's own sheet exists — the table then just shows no architects.
 * Unauthenticated, published-to-web Google infrastructure with no stability contract, so any
 * failure (CORS, network, an unrecognised layout) means an empty registry for this session.
 */
const ARCHITECTS_SHEET_URL: string | null = null;
const ARCHITECTS_SHEET_TIMEOUT_MS = 8000;

/**
 * The Priority Watchlist — another published tab of the same spreadsheet (same caveats as
 * {@link ARCHITECTS_SHEET_URL}). Null until the squadron's own sheet exists.
 */
const WATCHLIST_SHEET_URL: string | null = null;
const WATCHLIST_SHEET_TIMEOUT_MS = 8000;

/** Default per-request timeout for remote API calls (ms). */
const HTTP_TIMEOUT_MS = 20000;
/** Number of automatic retries for transient failures. */
const HTTP_RETRY_COUNT = 2;
/** Timeout for a form submission (ms). Not retried — see {@link CanonnBgsService.submitAssignment}. */
const FORM_SUBMIT_TIMEOUT_MS = 15000;

/** localStorage key the architect registry is persisted under. */
const ARCHITECTS_CACHE_KEY = 'canonn-bgs:architects-cache:v2';
/** How long the architect registry is cached before it's refetched. */
const ARCHITECTS_CACHE_DURATION_MS = 2 * 60 * 60 * 1000;

/** localStorage key the priority watchlist is persisted under. */
const WATCHLIST_CACHE_KEY = 'canonn-bgs:watchlist-cache:v1';
/** How long the priority watchlist is cached before it's refetched. */
const WATCHLIST_CACHE_DURATION_MS = 2 * 60 * 60 * 1000;

export const CANONN_FACTION = 'Canonn';
export const CDSR_FACTION = 'Canonn Deep Space Research';
const CANONN_FACTION_NAMES: ReadonlySet<string> = new Set([CANONN_FACTION, CDSR_FACTION]);

/**
 * BGS state names that count as "at war" / "in an election" for the State column's icons,
 * pre-normalised per {@link normalizeStateName} (issue #6, R4) so raw entries can be compared
 * against these sets after normalising them the same way.
 */
const WAR_STATES: ReadonlySet<string> = new Set(['war', 'civilwar']);
const ELECTION_STATES: ReadonlySet<string> = new Set(['election']);
/**
 * Retreat is a single-faction state — a faction retreats on its own, with no opposing party
 * — unlike war/election. See {@link StateSetConfig.requiresCorroboration}.
 */
const RETREAT_STATES: ReadonlySet<string> = new Set(['retreat']);
/**
 * Also single-faction, like retreat. Not rendered as a State-column icon (deferred per the
 * feature spec) — only read internally, to score the priority table's "expansion unwanted"
 * trigger.
 */
const EXPANSION_STATES: ReadonlySet<string> = new Set(['expansion']);

/**
 * Normalises a BGS state name for comparison (issue #6, R4): Spansh humanises state names
 * inconsistently across sources (`"CivilWar"` vs `"Civil War"`), so raw strings are never
 * compared directly.
 */
function normalizeStateName(state: string): string {
  return state.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Error thrown by {@link CanonnBgsService}'s HTTP helpers for non-2xx responses.
 */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Resolves after `ms` milliseconds. Used for retry backoff. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * A `pending_states` entry may be a bare state name, or (per issue #6, R10) an object
 * carrying an optional `trend` alongside it — observed values are `0`, and render must not
 * depend on it being present or non-zero, so it's read only to extract `state`.
 */
interface PendingStateEntry {
  state: string;
  trend?: number;
}

/** The state name out of a `pending_states` entry, whichever shape it came in as. */
function pendingEntryStateName(entry: string | PendingStateEntry): string {
  return typeof entry === 'string' ? entry : entry.state;
}

interface MinorFactionPresence {
  name: string;
  allegiance?: string;
  government?: string;
  influence: number;
  /** Current state(s), e.g. "Boom", "War". Authoritative — see issue #6. */
  active_states?: string[];
  /** Upcoming state(s) not yet in effect, e.g. a war or election about to start. */
  pending_states?: (string | PendingStateEntry)[];
  /** State(s) that just ended and are in a post-state cooldown, e.g. a war that just concluded. */
  recovering_states?: string[];
  /**
   * Legacy single-state scalar (a passthrough of the game journal's FactionState). Lags a
   * tick or can report a conflict that's already resolved — read only for anomaly detection
   * against `active_states`, never to derive a user-visible conflict indicator (issue #6, R1).
   */
  state?: string;
}

interface BgsSystemRecord {
  name: string;
  controlling_minor_faction: string | null;
  minor_faction_presences?: MinorFactionPresence[];
  x: number;
  y: number;
  z: number;
  /** When this system's data was last updated, e.g. "2026-08-06 19:52:24+00". Not strict ISO 8601 — see {@link parseUpdatedAt}. */
  updated_at?: string | null;
  /** Number of astronomical bodies scanned in the system. */
  body_count?: number | null;
  population?: number | null;
  /** Total stations in the system, fleet carriers excluded. Higher wins a priority tie. */
  station_count?: number | null;
  /** Every station in the system, fleet carriers excluded; those with "canonn" in their name make the system Canonn-led. */
  assets?: CanonnAsset[] | null;
}

/** A station or installation in a system, as the dataset's `assets` array describes it. */
export interface CanonnAsset {
  name: string;
  type: string | null;
  controlling_minor_faction: string | null;
}

/** The file `scripts/fetch-bgs.mjs` writes: every system the faction is present in. */
interface BgsDataset {
  faction: string;
  /** ISO 8601 time the dataset was downloaded from Spansh. */
  generated_at: string;
  count: number;
  results: BgsSystemRecord[];
}

/** A typeahead match, with the coordinates needed to sort by distance from it. */
export interface TypeaheadSystem {
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface TypeaheadResponse {
  min_max?: TypeaheadSystem[];
  values?: string[];
}

/** A minor faction's presence in a system, for the Factions column's mini bar chart. */
export interface FactionInfluence {
  name: string;
  /** 0-100 percentage. */
  influencePercent: number;
}

/** A station in a system, as the system info dialog lists it. */
export interface StationDetail {
  name: string;
  type: string | null;
  controllingFaction: string | null;
}

/** A minor faction present in a system, with the detail the system dialog's faction table shows. */
export interface FactionDetail {
  name: string;
  allegiance: string | null;
  government: string | null;
  /** 0-100 percentage. */
  influencePercent: number;
  /** The faction's current state(s), e.g. "Boom", "War" — empty if none. */
  activeStates: string[];
}

/** Whether a war/election affecting Canonn or CDSR is already happening or just upcoming. */
export type FactionStateStatus = 'active' | 'pending' | null;

/** One row of the rendered table. */
export interface BgsRow {
  systemName: string;
  controllingFaction: string | null;
  /** Canonn faction influence, as a 0-100 percentage; null if Canonn has no presence in the system. */
  canonnInfluence: number | null;
  /** Canonn Deep Space Research faction influence, as a 0-100 percentage; null if absent. */
  cdsrInfluence: number | null;
  architect: string | null;
  /** Recorded as "Nobody — the system is not a colony": shown blank rather than offering Assign again. */
  notAColony: boolean;
  /**
   * The faction this system should be worked for: the Architect Registry's Preferred Faction
   * if one is recorded; otherwise, when the system has a station with "canonn" in its name,
   * whichever of Canonn/CDSR has more influence here (see {@link derivePreferredFaction}).
   */
  preferredFaction: string | null;
  /** False when {@link preferredFaction} was derived from a Canonn-named station rather than recorded in the registry — shown grey. */
  preferredFactionRecorded: boolean;
  /** Whether any station in the system has "canonn" in its name (matching "Canonnia" or "Arcanonn" too). */
  hasCanonnStation: boolean;
  /** Stations in the system, all of them — the Priority column's tiebreak after the priority itself. Null if the API omits it. */
  stationCount: number | null;
  /** Every minor faction present in the system, sorted by influence descending (highest first). */
  factions: FactionInfluence[];
  /** The same factions with allegiance, government and active states, for the system info dialog. */
  factionDetails: FactionDetail[];
  /** The system's stations (the API's canonn_assets), for the system info dialog. */
  stations: StationDetail[];
  /** Whether Canonn or CDSR is (or is about to be) at war here — drives the State column's gun icon. */
  warState: FactionStateStatus;
  /** Tooltip text for the war icon (one line per contributing faction), or null if warState is null. */
  warDetails: string | null;
  /** True when the war's two parties are Canonn and CDSR themselves — renders the Canonn icon instead of the gun. */
  warIsCanonnVsCanonn: boolean;
  /** Whether Canonn or CDSR is (or is about to be) in an election here — drives the ballot-box icon. */
  electionState: FactionStateStatus;
  /** Tooltip text for the election icon, or null if electionState is null. */
  electionDetails: string | null;
  /** True when the election's two parties are Canonn and CDSR themselves — renders the Canonn icon instead of the ballot box. */
  electionIsCanonnVsCanonn: boolean;
  /**
   * Whether Canonn or CDSR is (or is about to be) retreating here — drives the State
   * column's warning icon. Never set for a faction in its own home system (FR-2). Unlike
   * war/election, retreat is single-faction, so there's no "vs" equivalent.
   */
  retreatState: FactionStateStatus;
  /** Tooltip text for the retreat icon (faction and influence, one line per faction), or null if retreatState is null. */
  retreatDetails: string | null;
  /**
   * Whether Canonn or CDSR is (or is about to be) expanding here. Internal-only input for
   * the priority score's "expansion unwanted" trigger — not rendered as a State column icon.
   */
  expansionState: FactionStateStatus;
  /** Number of astronomical bodies scanned in the system — shown in the System Name tooltip. Null if the API omits it. */
  bodyCount: number | null;
  /** The system's population — shown in the System Name tooltip and used as the Priority column's secondary sort (a bigger system matters more when priority ties). */
  population: number | null;
  /** Galactic coordinates (light-years), used to compute the Distance column. */
  x: number;
  y: number;
  z: number;
  /** Raw `updated_at` from the API, as-is; the Freshness column derives its pill from this. */
  updatedAt: string | null;
  /** Priority Watchlist entries naming this system, if any — see {@link PriorityWatchlistEntry}. */
  watchlist: PriorityWatchlistEntry[];
}

export interface BgsPage {
  page: number;
  rows: BgsRow[];
  totalCount: number;
  totalPages: number;
}

interface ArchitectsCachePayload {
  fetchedAt: number;
  /** The build that wrote this cache; a mismatch (a new build was deployed) invalidates it. */
  buildId: string;
  rows: ArchitectRegistryRow[];
}

interface WatchlistCachePayload {
  fetchedAt: number;
  /** The build that wrote this cache; a mismatch (a new build was deployed) invalidates it. */
  buildId: string;
  entries: PriorityWatchlistEntry[];
}

/**
 * A copy of `row` showing the architect details of a just-submitted assignment, so the table
 * reflects the submission immediately instead of waiting for Google to republish the registry.
 */
export function rowWithAssignment(row: BgsRow, submission: ArchitectSubmission): BgsRow {
  const recorded = submission.preferredFaction || null;
  return {
    ...row,
    architect: submission.architect || null,
    notAColony: submission.affiliation === AFFILIATION_NOT_A_COLONY,
    preferredFaction: recorded ?? derivePreferredFaction(row),
    preferredFactionRecorded: recorded !== null,
  };
}

/**
 * The preferred faction for a system with no Architect Registry preference: a Canonn-named
 * station makes it Canonn-led, and the lead is whichever of Canonn / Canonn Deep Space Research
 * has more influence here (Canonn on a tie, or when neither is present). Null when no station
 * is Canonn-named — the system has no preference at all.
 */
export function derivePreferredFaction(
  row: Pick<BgsRow, 'hasCanonnStation' | 'canonnInfluence' | 'cdsrInfluence'>,
): string | null {
  if (!row.hasCanonnStation) {
    return null;
  }
  const cdsr = row.cdsrInfluence ?? -1;
  const canonn = row.canonnInfluence ?? -1;
  return cdsr > canonn ? CDSR_FACTION : CANONN_FACTION;
}

/** Whether a station's name marks it as Canonn's — "canonn" anywhere in the name, any case. */
export function isCanonnAsset(asset: CanonnAsset): boolean {
  return /canonn/i.test(asset.name);
}

/**
 * Parses the architects Google Form response sheet: tab-separated, header row first, columns
 * matched by name (not position) so a reordered/added column in the sheet doesn't break this.
 * Rows are returned in sheet order (oldest first), which is what makes "the last row wins"
 * and the dialog's "most recent answer" defaults work. Returns an empty array (which the
 * caller treats as "couldn't use this") if the expected columns aren't found at all.
 */
function parseArchitectsTsv(text: string): ArchitectRegistryRow[] {
  const rows: ArchitectRegistryRow[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(line => line.length > 0);
  if (lines.length === 0) {
    return rows;
  }

  const header = lines[0].split('\t');
  const systemNameIndex = header.indexOf('System Name');
  const architectNameIndex = header.indexOf('Architect Name');
  const preferredFactionIndex = header.indexOf('Preferred Faction');
  // Optional: the Cloud Function's copy of the data has it, but it's not load-bearing for the table.
  const affiliationIndex = header.indexOf('Canonn Architect');
  if (systemNameIndex === -1 || architectNameIndex === -1 || preferredFactionIndex === -1) {
    return rows;
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('\t');
    const systemName = cells[systemNameIndex]?.trim();
    if (!systemName) {
      continue;
    }
    rows.push({
      systemName,
      architect: cells[architectNameIndex]?.trim() ?? '',
      affiliation: affiliationIndex === -1 ? '' : (cells[affiliationIndex]?.trim() ?? ''),
      preferredFaction: cells[preferredFactionIndex]?.trim() ?? '',
    });
  }
  return rows;
}

/**
 * Logs a structured anomaly record (issue #6, R8) for a faction whose legacy `state` or
 * `active_states`/`pending_states` disagree with what the modern arrays can actually
 * corroborate. This is a general "is Spansh's legacy field still drifting from the modern
 * one" signal, independent of which faction it's about — it runs for every faction in the
 * system (see {@link summarizeFactionState}), not just Canonn/CDSR, since the point is to
 * catch upstream data-quality regressions generally, not only where we happen to render.
 * `recovering_states` is included here (never in the render) so a resolved conflict's
 * evidence isn't lost. `severity: 'info'` is used for R9's unpaired-pending case, which the
 * issue calls out as lower-severity than an outright R2/R3 rejection — dev-only either way,
 * this never reaches render. `snapshot_time` stands in for the issue's `timestamps.factions`
 * (this API's per-record `updated_at` is the closest coherent equivalent we get); there's no
 * `id64` in this API's system records at all, so it's omitted rather than fabricated.
 */
function logConflictStateAnomaly(
  systemName: string,
  snapshotTime: string | null,
  presence: MinorFactionPresence,
  reason: string,
  severity: 'warning' | 'info' = 'warning',
): void {
  const record = {
    system: systemName,
    snapshot_time: snapshotTime,
    faction: presence.name,
    state: presence.state,
    active_states: presence.active_states ?? [],
    pending_states: (presence.pending_states ?? []).map(pendingEntryStateName),
    recovering_states: presence.recovering_states ?? [],
    reason,
  };
  if (severity === 'info') {
    logger.log('BGS conflict-state anomaly', record);
  } else {
    logger.warn('BGS conflict-state anomaly', record);
  }
}

/** Every faction in the system whose own `active_states` includes `normalized`. */
function activeCorroborators(presences: readonly MinorFactionPresence[], normalized: string): MinorFactionPresence[] {
  return presences.filter(p => (p.active_states ?? []).some(s => normalizeStateName(s) === normalized));
}

/** Every faction in the system whose own `pending_states` includes `normalized`. */
function pendingCorroborators(presences: readonly MinorFactionPresence[], normalized: string): MinorFactionPresence[] {
  return presences.filter(p =>
    (p.pending_states ?? []).some(entry => normalizeStateName(pendingEntryStateName(entry)) === normalized),
  );
}

/** True when `corroborators` is exactly Canonn and CDSR — the "vs each other" case. */
function isCanonnOnlyPair(corroborators: readonly MinorFactionPresence[]): boolean {
  return corroborators.length === 2 && corroborators.every(c => CANONN_FACTION_NAMES.has(c.name));
}

/**
 * "Canonn vs Varati Ring" — every faction sharing the conflict state, Canonn/CDSR first,
 * so the tooltip names who's actually fighting rather than just which of our own factions
 * is involved. A lone corroborator (an unpaired pending state) renders as just its own name.
 */
function describeConflict(corroborators: readonly MinorFactionPresence[]): string {
  return [...corroborators]
    .sort((a, b) => {
      const aIsCanonn = CANONN_FACTION_NAMES.has(a.name) ? 0 : 1;
      const bIsCanonn = CANONN_FACTION_NAMES.has(b.name) ? 0 : 1;
      return aIsCanonn - bIsCanonn || a.name.localeCompare(b.name);
    })
    .map(c => c.name)
    .join(' vs ');
}

/**
 * "Canonn Deep Space Research (2.1%)" — a single-faction state (retreat, expansion) has no
 * opposing party to name, so its detail line names the faction and its current influence
 * instead of the war/election "X vs Y" format {@link describeConflict} produces.
 */
function describeSingleFaction(corroborators: readonly MinorFactionPresence[]): string {
  return corroborators.map(c => `${c.name} (${(c.influence * 100).toFixed(1)}%)`).join(', ');
}

/**
 * A state or set of related state names (e.g. war + civil war) to summarise, and how it
 * behaves: war/election are two-party conflicts (R3/R9's corroboration requirement below
 * applies); retreat/expansion are single-faction states a faction enters on its own, so
 * that requirement — and the R3/R9 anomaly diagnostics it drives — must not apply to them.
 */
interface StateSetConfig {
  states: ReadonlySet<string>;
  /** War/election: true. Retreat/expansion: false — see the interface doc above. */
  requiresCorroboration: boolean;
  /** Detail-line formatter; defaults to {@link describeConflict}'s "X vs Y". */
  describeMatch?: (corroborators: readonly MinorFactionPresence[]) => string;
  /** When given, a match is suppressed entirely for a faction this returns true for (FR-2: a faction can't retreat from its own home system). */
  isSuppressed?: (factionName: string, systemName: string) => boolean;
}

/**
 * Checks Canonn's and CDSR's presences for a matching state (war, election, retreat, or
 * expansion — see {@link StateSetConfig}), active or pending (about to start next tick), and
 * along the way runs the R8 anomaly diagnostics for every faction in the system. Implements
 * issue #6's rules:
 *  - R1/R2: only `active_states`/`pending_states` drive the render. The legacy `state`
 *    scalar is read only to detect anomalies (R8) — it never decides active/pending status
 *    on its own.
 *  - R3: for a two-party state, an active instance needs at least one other faction in the
 *    same system corroborating the same (normalised) state in its own `active_states` — a
 *    lone combatant is impossible and is suppressed (and logged as an anomaly). Doesn't
 *    apply to a single-faction state (`requiresCorroboration: false`) — a lone retreat is
 *    the expected case, not an anomaly.
 *  - R4: state names are compared after normalising (lowercase, non-alphanumerics stripped).
 *  - R9: `recovering_states` never renders — active wins if a system somehow has both an
 *    active and a pending entry for the same state. A two-party state's pending entry isn't
 *    subject to R3's requirement either, but an unpaired one still gets a lower-severity
 *    anomaly; single-faction states skip this diagnostic too, for the same reason as R3.
 *  - R10: a `pending_states` entry may be a bare string or `{state, trend}` — `trend` is
 *    never read.
 * Details are one line per distinct match, e.g. `"War: Canonn vs Varati Ring"` for a
 * two-party state, or `"Retreat: Canonn Deep Space Research (2.1%)"` for a single-faction
 * one — naming who's actually involved rather than just which of our own factions is,
 * for the icon's tooltip.
 *
 * Also reports `isCanonnVsCanonn`: true when the only two factions sharing a two-party state
 * are Canonn and CDSR themselves. We only care about matches Canonn/CDSR are a party to (see
 * the render loop's `CANONN_FACTION_NAMES` filter below); when the *other* party also turns
 * out to be Canonn/CDSR, that's a distinct case worth flagging on its own icon rather than
 * showing as an ordinary war/election against a third-party faction. Always false for a
 * single-faction state, which has no "other party" at all.
 */
function summarizeFactionState(
  systemName: string,
  snapshotTime: string | null,
  presences: readonly MinorFactionPresence[],
  config: StateSetConfig,
): { status: FactionStateStatus; details: string | null; isCanonnVsCanonn: boolean } {
  const { states: conflictStates, requiresCorroboration, isSuppressed } = config;
  const describeMatch = config.describeMatch ?? describeConflict;

  // R8 diagnostics: every faction, not just Canonn/CDSR. R3/R9 only apply to two-party states.
  for (const presence of presences) {
    const rawActiveStates = presence.active_states ?? [];
    if (requiresCorroboration) {
      for (const rawState of rawActiveStates) {
        const normalized = normalizeStateName(rawState);
        if (!conflictStates.has(normalized)) {
          continue;
        }
        if (activeCorroborators(presences, normalized).length < 2) {
          logConflictStateAnomaly(systemName, snapshotTime, presence, `R3: no second faction corroborates active "${rawState}"`);
        }
      }

      for (const entry of presence.pending_states ?? []) {
        const stateName = pendingEntryStateName(entry);
        const normalized = normalizeStateName(stateName);
        if (!conflictStates.has(normalized)) {
          continue;
        }
        if (pendingCorroborators(presences, normalized).length < 2) {
          logConflictStateAnomaly(systemName, snapshotTime, presence, `R9: unpaired pending "${stateName}"`, 'info');
        }
      }
    }

    // R1/R2 anomaly: the legacy `state` scalar names a match not corroborated by
    // active_states. `recovering_states` doesn't get this same treatment since it's not a
    // legacy field disagreeing with a modern one — R9 just never renders it (but is still
    // included in the anomaly record above, as evidence).
    if (presence.state && conflictStates.has(normalizeStateName(presence.state))) {
      const corroborated = rawActiveStates.some(s => normalizeStateName(s) === normalizeStateName(presence.state!));
      if (!corroborated) {
        logConflictStateAnomaly(systemName, snapshotTime, presence, `R2: legacy state "${presence.state}" absent from active_states`);
      }
    }
  }

  // Render: Canonn/CDSR only — a match we're not a party to isn't shown. Details are keyed
  // by (state, corroborator set) and deduped, since Canonn and CDSR being on the same side
  // of the same two-party state would otherwise produce the same "X vs Y" line twice.
  const active: string[] = [];
  const pending: string[] = [];
  const seenActive = new Set<string>();
  const seenPending = new Set<string>();
  let activeIsCanonnVsCanonn = false;
  let pendingIsCanonnVsCanonn = false;

  for (const presence of presences) {
    if (!CANONN_FACTION_NAMES.has(presence.name) || isSuppressed?.(presence.name, systemName)) {
      continue;
    }

    for (const rawState of presence.active_states ?? []) {
      const normalized = normalizeStateName(rawState);
      if (!conflictStates.has(normalized)) {
        continue;
      }
      const corroborators = activeCorroborators(presences, normalized);
      if (requiresCorroboration && corroborators.length < 2) {
        continue;
      }
      const key = `${normalized}|${corroborators.map(c => c.name).sort().join(',')}`;
      if (!seenActive.has(key)) {
        seenActive.add(key);
        active.push(`${rawState}: ${describeMatch(corroborators)}`);
      }
      if (isCanonnOnlyPair(corroborators)) {
        activeIsCanonnVsCanonn = true;
      }
    }

    for (const entry of presence.pending_states ?? []) {
      const stateName = pendingEntryStateName(entry);
      const normalized = normalizeStateName(stateName);
      if (!conflictStates.has(normalized)) {
        continue;
      }
      const corroborators = pendingCorroborators(presences, normalized);
      const key = `${normalized}|${corroborators.map(c => c.name).sort().join(',')}`;
      if (!seenPending.has(key)) {
        seenPending.add(key);
        pending.push(`${stateName}: ${describeMatch(corroborators)} (pending)`);
      }
      if (isCanonnOnlyPair(corroborators)) {
        pendingIsCanonnVsCanonn = true;
      }
    }
  }

  if (active.length > 0) {
    return { status: 'active', details: active.join('\n'), isCanonnVsCanonn: activeIsCanonnVsCanonn };
  }
  if (pending.length > 0) {
    return { status: 'pending', details: pending.join('\n'), isCanonnVsCanonn: pendingIsCanonnVsCanonn };
  }
  return { status: null, details: null, isCanonnVsCanonn: false };
}

/**
 * Loads the BGS dataset: a table of systems with their controlling faction, the squadron
 * faction's influence, and (via a separate lookup) architect details.
 *
 * The whole dataset is one static file (see {@link BGS_DATA_URL}), so page 0 holds every
 * system and there are no further pages; the table slices it client-side.
 *
 * Caching:
 * - The dataset is fetched once per session; page 0 is memoised in memory.
 * - The architect registry is fetched once and persisted in localStorage for
 *   {@link ARCHITECTS_CACHE_DURATION_MS}, since it changes far less often than BGS influence.
 */
@Injectable({ providedIn: 'root' })
export class CanonnBgsService {
  private datasetPromise?: Promise<BgsDataset>;
  private readonly pagePromises = new Map<number, Promise<BgsPage>>();
  private registryPromise?: Promise<ArchitectRegistryRow[]>;
  /** The resolved registry, once loaded — what {@link recordAssignment} appends to. */
  private registryRows: ArchitectRegistryRow[] | null = null;
  /** When the registry was fetched, preserved across local edits so it still expires on schedule. */
  private registryFetchedAt = 0;
  /** {@link registryRows} collapsed to one entry per system; rebuilt when the registry changes. */
  private architectInfo: Map<string, ArchitectInfo> | null = null;
  private watchlistPromise?: Promise<Map<string, PriorityWatchlistEntry[]>>;

  /** Fetches a page of BGS results (0-based), from cache if it's already been loaded. */
  getPage(page: number): Promise<BgsPage> {
    let promise = this.pagePromises.get(page);
    if (!promise) {
      promise = this.fetchPage(page);
      this.pagePromises.set(page, promise);
      // Don't poison the cache with a failed fetch — let a later call retry.
      promise.catch(() => this.pagePromises.delete(page));
    }
    return promise;
  }

  /** Fire-and-forget prefetch for the next page; failures are silent and just retried on real navigation. */
  prefetchPage(page: number): void {
    void this.getPage(page).catch(() => {});
  }

  /** Name-suggestion + coordinate lookup, for the "sort by distance from system" search box. */
  typeahead(query: string): Promise<TypeaheadResponse> {
    return this.resilientGet<TypeaheadResponse>(`${TYPEAHEAD_ENDPOINT}?q=${encodeURIComponent(query)}`);
  }

  /**
   * Every Architect Registry submission, oldest first — the Assign dialog's source for
   * architect-name suggestions and for what a known architect last answered.
   */
  getArchitectRegistry(): Promise<readonly ArchitectRegistryRow[]> {
    return this.getRegistry();
  }

  /** Every Priority Watchlist entry, grouped by system — what {@link toRow} attaches to each {@link BgsRow}. */
  getPriorityWatchlist(): Promise<ReadonlyMap<string, PriorityWatchlistEntry[]>> {
    return this.getWatchlist();
  }

  /**
   * Submits a filled-in Assign dialog to the Architect Registry form.
   *
   * Google Forms sends no CORS headers, so this has to go out as an opaque `no-cors` request:
   * the submission is recorded, but the response is unreadable. A rejection therefore means
   * "the request never left the browser" (offline, blocked, timed out) — which is the failure
   * worth offering a retry for — while a resolve means "accepted by Google as far as we can
   * tell". It's deliberately not retried automatically: a retried POST that actually succeeded
   * the first time would add a duplicate row to the registry.
   */
  async submitAssignment(submission: ArchitectSubmission): Promise<void> {
    if (!ARCHITECT_FORM_ACTION) {
      throw new Error('The Architect Registry form is not configured yet.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FORM_SUBMIT_TIMEOUT_MS);
    try {
      await fetch(ARCHITECT_FORM_ACTION, {
        method: 'POST',
        mode: 'no-cors',
        // A CORS-safelisted content type, so the request needs no preflight (which would fail).
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: buildArchitectFormBody(submission).toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Folds a just-submitted assignment into everything already loaded — the registry, the
   * system lookup derived from it, the memoised BGS pages and the persisted cache — so the
   * new architect shows up straight away, and survives a reload, without waiting for Google
   * to republish the sheet. The cache's original fetch time is kept, so the authoritative
   * data is still refetched on the usual schedule.
   */
  recordAssignment(submission: ArchitectSubmission): void {
    const row: ArchitectRegistryRow = {
      systemName: submission.systemName,
      architect: submission.architect,
      affiliation: submission.affiliation,
      preferredFaction: submission.preferredFaction,
    };

    if (this.registryRows) {
      this.registryRows.push(row);
      this.architectInfo = buildArchitectInfoMap(this.registryRows);
      this.writeArchitectsCache(this.registryRows, this.registryFetchedAt);
    }

    for (const [page, promise] of [...this.pagePromises]) {
      const patched = promise.then(result => ({
        ...result,
        rows: result.rows.map(r => (r.systemName === submission.systemName ? rowWithAssignment(r, submission) : r)),
      }));
      patched.catch(() => this.pagePromises.delete(page));
      this.pagePromises.set(page, patched);
    }
  }

  /**
   * Every row of the BGS dataset, in its natural order (most recently updated first). Used
   * when the table switches into a full-dataset sort (by distance or by influence). The
   * dataset is a single file, so `onProgress` only ever reports 0 of 1, then 1 of 1.
   */
  async getAllRows(onProgress?: (loaded: number, total: number) => void): Promise<BgsRow[]> {
    onProgress?.(0, 1);
    const { rows } = await this.getPage(0);
    onProgress?.(1, 1);
    return rows;
  }

  private async fetchPage(page: number): Promise<BgsPage> {
    const [dataset, architects, watchlist] = await Promise.all([this.getDataset(), this.getArchitectInfo(), this.getWatchlist()]);
    return {
      page,
      rows: page === 0 ? dataset.results.map(record => this.toRow(record, architects, watchlist)) : [],
      totalCount: dataset.results.length,
      totalPages: 1,
    };
  }

  /** Loads the dataset at most once per session; a failure clears the memo so a later call can retry. */
  private getDataset(): Promise<BgsDataset> {
    if (!this.datasetPromise) {
      this.datasetPromise = this.resilientGet<BgsDataset>(BGS_DATA_URL).catch(error => {
        this.datasetPromise = undefined;
        throw error;
      });
    }
    return this.datasetPromise;
  }

  private toRow(
    record: BgsSystemRecord,
    architects: ReadonlyMap<string, ArchitectInfo>,
    watchlist: ReadonlyMap<string, PriorityWatchlistEntry[]>,
  ): BgsRow {
    const presences = record.minor_faction_presences ?? [];
    const info = architects.get(record.name);
    const canonnInfluence = this.influencePercent(presences, CANONN_FACTION);
    const cdsrInfluence = this.influencePercent(presences, CDSR_FACTION);
    const snapshotTime = record.updated_at ?? null;
    const war = summarizeFactionState(record.name, snapshotTime, presences, { states: WAR_STATES, requiresCorroboration: true });
    const election = summarizeFactionState(record.name, snapshotTime, presences, { states: ELECTION_STATES, requiresCorroboration: true });
    const retreat = summarizeFactionState(record.name, snapshotTime, presences, {
      states: RETREAT_STATES,
      requiresCorroboration: false,
      describeMatch: describeSingleFaction,
      isSuppressed: isHomeSystem,
    });
    const expansion = summarizeFactionState(record.name, snapshotTime, presences, {
      states: EXPANSION_STATES,
      requiresCorroboration: false,
      describeMatch: describeSingleFaction,
    });
    const hasCanonnStation = (record.assets ?? []).some(isCanonnAsset);
    const recordedPreference = info?.preferredFaction || null;
    return {
      systemName: record.name,
      controllingFaction: record.controlling_minor_faction ?? null,
      canonnInfluence,
      cdsrInfluence,
      // Spansh's colonisation flags are unreliable, so any system without a registered
      // architect is assignable — never blocked behind a "Not a colony" indicator. A
      // registry row that itself answers "not a colony" is different: that's a confirmed
      // answer, so it's shown blank rather than inviting another Assign.
      architect: info?.architect || null,
      notAColony: info?.affiliation === AFFILIATION_NOT_A_COLONY,
      preferredFaction: recordedPreference ?? derivePreferredFaction({ hasCanonnStation, canonnInfluence, cdsrInfluence }),
      preferredFactionRecorded: recordedPreference !== null,
      hasCanonnStation,
      stationCount: record.station_count ?? null,
      factions: [...presences]
        .sort((a, b) => b.influence - a.influence)
        .map(p => ({ name: p.name, influencePercent: p.influence * 100 })),
      stations: (record.assets ?? []).map(asset => ({
        name: asset.name,
        type: asset.type ?? null,
        controllingFaction: asset.controlling_minor_faction ?? null,
      })),
      factionDetails: [...presences]
        .sort((a, b) => b.influence - a.influence)
        .map(p => ({
          name: p.name,
          allegiance: p.allegiance ?? null,
          government: p.government ?? null,
          influencePercent: p.influence * 100,
          activeStates: p.active_states ?? [],
        })),
      warState: war.status,
      warDetails: war.details,
      warIsCanonnVsCanonn: war.isCanonnVsCanonn,
      electionState: election.status,
      electionDetails: election.details,
      electionIsCanonnVsCanonn: election.isCanonnVsCanonn,
      retreatState: retreat.status,
      retreatDetails: retreat.details,
      expansionState: expansion.status,
      bodyCount: record.body_count ?? null,
      population: record.population ?? null,
      x: record.x,
      y: record.y,
      z: record.z,
      updatedAt: record.updated_at ?? null,
      watchlist: watchlist.get(record.name) ?? [],
    };
  }

  private influencePercent(presences: readonly MinorFactionPresence[], factionName: string): number | null {
    const presence = presences.find(p => p.name === factionName);
    return presence ? presence.influence * 100 : null;
  }

  /** The system -> architect lookup the table's rows are built from, derived from the registry once. */
  private async getArchitectInfo(): Promise<ReadonlyMap<string, ArchitectInfo>> {
    const rows = await this.getRegistry();
    if (!this.architectInfo) {
      this.architectInfo = buildArchitectInfoMap(rows);
    }
    return this.architectInfo;
  }

  /** Loads the architect registry at most once per session (see class doc). */
  private getRegistry(): Promise<ArchitectRegistryRow[]> {
    if (!this.registryPromise) {
      this.registryPromise = this.loadRegistry().catch(error => {
        // Clear the memo so a later page fetch can retry instead of failing forever.
        this.registryPromise = undefined;
        throw error;
      });
    }
    return this.registryPromise;
  }

  private async loadRegistry(): Promise<ArchitectRegistryRow[]> {
    const cached = this.readArchitectsCache();
    if (cached) {
      this.registryRows = cached.rows;
      this.registryFetchedAt = cached.fetchedAt;
      return cached.rows;
    }

    const rows = await this.loadRegistryFromSheet();
    this.registryRows = rows ?? [];
    this.registryFetchedAt = Date.now();
    // Only a successful fetch is persisted, so a transient failure is retried on the next visit.
    if (rows !== null) {
      this.writeArchitectsCache(rows, this.registryFetchedAt);
    }
    return this.registryRows;
  }

  /**
   * Fetches the published Google Sheet and parses it. Returns null — never throws — when no
   * sheet is configured or the fetch fails, which the caller treats as an empty registry.
   */
  private async loadRegistryFromSheet(): Promise<ArchitectRegistryRow[] | null> {
    if (!ARCHITECTS_SHEET_URL) {
      return null;
    }
    try {
      const text = await this.fetchTextOnce(ARCHITECTS_SHEET_URL, ARCHITECTS_SHEET_TIMEOUT_MS);
      return parseArchitectsTsv(text);
    } catch (error) {
      logger.warn('Architects sheet fetch failed; no architects will be shown this session.', error);
      return null;
    }
  }

  /** Loads the priority watchlist at most once per session, grouped by system; never throws — see {@link loadWatchlist}. */
  private getWatchlist(): Promise<Map<string, PriorityWatchlistEntry[]>> {
    if (!this.watchlistPromise) {
      this.watchlistPromise = this.loadWatchlist();
    }
    return this.watchlistPromise;
  }

  private async loadWatchlist(): Promise<Map<string, PriorityWatchlistEntry[]>> {
    const cached = this.readWatchlistCache();
    if (cached) {
      return buildWatchlistMap(cached.entries);
    }

    const entries = await this.loadWatchlistFromSheet();
    this.writeWatchlistCache(entries, Date.now());
    return buildWatchlistMap(entries);
  }

  /**
   * Fetches the published Priority Watchlist sheet directly. Unlike the Architect Registry
   * there's no Cloud Function fallback for this tab, so any failure just means no watchlist
   * entries are applied this session rather than blocking the page from loading at all.
   */
  private async loadWatchlistFromSheet(): Promise<PriorityWatchlistEntry[]> {
    if (!WATCHLIST_SHEET_URL) {
      return [];
    }
    try {
      const text = await this.fetchTextOnce(WATCHLIST_SHEET_URL, WATCHLIST_SHEET_TIMEOUT_MS);
      return parseWatchlistTsv(text);
    } catch (error) {
      logger.warn('Priority watchlist sheet fetch failed; no watchlist entries will be applied.', error);
      return [];
    }
  }

  private readWatchlistCache(): { entries: PriorityWatchlistEntry[]; fetchedAt: number } | null {
    try {
      const raw = localStorage.getItem(WATCHLIST_CACHE_KEY);
      if (!raw) {
        return null;
      }
      const payload = JSON.parse(raw) as WatchlistCachePayload;
      if (payload.buildId !== BUILD_ID) {
        return null;
      }
      if (Date.now() - payload.fetchedAt >= WATCHLIST_CACHE_DURATION_MS) {
        return null;
      }
      return { entries: payload.entries, fetchedAt: payload.fetchedAt };
    } catch {
      return null;
    }
  }

  private writeWatchlistCache(entries: readonly PriorityWatchlistEntry[], fetchedAt: number): void {
    try {
      const payload: WatchlistCachePayload = { fetchedAt, buildId: BUILD_ID, entries: [...entries] };
      localStorage.setItem(WATCHLIST_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Storage full/unavailable (e.g. private browsing) — the in-memory entries still serve this session.
    }
  }

  private readArchitectsCache(): { rows: ArchitectRegistryRow[]; fetchedAt: number } | null {
    try {
      const raw = localStorage.getItem(ARCHITECTS_CACHE_KEY);
      if (!raw) {
        return null;
      }
      const payload = JSON.parse(raw) as ArchitectsCachePayload;
      // A new build was deployed since this was cached — treat it as stale regardless of age,
      // so a fix or data-shape change ships to every visitor immediately, not after 2 hours.
      if (payload.buildId !== BUILD_ID) {
        return null;
      }
      if (Date.now() - payload.fetchedAt >= ARCHITECTS_CACHE_DURATION_MS) {
        return null;
      }
      return { rows: payload.rows, fetchedAt: payload.fetchedAt };
    } catch {
      return null;
    }
  }

  private writeArchitectsCache(rows: readonly ArchitectRegistryRow[], fetchedAt: number): void {
    try {
      const payload: ArchitectsCachePayload = { fetchedAt, buildId: BUILD_ID, rows: [...rows] };
      localStorage.setItem(ARCHITECTS_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Storage full/unavailable (e.g. private browsing) — the in-memory rows still serve this session.
    }
  }

  /**
   * Performs an HTTP GET with a timeout and exponential-backoff retry so that
   * transient network errors and slow/hung requests don't permanently break
   * the feature. Callers still receive the error if all retries fail.
   */
  private async resilientGet<T>(url: string, timeoutMs: number = HTTP_TIMEOUT_MS): Promise<T> {
    let lastError: unknown;
    // One initial attempt plus HTTP_RETRY_COUNT retries.
    for (let attempt = 0; attempt <= HTTP_RETRY_COUNT; attempt++) {
      try {
        return await this.fetchJson<T>(url, timeoutMs);
      } catch (error) {
        lastError = error;
        // Don't retry client errors — they won't succeed on a retry. Timeouts (aborts)
        // and network/5xx errors are still retried with backoff.
        const status = error instanceof HttpError ? error.status : undefined;
        if (status !== undefined && status >= 400 && status < 500) {
          throw error;
        }
        if (attempt === HTTP_RETRY_COUNT) {
          break;
        }
        const retryIndex = attempt + 1;
        await delay(Math.min(1000 * 2 ** (retryIndex - 1), 8000));
      }
    }
    throw lastError;
  }

  private async fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
    return JSON.parse(await this.fetchTextOnce(url, timeoutMs)) as T;
  }

  /** A single fetch attempt (no retry) with a timeout; throws on any non-2xx or network failure. */
  private async fetchTextOnce(url: string, timeoutMs: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new HttpError(response.status, response.statusText || `HTTP ${response.status}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }
}
