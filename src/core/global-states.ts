import type { BgsRow } from './bgs';
import { parseUpdatedAt } from './freshness';

/**
 * States that hold for a faction everywhere it's present, not system by system: an Expansion
 * shows in every system of the faction, pending, active or over at the same time (explained by
 * the user). Only Expansion for now; add others here once known to be faction-wide.
 */
export const GLOBAL_STATES: readonly string[] = ['Expansion'];

export function isGlobalState(state: string): boolean {
  return GLOBAL_STATES.includes(state);
}

/** A faction's global states, as the freshest system it was seen in reports them. */
export interface GlobalStateReading {
  /** The system they're read from: the most recently updated one the faction is present in. */
  sourceSystem: string;
  /** When Spansh last updated {@link sourceSystem}, in ms since the epoch. */
  updatedAtMs: number;
  /** The global states active there — empty when none (e.g. an Expansion already over). */
  active: string[];
  /** The global states pending there. */
  pending: string[];
}

/**
 * Each faction's global states, read from the most recently updated system it's present in.
 * Spansh lags system by system, so a stale system can still show an Expansion as pending (or
 * over) when fresher ones already have it active: the freshest reading holds for all of them.
 * Systems with no update time are skipped.
 */
export function readGlobalStates(
  rows: readonly Pick<BgsRow, 'systemName' | 'updatedAt' | 'factionDetails'>[],
): Map<string, GlobalStateReading> {
  const readings = new Map<string, GlobalStateReading>();
  for (const row of rows) {
    const updatedAtMs = parseUpdatedAt(row.updatedAt);
    if (updatedAtMs === null) {
      continue;
    }
    for (const faction of row.factionDetails) {
      const current = readings.get(faction.name);
      if (current && current.updatedAtMs >= updatedAtMs) {
        continue;
      }
      readings.set(faction.name, {
        sourceSystem: row.systemName,
        updatedAtMs,
        active: faction.activeStates.filter(isGlobalState),
        pending: faction.pendingStates.filter(isGlobalState),
      });
    }
  }
  return readings;
}
