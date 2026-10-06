import { alreadyInConflict, closeFactions } from './close-factions';

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

  it('treats a faction we are at war or election with, or level with, as already in conflict', () => {
    const row = {
      stateEntries: [
        { kind: 'election' as const, state: 'Election', status: 'pending' as const, factions: ['Flotta Stellare', 'Canonn'], score: null },
        { kind: 'retreat' as const, state: 'Retreat', status: 'active' as const, factions: ['Flotta Stellare'], score: null },
      ],
    };
    expect(alreadyInConflict(row, 'Canonn', -2)).toBe(true);
    expect(alreadyInConflict(row, 'Other', 0)).toBe(true);
    expect(alreadyInConflict(row, 'Other', 1.1)).toBe(false);
  });

  it('counts exactly 5 points as close', () => {
    const factions = [
      { name: 'Flotta Stellare', influencePercent: 40 },
      { name: 'Other', influencePercent: 35 },
    ];
    expect(closeFactions(factions, 'Flotta Stellare')).toEqual([{ name: 'Other', influencePercent: 35, points: -5 }]);
  });
});
