/**
 * "Which systems are worth spending effort on today": a work-priority score computed per
 * row from the Architect Registry's preferred faction plus the system's current influence
 * and state. Shaped like `freshness.ts` — injected clock, exported pure functions, stable
 * reason codes so specs (and the tooltip) don't depend on wording.
 *
 * Work priority and data staleness are deliberately kept apart (see the feature request this
 * implements): how old a reading is says nothing about whether the system is worth working,
 * so `needsRecon`/`reconAgeDays` below are informational only and never feed the score.
 */
import { BgsRow } from './bgs';
import { FACTION_NAME, UNREGISTERED_SCOPE } from './config';
import { daysElapsed, parseUpdatedAt } from './freshness';
import { PriorityWatchlistEntry } from './priority-watchlist';

export type PriorityTier = 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'out-of-scope' | 'not-applicable';
export type PriorityScope = 'in-scope' | 'assumed' | 'out-of-scope' | 'no-preference';

/** One applicable trigger, already weighted — the tooltip lists these, highest first. */
export interface PriorityReason {
  code: string;
  label: string;
  score: number;
}

/** Everything the Priority column needs to render and sort a row. */
export interface PriorityAssessment {
  tier: PriorityTier;
  scope: PriorityScope;
  leadFaction: string | null;
  /** Null for out-of-scope/not-applicable with no live conflict — sorts last via the table's existing null-last convention. */
  score: number | null;
  /** Every applicable trigger, highest-scoring first. */
  reasons: PriorityReason[];
  /** Whether the last reading is old enough that it shouldn't be trusted at face value. Informational only — never affects {@link score}. */
  needsRecon: boolean;
  /** Whole days since the last reading; null if unknown. */
  reconAgeDays: number | null;
}

const TIER_THRESHOLDS: readonly { tier: PriorityTier; min: number }[] = [
  { tier: 'P0', min: 85 },
  { tier: 'P1', min: 65 },
  { tier: 'P2', min: 40 },
  { tier: 'P3', min: 20 },
];

export function deriveTier(score: number): PriorityTier {
  for (const { tier, min } of TIER_THRESHOLDS) {
    if (score >= min) {
      return tier;
    }
  }
  return 'P4';
}

/**
 * What removes a non-native faction is falling below 2.5% influence. In a small system the
 * bottom faction sits comfortably in the teens; in a crowded one it routinely sits at 3-6%.
 * Scales the *predictive* triggers (influence thresholds, bottom-ranked) so a three-faction
 * system's bottom slot doesn't read as dangerous as a seven-faction system's.
 */
export function factionCountWeight(factionCount: number): number {
  if (factionCount <= 3) {
    return 0.25;
  }
  if (factionCount === 4) {
    return 0.5;
  }
  if (factionCount === 5) {
    return 0.75;
  }
  return 1.0;
}

/** Days-since-update at or above which a reading is old enough not to trust at face value; null (no timestamp at all) always counts as needing recon. */
const NEEDS_RECON_DAYS = 2;

/** Whether a reading is stale enough to flag — purely informational, see the module doc above. */
export function needsRecon(daysSinceUpdate: number | null): boolean {
  return daysSinceUpdate === null || daysSinceUpdate >= NEEDS_RECON_DAYS;
}

/**
 * BGS effort scales with the log of population — a percentage point of influence costs
 * proportionally more to move in a billion-population system than a thousand-population one.
 * Floors at 0.025 so a huge system's gap is heavily, not infinitely, discounted rather than
 * simply excluded.
 */
export function populationCostFactor(population: number | null): number {
  if (population === null || population <= 0) {
    return 1;
  }
  return Math.max(0.025, 1 - Math.log10(population) / 10.875);
}

/** The population-weighted cost of closing a percentage-point gap — the same raw gap costs more in a bigger system. */
export function costToClose(gapPoints: number, population: number | null): number {
  return gapPoints / populationCostFactor(population);
}

const GAP_SCORE_CAP = 80;
const GAP_SCORE_FLOOR = 5;

/**
 * Maps a population-weighted gap to a 0-100 work-priority contribution: a system level with
 * the leader (gap 0) is close to flipping control and scores near the top; a system whose gap
 * is expensive to close (a wide gap, a huge population, or both) is floored at the same
 * "nothing applicable" baseline other quiet systems get, rather than going negative.
 */
function gapToLeaderScore(gapPoints: number, population: number | null): number {
  const cost = costToClose(Math.max(0, gapPoints), population);
  return Math.min(GAP_SCORE_CAP, Math.max(GAP_SCORE_FLOOR, GAP_SCORE_CAP - cost));
}

/** Case- and whitespace-insensitive key, since the Preferred Faction answer is free text. */
function factionKey(name: string): string {
  return name.trim().toLowerCase();
}

const OWN_KEY = factionKey(FACTION_NAME);

/**
 * The scope gate (FR-4): whether a system is prioritised at all. The lead is always the
 * squadron's faction; the scope says how far we act on it.
 *  - Preferred faction is ours → in-scope.
 *  - Preferred faction is anyone else, and the system isn't flagged "not a colony" →
 *    out-of-scope: a standing agreement is worse to breach than to leave unworked.
 *  - "Not a colony" → always in-scope, even if a third-party Preferred Faction also got
 *    recorded on the same submission (the Assign dialog can default that field from the
 *    architect's answer in a *different* system, so a stray value here isn't a real
 *    hands-off agreement). A non-colony system facing withdrawal must not be hidden behind
 *    the "hands off" badge the way a genuine third-party agreement is.
 *  - An architect is confirmed but left the preference blank → "no-preference": someone has
 *    already looked and didn't name us, so it's simply excluded.
 *  - Nothing recorded at all → `unregistered`, from `unregisteredScope` in config.json:
 *    "in-scope" (the squadron's policy: every system we're present in is ours), or
 *    "assumed" (Canonn's policy): the caller then restricts it to defensive triggers only —
 *    never rank a push for control off an assumption nobody has confirmed.
 */
export function resolveScope(
  row: BgsRow,
  unregistered: 'in-scope' | 'assumed' = UNREGISTERED_SCOPE,
): { scope: PriorityScope; leadFaction: string | null } {
  const lead = row.factionInfluence !== null ? FACTION_NAME : null;
  const preferred = row.preferredFaction?.trim();
  if (preferred) {
    if (factionKey(preferred) === OWN_KEY || row.notAColony) {
      return { scope: 'in-scope', leadFaction: FACTION_NAME };
    }
    return { scope: 'out-of-scope', leadFaction: null };
  }
  if (row.notAColony) {
    return { scope: 'in-scope', leadFaction: FACTION_NAME };
  }
  if (row.architect !== null) {
    return { scope: 'no-preference', leadFaction: null };
  }
  return { scope: lead === null ? 'assumed' : unregistered, leadFaction: lead };
}

function influenceOf(row: BgsRow, faction: string | null): number | null {
  return faction === FACTION_NAME ? row.factionInfluence : null;
}

/**
 * War/election/retreat triggers involving the squadron's faction. Fires for a confirmed lead
 * (in-scope) and for an assumed one (no architect assigned yet — a live conflict there makes
 * getting an architect assigned urgent), but never for out-of-scope or no-preference, where an
 * architect has already looked and this isn't ours to work. See {@link computePriorityAssessment}.
 */
function conflictReasons(row: BgsRow): PriorityReason[] {
  const reasons: PriorityReason[] = [];
  if (row.retreatState === 'active' || row.retreatState === 'pending') {
    // Never weighted — it's the top of the list by construction.
    reasons.push({ code: 'retreat', label: 'Ritirata in corso', score: 100 });
  }
  if (row.warState === 'active') {
    reasons.push({ code: 'war-active', label: 'Guerra in corso', score: 95 });
  }
  if (row.electionState === 'active') {
    reasons.push({ code: 'election-active', label: 'Elezioni in corso', score: 92 });
  }
  if (row.warState === 'pending') {
    reasons.push({ code: 'war-pending', label: 'Guerra in arrivo', score: 88 });
  }
  if (row.electionState === 'pending') {
    reasons.push({ code: 'election-pending', label: 'Elezioni in arrivo', score: 85 });
  }
  return reasons;
}

/** Every trigger below `scope`'s own scope gate, in FR-4's table order — conflict triggers plus everything that needs a confirmed or assumed lead faction. */
function baseReasons(row: BgsRow, leadFaction: string, leadInfluence: number | null, weight: number, scope: PriorityScope): PriorityReason[] {
  const reasons: PriorityReason[] = conflictReasons(row);

  if (leadInfluence !== null && leadInfluence < 4) {
    reasons.push({ code: 'lead-below-4', label: 'Influenza sotto il 4%', score: 85 * weight });
  }

  const controllerInfluence = row.factions.find(f => f.name === row.controllingFaction)?.influencePercent ?? null;
  const isController = row.controllingFaction === leadFaction;
  const strongestRival = row.factions.find(f => f.name !== leadFaction)?.influencePercent ?? null;
  if (isController && leadInfluence !== null && strongestRival !== null) {
    const margin = leadInfluence - strongestRival;
    if (margin < 3) {
      reasons.push({ code: 'control-margin-under-3', label: 'Controllo con meno di 3 punti di vantaggio', score: 80 });
    }
  }

  if (leadInfluence !== null && leadInfluence < 6) {
    reasons.push({ code: 'lead-below-6', label: 'Influenza sotto il 6%', score: 70 * weight });
  }

  // Rank alone is a weak signal — in a 3-faction system, being last is often a perfectly
  // healthy ~25-30% (there are only two rivals to beat), so it also requires the same "below
  // 10%" floor as the influence triggers above, rather than firing on rank position alone.
  const leadRankIndex = row.factions.findIndex(f => f.name === leadFaction);
  if (leadRankIndex !== -1 && leadRankIndex === row.factions.length - 1 && row.factions.length > 1 && leadInfluence !== null && leadInfluence < 10) {
    reasons.push({ code: 'lead-lowest-ranked', label: 'Ultima fazione del sistema', score: 65 * weight });
  }

  // Being the weakest faction present in a system with 4+ factions is a withdrawal-risk
  // signal — but only in a system that's ours (in-scope: preferred by us, flagged "not a
  // colony", or unregistered under the squadron's policy), not a guessed/assumed lead: getting a system we're actually responsible for out of danger comes
  // before pushing anywhere else for control, so this outranks the work-priority triggers
  // below and lands in P0. Not gated by the same "below 10%" floor or faction-count weighting
  // as the influence triggers above, since this is about rank position itself, not a raw
  // influence reading. Restricted to 4+ factions: in a 3-faction system there are only two
  // rivals to beat, so "lowest of three" isn't a meaningful risk signal on its own.
  if (
    scope === 'in-scope' &&
    leadRankIndex !== -1 &&
    leadRankIndex === row.factions.length - 1 &&
    row.factions.length > 3
  ) {
    reasons.push({
      code: 'lead-lowest-should-control',
      label: 'Ultima su 4 o più fazioni: mettersi al sicuro prima di puntare al controllo',
      score: 90,
    });
  }

  if (isController && leadInfluence !== null && strongestRival !== null) {
    const margin = leadInfluence - strongestRival;
    if (margin >= 3 && margin < 7) {
      reasons.push({ code: 'control-margin-3-7', label: 'Controllo con 3-7 punti di vantaggio', score: 55 });
    }
  }
  if (leadInfluence !== null && leadInfluence < 10) {
    reasons.push({ code: 'lead-below-10', label: 'Influenza sotto il 10%', score: 50 * weight });
  }

  // The primary "is this worth taking" signal: not the raw gap alone, but how expensive that
  // gap is to close given the system's population (see costToClose). A system level with the
  // leader (gap 0) scores near the top of the range; a wide gap in a huge population is
  // floored at the same baseline a quiet system gets, rather than inverting the ranking the
  // way flat percentage thresholds used to (see the feature request this implements).
  if (!isController && leadInfluence !== null && controllerInfluence !== null) {
    const gap = controllerInfluence - leadInfluence;
    reasons.push({
      code: 'gap-to-leader',
      label: `Da conquistare: ${gap.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} punti dietro chi controlla (pesato sulla popolazione)`,
      score: gapToLeaderScore(gap, row.population),
    });
  }

  if (isController && leadInfluence !== null && strongestRival !== null) {
    const margin = leadInfluence - strongestRival;
    if (margin >= 7 && margin < 15) {
      reasons.push({ code: 'control-margin-7-15', label: 'Controllo con 7-15 punti di vantaggio', score: 30 });
    }
  }

  return reasons;
}

/** A watchlist entry's faction's rank among the system's factions, 1-based; absent from the system ranks one past the last. */
function watchlistFactionRank(row: BgsRow, faction: string): number {
  const index = row.factions.findIndex(f => f.name === faction);
  return index === -1 ? row.factions.length + 1 : index + 1;
}

/**
 * The Priority Watchlist's own trigger: a hand-picked system/faction pair that should never
 * rank below a given position (see `priority-watchlist.ts`). Fires whenever the named faction's
 * actual rank is worse (numerically higher) than the entry's required position — independent of
 * whichever faction {@link resolveScope} picked as this row's "lead", since the sheet names its
 * own faction explicitly and doesn't need to agree with the lead to apply.
 */
function watchlistReasons(row: BgsRow): PriorityReason[] {
  const reasons: PriorityReason[] = [];
  for (const entry of row.watchlist) {
    const currentPosition = watchlistFactionRank(row, entry.faction);
    if (currentPosition > entry.position) {
      reasons.push({
        code: 'below-watchlist-position',
        label: `${entry.faction} è ${currentPosition}ª, sotto la posizione richiesta (${entry.position}ª)`,
        score: 90,
      });
    }
  }
  return reasons;
}

/**
 * The out-of-scope override: a system is normally hands-off when the Architect Registry names
 * a third-party faction as preferred (see {@link resolveScope}) — but the Priority Watchlist
 * can also watch over that same third-party faction (e.g. an ally we've agreed to leave
 * alone unless they're in trouble). BGS work here is only allowed once that named faction has
 * actually fallen below its required position; while it's holding its position the hands-off
 * agreement still stands.
 */
function outOfScopeWatchlistReasons(row: BgsRow): PriorityReason[] {
  const preferred = row.preferredFaction?.trim();
  if (!preferred) {
    return [];
  }
  const watched = row.watchlist.filter(entry => entry.faction === preferred);
  return watchlistReasons({ ...row, watchlist: watched });
}

/** Reason codes from {@link conflictReasons}, so the "needs an architect" trigger below can detect one fired. */
const CONFLICT_REASON_CODES = new Set(['retreat', 'war-active', 'election-active', 'war-pending', 'election-pending']);

/** Computes the full priority assessment for one row. `nowMs` is injectable, for tests. */
export function computePriorityAssessment(
  row: BgsRow,
  nowMs: number = Date.now(),
  unregistered: 'in-scope' | 'assumed' = UNREGISTERED_SCOPE,
): PriorityAssessment {
  const { scope, leadFaction } = resolveScope(row, unregistered);

  if (scope === 'out-of-scope' || scope === 'no-preference') {
    if (scope === 'out-of-scope') {
      // The hands-off agreement can be lifted by the Priority Watchlist itself: if it's
      // watching the same third-party faction the Architect Registry names here and that
      // faction has slipped below its required position, BGS work is allowed after all —
      // see outOfScopeWatchlistReasons.
      const overrideReasons = outOfScopeWatchlistReasons(row);
      if (overrideReasons.length > 0) {
        overrideReasons.sort((a, b) => b.score - a.score);
        const score = overrideReasons[0].score;
        const updatedAtMs = parseUpdatedAt(row.updatedAt);
        const reconAgeDays = updatedAtMs === null ? null : daysElapsed(updatedAtMs, nowMs);
        return {
          tier: deriveTier(score),
          scope,
          leadFaction: null,
          score,
          reasons: overrideReasons,
          needsRecon: needsRecon(reconAgeDays),
          reconAgeDays,
        };
      }
    }
    // Neither scope is ours to work — a standing "hands off" agreement or an architect who's
    // already looked and named nobody. A live war/election there doesn't change that; it's
    // simply not a priority target, badge or no badge.
    const scopeReason: PriorityReason =
      scope === 'out-of-scope'
        ? { code: 'out-of-scope', label: `La fazione preferita è ${row.preferredFaction}: non intervenire`, score: 0 }
        : { code: 'no-preference', label: 'Architetto assegnato senza fazione preferita: non è un obiettivo', score: 0 };
    return {
      tier: scope === 'out-of-scope' ? 'out-of-scope' : 'not-applicable',
      scope,
      leadFaction: null,
      score: null,
      reasons: [scopeReason],
      needsRecon: false,
      reconAgeDays: null,
    };
  }

  const leadInfluence = influenceOf(row, leadFaction);
  const weight = factionCountWeight(row.factions.length);

  let reasons: PriorityReason[] = leadFaction ? baseReasons(row, leadFaction, leadInfluence, weight, scope) : [];
  if (scope === 'assumed') {
    // Never rank a push for control off an assumption nobody has confirmed with the architect
    // — but a live war/election still surfaces here, since a system with no architect at all
    // needs one assigned before anyone works it, and a conflict makes that urgent.
    reasons = reasons.filter(r => r.code !== 'gap-to-leader');
    if (reasons.some(r => CONFLICT_REASON_CODES.has(r.code))) {
      // Outranks every conflict trigger (retreat's 100 included) — with nobody confirmed
      // responsible for this system, assigning an architect comes before working the
      // conflict itself, so it has to lead the reasons list, not just tag along.
      reasons.push({
        code: 'assumed-needs-architect',
        label: 'Nessun architetto assegnato: assegnarne uno prima di lavorare a questo conflitto',
        score: 101,
      });
    }
  }
  reasons = reasons.concat(watchlistReasons(row));
  if (reasons.length === 0) {
    reasons = [{ code: 'none', label: 'Niente da segnalare', score: 5 }];
  }
  reasons.sort((a, b) => b.score - a.score);

  const score = reasons[0].score;
  const updatedAtMs = parseUpdatedAt(row.updatedAt);
  const reconAgeDays = updatedAtMs === null ? null : daysElapsed(updatedAtMs, nowMs);

  return {
    tier: deriveTier(score),
    scope,
    leadFaction,
    score,
    reasons,
    needsRecon: needsRecon(reconAgeDays),
    reconAgeDays,
  };
}

/**
 * The sort key for the Priority column — every row carrying a visible badge (a real score,
 * confirmed or assumed) sorts by that score, so the column's order always matches what the
 * badges show. Rows with no badge (out-of-scope/not-applicable, no live conflict) stay null,
 * sorting last either direction via the table's existing null-last convention (see
 * `compareColumnValues`).
 */
export function prioritySortKey(assessment: PriorityAssessment): number | null {
  return assessment.score;
}
