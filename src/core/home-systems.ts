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
