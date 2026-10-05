import { derivePreferredFaction } from './bgs';
import { FACTION_NAME } from './config';

describe('derivePreferredFaction', () => {
  it('is our faction when it already controls the system', () => {
    expect(derivePreferredFaction({ controllingFaction: FACTION_NAME })).toBe(FACTION_NAME);
  });

  it('is null when another faction controls it', () => {
    expect(derivePreferredFaction({ controllingFaction: 'Earth Defense Fleet' })).toBeNull();
  });

  it('is null when nobody controls it yet', () => {
    expect(derivePreferredFaction({ controllingFaction: null })).toBeNull();
  });
});
