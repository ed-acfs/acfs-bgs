import { HOME_SYSTEM } from './config';
import { retreatExpected } from './retreat';

describe('retreatExpected', () => {
  const row = (factionInfluence: number | null, retreatState: 'active' | 'pending' | null = null, systemName = 'Lalande 15394') => ({
    systemName,
    factionInfluence,
    retreatState,
  });

  it('warns at or below 2.5% influence, before Spansh reports the state', () => {
    expect(retreatExpected(row(2.5))).toBe(true);
    expect(retreatExpected(row(1.2))).toBe(true);
    expect(retreatExpected(row(2.6))).toBe(false);
    expect(retreatExpected(row(null))).toBe(false);
  });

  it('stays quiet once the Retreat is already a state, and in the home system', () => {
    expect(retreatExpected(row(2, 'pending'))).toBe(false);
    expect(retreatExpected(row(2, 'active'))).toBe(false);
    expect(retreatExpected(row(2, null, HOME_SYSTEM))).toBe(false);
  });
});
