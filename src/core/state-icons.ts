/**
 * The game's own icons for the faction states we have them for (orange, as in the system map),
 * served from `public/icons/states/`. Paths are relative, so they follow the site's base href.
 * Election keeps the squadron's own 🗳️ (see {@link STATE_EMOJI}); the other states (War,
 * Famine…) have no icon yet and stay plain text.
 */
export const STATE_ICONS: Readonly<Record<string, string>> = {
  Boom: 'icons/states/boom.png',
  Bust: 'icons/states/bust.png',
  Expansion: 'icons/states/expansion.png',
  Lockdown: 'icons/states/lockdown.png',
  Retreat: 'icons/states/retreat.png',
};

/** The Retreat icon: the State column, the Legend and the system details draw it in place of an emoji. */
export const RETREAT_ICON = STATE_ICONS['Retreat'];

/** States drawn with an emoji instead: the 🗳️ the squadron has used for elections for years. */
export const STATE_EMOJI: Readonly<Record<string, string>> = {
  Election: '🗳️',
};

/** The icon for a state as Spansh names it ("Boom", "Civil War"…), or null when there's none. */
export function stateIcon(state: string): string | null {
  return STATE_ICONS[state] ?? null;
}
