import { FACTION_NAME, HOME_SYSTEM } from './config';

/**
 * Each faction's own home system. Retreat only removes a *non-native* faction, so a faction
 * can never retreat from its own home system — every retreat trigger and the retreat icon
 * must be suppressed there.
 *
 * Every colony, including a founding faction's own colony, is treated as non-native — the
 * community still disputes whether colonisation should count, and assuming non-native is the
 * safe direction to be wrong in (it over-warns rather than losing a system).
 */
const HOME_SYSTEMS: ReadonlyMap<string, string> = new Map([[FACTION_NAME, HOME_SYSTEM]]);

export function isHomeSystem(factionName: string, systemName: string): boolean {
  return HOME_SYSTEMS.get(factionName) === systemName;
}

/** `text` with the characters a regular expression treats specially escaped. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether a faction is native to a system, so it can never retreat from it. Spansh doesn't say
 * (nor does EDSM; EliteBGS would, but it's down), so this is a guess: a player faction is native
 * only to its own home system ({@link HOME_SYSTEMS}); an NPC faction is native where the system's
 * name appears, as whole words, in its own ("Alliance of Lowne 1" in Lowne 1, but not in
 * Lowne 10) — the way the game names native factions. A native named otherwise is missed, which
 * only means a Retreat warning too many.
 */
export function isNativeFaction(factionName: string, systemName: string): boolean {
  if (HOME_SYSTEMS.has(factionName)) {
    return isHomeSystem(factionName, systemName);
  }
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(systemName)}($|[^\\p{L}\\p{N}])`, 'iu').test(factionName);
}
