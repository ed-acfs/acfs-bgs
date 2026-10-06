import type { BgsRow } from './bgs';
import { FACTION_NAME, RETREAT_INFLUENCE_PERCENT } from './config';
import { isHomeSystem } from './home-systems';

/**
 * Whether the squadron's faction is low enough for a Retreat to start at the next tick, before
 * Spansh reports the state: at or below {@link RETREAT_INFLUENCE_PERCENT}, not already in
 * Retreat, and never in its own home system (a faction can't retreat from there). Only a
 * warning in the State column: once the state is active there are 5 days to climb back, and
 * recovering on the last one is the usual (and stronger) play, so it doesn't raise the priority.
 */
export function retreatExpected(row: Pick<BgsRow, 'systemName' | 'factionInfluence' | 'retreatState'>): boolean {
  return (
    row.retreatState === null &&
    row.factionInfluence !== null &&
    row.factionInfluence <= RETREAT_INFLUENCE_PERCENT &&
    !isHomeSystem(FACTION_NAME, row.systemName)
  );
}
