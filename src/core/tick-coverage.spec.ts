import { BgsRow } from './bgs';
import { FACTION_NAME } from './config';
import { computeTickCoverage, formatTickCoverage } from './tick-coverage';

const OWN = FACTION_NAME;
const TICK = '2026-10-04T16:06:50.000Z';
const NOW = Date.parse('2026-10-04T22:00:00Z');
const AFTER_TICK = '2026-10-04 18:00:00+00';
const BEFORE_TICK = '2026-10-04 12:00:00+00';

/** A minimal, fully-populated row — tests override only the fields they care about. */
function row(overrides: Partial<BgsRow> = {}): BgsRow {
  return {
    systemName: 'Test System',
    controllingFaction: null,
    factionInfluence: null,
    margin: null,
    architect: null,
    architectAffiliation: null,
    notAColony: false,
    preferredFaction: null,
    preferredFactionRecorded: false,
    factionDetails: [],
    stations: [],
    stationCount: null,
    factions: [],
    warState: null,
    warDetails: null,
    electionState: null,
    electionDetails: null,
    retreatState: null,
    retreatDetails: null,
    expansionState: null,
    bodyCount: null,
    population: null,
    x: 0,
    y: 0,
    z: 0,
    updatedAt: null,
    watchlist: [],
    ...overrides,
  };
}

/** An active retreat of our own faction: always P1. */
function p1(updatedAt: string | null): BgsRow {
  return row({ preferredFaction: OWN, retreatState: 'active', factions: [{ name: OWN, influencePercent: 2 }], updatedAt });
}

/** Registered with another faction: out of scope, never counted among the priorities. */
function outOfScope(updatedAt: string | null): BgsRow {
  return row({ preferredFaction: 'Canonn', preferredFactionRecorded: true, factionInfluence: 10, updatedAt });
}

describe('computeTickCoverage', () => {
  it('counts the systems updated at or after the tick, overall and among P1-P2', () => {
    const rows = [p1(AFTER_TICK), p1(BEFORE_TICK), p1(null), outOfScope(AFTER_TICK), outOfScope(BEFORE_TICK)];

    expect(computeTickCoverage(rows, TICK, NOW)).toEqual({ updated: 2, total: 5, topUpdated: 1, topTotal: 3 });
  });

  it('counts a system updated exactly at the tick as updated', () => {
    expect(computeTickCoverage([outOfScope('2026-10-04 16:06:50+00')], TICK, NOW)?.updated).toBe(1);
  });

  it('is null when the tick time is unknown or unreadable', () => {
    expect(computeTickCoverage([p1(AFTER_TICK)], null, NOW)).toBeNull();
    expect(computeTickCoverage([p1(AFTER_TICK)], 'not a date', NOW)).toBeNull();
  });
});

describe('formatTickCoverage', () => {
  it('reads like the header line', () => {
    expect(formatTickCoverage({ updated: 214, total: 389, topUpdated: 18, topTotal: 25 })).toBe(
      "214/389 aggiornati dall'ultimo tick · P1-P2: 18/25",
    );
  });
});
