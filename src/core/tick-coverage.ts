import { BgsRow } from './bgs';
import { parseUpdatedAt } from './freshness';
import { PriorityTier, computePriorityAssessment } from './priority';

/** The tiers counted as "priority systems" in the header counter. */
const TOP_TIERS: readonly PriorityTier[] = ['P1', 'P2'];

/** How many systems Spansh has seen since the last tick, overall and among the top priorities. */
export interface TickCoverage {
  updated: number;
  total: number;
  topUpdated: number;
  topTotal: number;
}

/**
 * Counts the systems whose `updated_at` is at or after the last tick. Spansh only learns of a
 * system when a player with an EDDN client flies through it, so after a tick this climbs over
 * hours; the counter shows how far it has got. Returns null when the tick time is unknown.
 */
export function computeTickCoverage(rows: readonly BgsRow[], tickAt: string | null, nowMs: number): TickCoverage | null {
  const tickMs = tickAt ? Date.parse(tickAt) : NaN;
  if (Number.isNaN(tickMs)) {
    return null;
  }
  const coverage: TickCoverage = { updated: 0, total: rows.length, topUpdated: 0, topTotal: 0 };
  for (const row of rows) {
    const updatedMs = parseUpdatedAt(row.updatedAt);
    const updated = updatedMs !== null && updatedMs >= tickMs;
    if (updated) {
      coverage.updated++;
    }
    if (TOP_TIERS.includes(computePriorityAssessment(row, nowMs).tier)) {
      coverage.topTotal++;
      if (updated) {
        coverage.topUpdated++;
      }
    }
  }
  return coverage;
}

/** The header line, e.g. "214/389 aggiornati dall'ultimo tick · P1-P2: 18/25". */
export function formatTickCoverage(coverage: TickCoverage): string {
  return `${coverage.updated}/${coverage.total} aggiornati dall'ultimo tick · P1-P2: ${coverage.topUpdated}/${coverage.topTotal}`;
}
