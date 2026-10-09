import { isNativeFaction } from './home-systems';

describe('isNativeFaction', () => {
  it('takes an NPC faction as native where its name holds the system name, as whole words', () => {
    expect(isNativeFaction('Alliance of Lowne 1', 'Lowne 1')).toBe(true);
    expect(isNativeFaction('Lowne 1 Purple Legal Commodities', 'Lowne 1')).toBe(true);
    expect(isNativeFaction('Traditional 37 Geminorum Constitution Party', '37 Geminorum')).toBe(true);
    expect(isNativeFaction('Co-operative of Amait', 'AMAIT')).toBe(true);
    expect(isNativeFaction('Alliance of Lowne 10', 'Lowne 1')).toBe(false);
    expect(isNativeFaction('Earth Defense Fleet', 'Amait')).toBe(false);
  });

  it('takes Flotta Stellare as native to Wong Sher only', () => {
    expect(isNativeFaction('Flotta Stellare', 'Wong Sher')).toBe(true);
    expect(isNativeFaction('Flotta Stellare', 'Amait')).toBe(false);
  });
});
