/**
 * The BGS dataset's record types, the table row they turn into, and the pure logic between
 * the two (conflict-state summaries, preferred faction, architect assignment). No Angular and
 * no browser APIs, so the Discord report can compute exactly what the site shows.
 */
import { AFFILIATION_NOT_A_COLONY, ArchitectSubmission } from './architect-form';
import { ArchitectInfo, ArchitectRegistryRow } from './architect-registry';
import { FACTION_NAME } from './config';
import { isHomeSystem } from './home-systems';
import { logger } from './logger';
import { PriorityWatchlistEntry } from './priority-watchlist';


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

export interface MinorFactionPresence {
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

export interface BgsSystemRecord {
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
  /** Every station in the system, fleet carriers excluded. */
  assets?: StationRecord[] | null;
  /** Conflict scores from EliteBGS, only for systems with an active war or election of ours and only when EliteBGS answered. */
  ebgs_conflicts?: EbgsConflicts | null;
}

/** EliteBGS's view of a system's conflicts, as `scripts/fetch-bgs.mjs` slims it. */
export interface EbgsConflicts {
  /** ISO 8601 time EliteBGS last updated the system. */
  updated_at: string | null;
  conflicts: EbgsConflict[];
}

export interface EbgsConflict {
  /** "war", "civilwar" or "election". */
  type: string | null;
  /** "active" or "pending". */
  status: string | null;
  faction1: EbgsConflictSide;
  faction2: EbgsConflictSide;
}

export interface EbgsConflictSide {
  name: string | null;
  /** What the faction loses if it loses the conflict, e.g. a station; null if nothing. */
  stake: string | null;
  days_won: number | null;
}

/** A station or installation in a system, as the dataset's `assets` array describes it. */
export interface StationRecord {
  name: string;
  type: string | null;
  controlling_minor_faction: string | null;
  /** Only on stations with a Material Trader or Technology Broker. */
  distance_to_arrival?: number | null;
  /** The trader's kind (Raw, Manufactured, Encoded), `"unknown"` if Spansh doesn't say; absent if there's none. */
  material_trader?: string | null;
  /** The broker's kind (Human, Guardian), `"unknown"` if Spansh doesn't say; absent if there's none. */
  technology_broker?: string | null;
}

/** The file `scripts/fetch-bgs.mjs` writes: every system the faction is present in. */
export interface BgsDataset {
  faction: string;
  /** ISO 8601 time the dataset was downloaded from Spansh. */
  generated_at: string;
  /** ISO 8601 time of the last BGS tick when it was downloaded (EDCD Tick Detector); null if unknown. */
  tick_at?: string | null;
  /** False when EliteBGS couldn't be reached at download time, so no conflict has a score. Absent in older files. */
  conflict_scores_available?: boolean;
  count: number;
  results: BgsSystemRecord[];
}

/** A minor faction's presence in a system, for the Factions column's mini bar chart. */
export interface FactionInfluence {
  name: string;
  /** 0-100 percentage. */
  influencePercent: number;
}

/** The station services the table points out: where to trade materials or unlock tech. */
export type StationServiceKind = 'material-trader' | 'technology-broker';

/** A Material Trader or Technology Broker at a station. */
export interface StationService {
  kind: StationServiceKind;
  /** Raw/Manufactured/Encoded for a trader, Human/Guardian for a broker; null when Spansh doesn't know yet. */
  type: string | null;
}

/** A station in a system, as the system info dialog lists it. */
export interface StationDetail {
  name: string;
  type: string | null;
  controllingFaction: string | null;
  /** Its Material Trader and Technology Broker, if any. */
  services?: StationService[];
  /** Light seconds from the arrival star; kept only for stations with a service. */
  distanceToArrival?: number | null;
}

/** A service together with the station offering it, for the System column's icons and the quick filter. */
export interface SystemService extends StationService {
  station: string;
  distanceToArrival: number | null;
}

/** Placeholder `scripts/fetch-bgs.mjs` writes for a service whose kind Spansh doesn't know. */
const UNKNOWN_SERVICE_TYPE = 'unknown';

function stationServices(asset: StationRecord): StationService[] {
  const services: StationService[] = [];
  const add = (kind: StationServiceKind, value: string | null | undefined) => {
    if (value) {
      services.push({ kind, type: value === UNKNOWN_SERVICE_TYPE ? null : value });
    }
  };
  add('material-trader', asset.material_trader);
  add('technology-broker', asset.technology_broker);
  return services;
}

/** Every Material Trader and Technology Broker in a system, traders first. */
export function systemServices(stations: readonly StationDetail[]): SystemService[] {
  const services = stations.flatMap(station =>
    (station.services ?? []).map(service => ({ ...service, station: station.name, distanceToArrival: station.distanceToArrival ?? null })),
  );
  return [
    ...services.filter(service => service.kind === 'material-trader'),
    ...services.filter(service => service.kind === 'technology-broker'),
  ];
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

/**
 * How far the squadron's faction is from the faction it competes with for control: in a
 * system it controls, its lead over the strongest other faction (positive); elsewhere, its
 * distance from the controlling faction (usually negative).
 */
export interface FactionMargin {
  /** Our influence minus {@link versus}'s, in percentage points. */
  points: number;
  /** The faction we're measured against. */
  versus: string;
  /** {@link versus}'s influence, as a 0-100 percentage. */
  versusInfluence: number;
  /** Whether we control the system — the margin is then a lead to defend, not a gap to close. */
  controlled: boolean;
}

/**
 * The squadron faction's {@link FactionMargin} in a system, or null when the faction isn't
 * present or has nobody to be measured against. If the controlling faction isn't among the
 * presences (Spansh lagging behind), the strongest other faction stands in for it.
 */
export function computeMargin(
  factions: readonly FactionInfluence[],
  controllingFaction: string | null,
  ownFaction: string = FACTION_NAME,
): FactionMargin | null {
  const own = factions.find(f => f.name === ownFaction);
  const others = factions.filter(f => f.name !== ownFaction);
  if (!own || others.length === 0) {
    return null;
  }
  const controlled = controllingFaction === ownFaction;
  const strongestOther = others.reduce((best, f) => (f.influencePercent > best.influencePercent ? f : best));
  const versus = controlled ? strongestOther : (others.find(f => f.name === controllingFaction) ?? strongestOther);
  return {
    points: own.influencePercent - versus.influencePercent,
    versus: versus.name,
    versusInfluence: versus.influencePercent,
    controlled,
  };
}

/** Whether a war/election/retreat/expansion affecting the squadron's faction is already happening or just upcoming. */
export type FactionStateStatus = 'active' | 'pending' | null;

/**
 * One state behind a State column icon, structured for the click-to-open details panel (the
 * tooltip keeps using the `*Details` strings). Same selection as those strings: active entries
 * when there are any, otherwise pending ones.
 */
export interface StateEntry {
  kind: 'war' | 'election' | 'retreat';
  /** The state's name as the game spells it: "War", "CivilWar", "Election", "Retreat". */
  state: string;
  status: 'active' | 'pending';
  /** The factions sharing the state, the squadron's first. */
  factions: string[];
  /** Days won so far, from EliteBGS; null when it has no score for this conflict (or for a retreat, which has none). */
  score: ConflictScore | null;
}

/** A conflict's score from the squadron's side: our days first, as the orders write it. */
export interface ConflictScore {
  ours: number;
  theirs: number;
  opponent: string;
  /** What each side loses if it loses, e.g. a station; null if nothing. */
  ourStake: string | null;
  theirStake: string | null;
  /** ISO 8601 time EliteBGS last updated the system. */
  updatedAt: string | null;
}

/** One row of the rendered table. */
export interface BgsRow {
  systemName: string;
  controllingFaction: string | null;
  /** The squadron faction's influence, as a 0-100 percentage; null if it has no presence in the system. */
  factionInfluence: number | null;
  /** The squadron faction's lead over, or gap to, the faction it competes with for control. */
  margin: FactionMargin | null;
  architect: string | null;
  /** The registry's affiliation answer for this system (one of the `AFFILIATION_*` values), or null if none. */
  architectAffiliation: string | null;
  /** Recorded as "Nobody — the system is not a colony": shown blank rather than offering Assign again. */
  notAColony: boolean;
  /**
   * The faction this system should be worked for: the Architect Registry's Preferred Faction
   * if one is recorded; otherwise the squadron's faction when it controls a station here
   * (see {@link derivePreferredFaction}).
   */
  preferredFaction: string | null;
  /** False when {@link preferredFaction} was derived from system control rather than recorded in the registry — shown grey. */
  preferredFactionRecorded: boolean;
  /** Stations in the system, all of them — the Priority column's tiebreak after the priority itself. Null if the API omits it. */
  stationCount: number | null;
  /** Every minor faction present in the system, sorted by influence descending (highest first). */
  factions: FactionInfluence[];
  /** The same factions with allegiance, government and active states, for the system info dialog. */
  factionDetails: FactionDetail[];
  /** The system's stations, fleet carriers excluded, for the system info dialog. */
  stations: StationDetail[];
  /** Whether the squadron's faction is (or is about to be) at war here — drives the State column's gun icon. */
  warState: FactionStateStatus;
  /** Tooltip text for the war icon (one line per contributing faction), or null if warState is null. */
  warDetails: string | null;
  /** Whether the squadron's faction is (or is about to be) in an election here — drives the ballot-box icon. */
  electionState: FactionStateStatus;
  /** Tooltip text for the election icon, or null if electionState is null. */
  electionDetails: string | null;
  /**
   * Whether the squadron's faction is (or is about to be) retreating here — drives the State
   * column's warning icon. Never set for a faction in its own home system (FR-2). Unlike
   * war/election, retreat is single-faction, so there's no "vs" equivalent.
   */
  retreatState: FactionStateStatus;
  /** Tooltip text for the retreat icon (faction and influence, one line per faction), or null if retreatState is null. */
  retreatDetails: string | null;
  /** The war, election and retreat states above as structured entries, for the State details panel. */
  stateEntries: StateEntry[];
  /**
   * Whether the squadron's faction is (or is about to be) expanding here. Internal-only input for
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

/**
 * A copy of `row` showing the architect details of a just-submitted assignment, so the table
 * reflects the submission immediately instead of waiting for Google to republish the registry.
 */
export function rowWithAssignment(row: BgsRow, submission: ArchitectSubmission): BgsRow {
  const recorded = submission.preferredFaction || null;
  return {
    ...row,
    architect: submission.architect || null,
    architectAffiliation: submission.affiliation || null,
    notAColony: submission.affiliation === AFFILIATION_NOT_A_COLONY,
    preferredFaction: recorded ?? derivePreferredFaction(row),
    preferredFactionRecorded: recorded !== null,
  };
}

/**
 * The preferred faction for a system with no Architect Registry preference: the squadron's
 * faction when it already controls the system, otherwise none.
 */
export function derivePreferredFaction(row: Pick<BgsRow, 'controllingFaction'>): string | null {
  return row.controllingFaction === FACTION_NAME ? FACTION_NAME : null;
}

/**
 * Parses the architects Google Form response sheet: tab-separated, header row first, columns
 * matched by name (not position) so a reordered/added column in the sheet doesn't break this.
 * Rows are returned in sheet order (oldest first), which is what makes "the last row wins"
 * and the dialog's "most recent answer" defaults work. Returns an empty array (which the
 * caller treats as "couldn't use this") if the expected columns aren't found at all.
 */
export function parseArchitectsTsv(text: string): ArchitectRegistryRow[] {
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
  const affiliationIndex = header.indexOf('ACFS Architect');
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
 * system (see {@link summarizeFactionState}), not just ours, since the point is to
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

/**
 * "Flotta Stellare vs Earth Defense Fleet" — every faction sharing the conflict state, ours
 * first, so the tooltip names who's actually fighting. A lone corroborator (an unpaired
 * pending state) renders as just its own name.
 */
function describeConflict(corroborators: readonly MinorFactionPresence[]): string {
  return ownFactionFirst(corroborators).join(' vs ');
}

/** The corroborators' names, the squadron's faction first and the rest alphabetical. */
function ownFactionFirst(corroborators: readonly MinorFactionPresence[]): string[] {
  return [...corroborators]
    .sort((a, b) => {
      const aIsOwn = a.name === FACTION_NAME ? 0 : 1;
      const bIsOwn = b.name === FACTION_NAME ? 0 : 1;
      return aIsOwn - bIsOwn || a.name.localeCompare(b.name);
    })
    .map(c => c.name);
}

/**
 * "Flotta Stellare (2.1%)" — a single-faction state (retreat, expansion) has no
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
 * Checks the squadron faction's presence for a matching state (war, election, retreat, or
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
 * Details are one line per distinct match, e.g. `"War: Flotta Stellare vs Earth Defense
 * Fleet"` for a two-party state, or `"Retreat: Flotta Stellare (2.1%)"` for a single-faction
 * one — naming who's actually involved, for the icon's tooltip.
 */
function summarizeFactionState(
  systemName: string,
  snapshotTime: string | null,
  presences: readonly MinorFactionPresence[],
  config: StateSetConfig,
): { status: FactionStateStatus; details: string | null; entries: Omit<StateEntry, 'kind' | 'score'>[] } {
  const { states: conflictStates, requiresCorroboration, isSuppressed } = config;
  const describeMatch = config.describeMatch ?? describeConflict;

  // R8 diagnostics: every faction, not just ours. R3/R9 only apply to two-party states.
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

  // Render: our faction only — a match we're not a party to isn't shown. Details are keyed
  // by (state, corroborator set) and deduped, so the same "X vs Y" line never appears twice.
  const active: string[] = [];
  const pending: string[] = [];
  const activeEntries: Omit<StateEntry, 'kind' | 'score'>[] = [];
  const pendingEntries: Omit<StateEntry, 'kind' | 'score'>[] = [];
  const seenActive = new Set<string>();
  const seenPending = new Set<string>();

  for (const presence of presences) {
    if (presence.name !== FACTION_NAME || isSuppressed?.(presence.name, systemName)) {
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
        activeEntries.push({ state: rawState, status: 'active', factions: ownFactionFirst(corroborators) });
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
        pendingEntries.push({ state: stateName, status: 'pending', factions: ownFactionFirst(corroborators) });
      }
    }
  }

  if (active.length > 0) {
    return { status: 'active', details: active.join('\n'), entries: activeEntries };
  }
  if (pending.length > 0) {
    return { status: 'pending', details: pending.join('\n'), entries: pendingEntries };
  }
  return { status: null, details: null, entries: [] };
}

/**
 * The score of one of our active conflicts, from the squadron's side, if EliteBGS has it: the
 * conflict of the same type (war, civil war, election) with our faction on one side. Pending
 * conflicts haven't started, so they never get one ("Draw; 0-0" is implied).
 */
export function conflictScore(
  ebgs: EbgsConflicts | null | undefined,
  entry: Pick<StateEntry, 'state' | 'status'>,
): ConflictScore | null {
  if (!ebgs || entry.status !== 'active') {
    return null;
  }
  const type = normalizeStateName(entry.state);
  const own = FACTION_NAME.toLowerCase();
  for (const conflict of ebgs.conflicts) {
    if (normalizeStateName(conflict.type ?? '') !== type) {
      continue;
    }
    const [us, them] =
      conflict.faction1.name?.toLowerCase() === own ? [conflict.faction1, conflict.faction2]
      : conflict.faction2.name?.toLowerCase() === own ? [conflict.faction2, conflict.faction1]
      : [null, null];
    if (us && them && us.days_won !== null && them.days_won !== null) {
      return {
        ours: us.days_won,
        theirs: them.days_won,
        opponent: them.name ?? '—',
        ourStake: us.stake,
        theirStake: them.stake,
        updatedAt: ebgs.updated_at,
      };
    }
  }
  return null;
}

/**
 * Turns one dataset record into a table row: the squadron faction's influence, the
 * war/election/retreat/expansion summaries, and the architect details from the registry.
 */
export function toBgsRow(
  record: BgsSystemRecord,
  architects: ReadonlyMap<string, ArchitectInfo>,
  watchlist: ReadonlyMap<string, PriorityWatchlistEntry[]>,
): BgsRow {
  const presences = record.minor_faction_presences ?? [];
  const info = architects.get(record.name);
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
  const recordedPreference = info?.preferredFaction || null;
  const controllingFaction = record.controlling_minor_faction ?? null;
  const factions = [...presences]
    .sort((a, b) => b.influence - a.influence)
    .map(p => ({ name: p.name, influencePercent: p.influence * 100 }));
  return {
    systemName: record.name,
    controllingFaction,
    factionInfluence: influencePercent(presences, FACTION_NAME),
    margin: computeMargin(factions, controllingFaction),
    // Spansh's colonisation flags are unreliable, so any system without a registered
    // architect is assignable — never blocked behind a "Not a colony" indicator. A
    // registry row that itself answers "not a colony" is different: that's a confirmed
    // answer, so it's shown blank rather than inviting another Assign.
    architect: info?.architect || null,
    architectAffiliation: info?.affiliation || null,
    notAColony: info?.affiliation === AFFILIATION_NOT_A_COLONY,
    preferredFaction: recordedPreference ?? derivePreferredFaction({ controllingFaction }),
    preferredFactionRecorded: recordedPreference !== null,
    stationCount: record.station_count ?? null,
    factions,
    stations: (record.assets ?? []).map(asset => {
      const station: StationDetail = {
        name: asset.name,
        type: asset.type ?? null,
        controllingFaction: asset.controlling_minor_faction ?? null,
      };
      const services = stationServices(asset);
      if (services.length > 0) {
        station.services = services;
        station.distanceToArrival = asset.distance_to_arrival ?? null;
      }
      return station;
    }),
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
    electionState: election.status,
    electionDetails: election.details,
    retreatState: retreat.status,
    retreatDetails: retreat.details,
    // Same order as the State column's icons: retreat, war, election.
    stateEntries: [
      ...retreat.entries.map(entry => ({ ...entry, kind: 'retreat' as const, score: null })),
      ...war.entries.map(entry => ({ ...entry, kind: 'war' as const, score: conflictScore(record.ebgs_conflicts, entry) })),
      ...election.entries.map(entry => ({ ...entry, kind: 'election' as const, score: conflictScore(record.ebgs_conflicts, entry) })),
    ],
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

function influencePercent(presences: readonly MinorFactionPresence[], factionName: string): number | null {
  const presence = presences.find(p => p.name === factionName);
  return presence ? presence.influence * 100 : null;
}
