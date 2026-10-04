import { derivePreferredFaction, isOwnStation } from './bgs';
import { FACTION_NAME } from './config';

describe('isOwnStation', () => {
  it('is true only for a station our faction controls', () => {
    expect(isOwnStation({ name: 'Starport', type: 'Coriolis Starport', controlling_minor_faction: FACTION_NAME })).toBe(true);
    expect(isOwnStation({ name: 'Outpost', type: 'Outpost', controlling_minor_faction: 'Earth Defense Fleet' })).toBe(false);
    expect(isOwnStation({ name: 'Outpost', type: 'Outpost', controlling_minor_faction: null })).toBe(false);
  });
});

describe('derivePreferredFaction', () => {
  it('is our faction when it controls a station in the system', () => {
    expect(derivePreferredFaction({ hasOwnStation: true })).toBe(FACTION_NAME);
  });

  it('is null when it controls none', () => {
    expect(derivePreferredFaction({ hasOwnStation: false })).toBeNull();
  });
});
