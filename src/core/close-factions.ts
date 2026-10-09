import type { BgsRow, FactionInfluence } from './bgs';
import { CONFLICT_MARGIN_POINTS, FACTION_NAME } from './config';

/**
 * Whether our faction is already in a conflict here, so warning that one might start is
 * pointless: our influence stays frozen until it ends, and a faction can't be in two conflicts in
 * the same system. That's a war or election of ours (active or pending, with whoever), or our
 * influence equal to a neighbour's — factions in conflict sit at the same influence, and that's
 * how it starts even before Spansh reports the state.
 */
export function alreadyInConflict(row: Pick<BgsRow, 'stateEntries' | 'factions'>): boolean {
  return (
    row.stateEntries.some(entry => entry.kind !== 'retreat') ||
    closeFactions(row.factions).some(faction => Math.abs(faction.points) < 0.05)
  );
}

/** A faction next to ours in the influence ranking, close enough for a conflict. */
export interface CloseFaction {
  name: string;
  influencePercent: number;
  /** Their influence minus ours, in percentage points: positive above us, negative below. */
  points: number;
}

/**
 * The factions right above and right below ours in the influence ranking that are within
 * {@link CONFLICT_MARGIN_POINTS} of it: two factions this close can go to war (or election)
 * with each other, whether or not either controls the system. Ties in influence count as
 * neighbours too (111 Tauri's two 8,3% factions are both "below" a 10% faction).
 */
export function closeFactions(
  factions: readonly FactionInfluence[],
  ownFaction: string = FACTION_NAME,
  maxPoints: number = CONFLICT_MARGIN_POINTS,
): CloseFaction[] {
  const own = factions.find(f => f.name === ownFaction);
  if (!own) {
    return [];
  }
  const others = factions.filter(f => f.name !== ownFaction);
  const above = others.filter(f => f.influencePercent >= own.influencePercent);
  const below = others.filter(f => f.influencePercent < own.influencePercent);
  const nearestAbove = Math.min(...above.map(f => f.influencePercent));
  const nearestBelow = Math.max(...below.map(f => f.influencePercent));
  return others
    .filter(f => f.influencePercent === nearestAbove || f.influencePercent === nearestBelow)
    .map(f => ({ name: f.name, influencePercent: f.influencePercent, points: f.influencePercent - own.influencePercent }))
    .filter(f => Math.abs(f.points) <= maxPoints)
    .sort((a, b) => b.points - a.points);
}

/**
 * Every faction the table warns a conflict with ours is possible with: our neighbours in the
 * ranking ({@link closeFactions}, the ⚠️ on the ACFS cell) plus the faction the Margine column
 * measures us against when it's within {@link CONFLICT_MARGIN_POINTS} (the ⚠️ on the margin) —
 * the controller can sit within reach without being our direct neighbour. None while we're
 * already in a conflict here (see {@link alreadyInConflict}).
 */
export function conflictRisks(row: Pick<BgsRow, 'stateEntries' | 'factions' | 'margin'>): CloseFaction[] {
  if (alreadyInConflict(row)) {
    return [];
  }
  const risks = closeFactions(row.factions);
  const margin = row.margin;
  if (margin && Math.abs(margin.points) <= CONFLICT_MARGIN_POINTS && !risks.some(faction => faction.name === margin.versus)) {
    risks.push({ name: margin.versus, influencePercent: margin.versusInfluence, points: -margin.points });
    risks.sort((a, b) => b.points - a.points);
  }
  return risks;
}
