import { alreadyInConflict, closeFactions, conflictRisks } from './close-factions';

describe('closeFactions', () => {
  it('finds the neighbours above and below within 5 points (Geras)', () => {
    const geras = [
      { name: 'Quebecois Patriots', influencePercent: 53.9 },
      { name: 'Geras First', influencePercent: 14.3 },
      { name: 'Geras Systems', influencePercent: 11.6 },
      { name: 'Geras Order', influencePercent: 7.1 },
      { name: 'Flotta Stellare', influencePercent: 6.0 },
      { name: 'Labour of Geras', influencePercent: 4.7 },
      { name: 'Geras Jet Organisation', influencePercent: 2.4 },
    ];
    expect(closeFactions(geras, 'Flotta Stellare').map(f => [f.name, Number(f.points.toFixed(1))])).toEqual([
      ['Geras Order', 1.1],
      ['Labour of Geras', -1.3],
    ]);
  });

  it('keeps every faction tied at the nearest influence, and drops neighbours more than 5 points away', () => {
    const tauri = [
      { name: 'Earth Defense Fleet', influencePercent: 38.1 },
      { name: '111 Tauri Independents', influencePercent: 13.3 },
      { name: 'Flotta Stellare', influencePercent: 10.0 },
      { name: '111 Tauri League', influencePercent: 8.3 },
      { name: 'Crimson Major Industry', influencePercent: 8.3 },
    ];
    expect(closeFactions(tauri, 'Flotta Stellare').map(f => f.name)).toEqual([
      '111 Tauri Independents',
      '111 Tauri League',
      'Crimson Major Industry',
    ]);
    expect(closeFactions([{ name: 'Flotta Stellare', influencePercent: 60 }, { name: 'Other', influencePercent: 30 }], 'Flotta Stellare')).toEqual([]);
  });

  it('treats us as already in conflict during any war or election of ours, or when level with a neighbour', () => {
    const election = { kind: 'election' as const, state: 'Election', status: 'pending' as const, factions: ['Flotta Stellare', 'Canonn'], score: null };
    const retreat = { kind: 'retreat' as const, state: 'Retreat', status: 'active' as const, factions: ['Flotta Stellare'], score: null };
    const spread = [
      { name: 'Canonn', influencePercent: 40 },
      { name: 'Flotta Stellare', influencePercent: 30 },
      { name: 'Other', influencePercent: 28 },
    ];
    // The election is with Canonn, but our influence is frozen: Other, 2 points below, can't start a conflict with us either.
    expect(alreadyInConflict({ stateEntries: [election], factions: spread })).toBe(true);
    expect(alreadyInConflict({ stateEntries: [retreat], factions: spread })).toBe(false);
    const level = [
      { name: 'Canonn', influencePercent: 40 },
      { name: 'Flotta Stellare', influencePercent: 30 },
      { name: 'Other', influencePercent: 30 },
    ];
    expect(alreadyInConflict({ stateEntries: [], factions: level })).toBe(true);
  });

  it('counts exactly 5 points as close', () => {
    const factions = [
      { name: 'Flotta Stellare', influencePercent: 40 },
      { name: 'Other', influencePercent: 35 },
    ];
    expect(closeFactions(factions, 'Flotta Stellare')).toEqual([{ name: 'Other', influencePercent: 35, points: -5 }]);
  });
});

describe('conflictRisks', () => {
  it('lists the close neighbours and the controller within reach, as the table warns about them', () => {
    // Amait on 9 October 2026: Earth Defense Fleet controls, 4,1 points above us.
    const amait = [
      { name: 'Earth Defense Fleet', influencePercent: 35.7 },
      { name: 'Flotta Stellare', influencePercent: 31.6 },
      { name: 'Amait Galactic Network', influencePercent: 12 },
    ];
    const margin = { points: -4.1, versus: 'Earth Defense Fleet', versusInfluence: 35.7, controlled: false };
    expect(conflictRisks({ stateEntries: [], factions: amait, margin }).map(f => f.name)).toEqual(['Earth Defense Fleet']);

    // The controller is within 5 points but another faction sits between us: both count.
    const between = [
      { name: 'Canonn', influencePercent: 35 },
      { name: 'Other', influencePercent: 33 },
      { name: 'Flotta Stellare', influencePercent: 31 },
    ];
    const versusCanonn = { points: -4, versus: 'Canonn', versusInfluence: 35, controlled: false };
    expect(conflictRisks({ stateEntries: [], factions: between, margin: versusCanonn })).toEqual([
      { name: 'Canonn', influencePercent: 35, points: 4 },
      { name: 'Other', influencePercent: 33, points: 2 },
    ]);
  });

  it('lists nothing while we are already in a conflict here', () => {
    const election = { kind: 'election' as const, state: 'Election', status: 'active' as const, factions: ['Flotta Stellare', 'Canonn'], score: null };
    const factions = [
      { name: 'Canonn', influencePercent: 42.3 },
      { name: 'Flotta Stellare', influencePercent: 42.3 },
    ];
    const margin = { points: 0, versus: 'Canonn', versusInfluence: 42.3, controlled: false };
    expect(conflictRisks({ stateEntries: [election], factions, margin })).toEqual([]);
  });
});
