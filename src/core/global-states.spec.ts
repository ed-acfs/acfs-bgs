import type { FactionDetail } from './bgs';
import { readGlobalStates } from './global-states';

function faction(name: string, activeStates: string[] = [], pendingStates: string[] = []): FactionDetail {
  return { name, influencePercent: 10, allegiance: null, government: null, activeStates, pendingStates };
}

describe('readGlobalStates', () => {
  it("reads each faction's Expansion from the freshest system it is in", () => {
    const readings = readGlobalStates([
      // Amait on 9 October 2026: Spansh still had our Expansion pending, from 7 October.
      { systemName: 'Amait', updatedAt: '2026-10-07 16:15:45+00', factionDetails: [faction('Flotta Stellare', [], ['Expansion'])] },
      {
        systemName: 'Wong Sher',
        updatedAt: '2026-10-09 18:11:00+00',
        factionDetails: [faction('Flotta Stellare', ['Expansion', 'Boom']), faction('Wong Sher Nobles')],
      },
      { systemName: 'No date', updatedAt: null, factionDetails: [faction('Flotta Stellare')] },
    ]);

    expect(readings.get('Flotta Stellare')).toEqual({
      sourceSystem: 'Wong Sher',
      updatedAtMs: Date.parse('2026-10-09T18:11:00Z'),
      // Boom is local: only global states are read.
      active: ['Expansion'],
      pending: [],
    });
    expect(readings.get('Wong Sher Nobles')!.active).toEqual([]);
  });

  it('reads an Expansion as over when the freshest system no longer has it', () => {
    const readings = readGlobalStates([
      { systemName: 'Old', updatedAt: '2026-10-01 10:00:00+00', factionDetails: [faction('Canonn', ['Expansion'])] },
      { systemName: 'New', updatedAt: '2026-10-08 10:00:00+00', factionDetails: [faction('Canonn')] },
    ]);
    expect(readings.get('Canonn')).toMatchObject({ sourceSystem: 'New', active: [], pending: [] });
  });
});
