import { buildWatchlistMap, parseWatchlistTsv, watchlistFirst } from './priority-watchlist';

describe('parseWatchlistTsv', () => {
  it('parses rows by column name, trimming whitespace', () => {
    const tsv = 'System\tFaction\tPosition\tDetails\nVarati\tFlotta Stellare\t1\tKey waypoint.\n';
    expect(parseWatchlistTsv(tsv)).toEqual([
      { systemName: 'Varati', faction: 'Flotta Stellare', position: 1, details: 'Key waypoint.' },
    ]);
  });

  it('is tolerant of reordered columns, since they are matched by name', () => {
    const tsv = 'Details\tPosition\tFaction\tSystem\nWhy it matters\t2\tEarth Defense Fleet\tHaiden\n';
    expect(parseWatchlistTsv(tsv)).toEqual([
      { systemName: 'Haiden', faction: 'Earth Defense Fleet', position: 2, details: 'Why it matters' },
    ]);
  });

  it('returns an empty array when the expected columns are missing', () => {
    expect(parseWatchlistTsv('Foo\tBar\n1\t2\n')).toEqual([]);
  });

  it('skips rows with a blank system/faction or a non-positive-integer position', () => {
    const tsv = [
      'System\tFaction\tPosition\tDetails',
      '\tFlotta Stellare\t1\tNo system name',
      'Varati\t\t1\tNo faction',
      'Varati\tFlotta Stellare\t0\tZero position',
      'Varati\tFlotta Stellare\tnot-a-number\tBad position',
      'Varati\tFlotta Stellare\t1\tThis one is fine',
    ].join('\n');
    expect(parseWatchlistTsv(tsv)).toEqual([
      { systemName: 'Varati', faction: 'Flotta Stellare', position: 1, details: 'This one is fine' },
    ]);
  });
});

describe('buildWatchlistMap', () => {
  it('groups entries by system, preserving multiple entries for the same system', () => {
    const map = buildWatchlistMap([
      { systemName: 'Varati', faction: 'Flotta Stellare', position: 1, details: 'A' },
      { systemName: 'Varati', faction: 'Earth Defense Fleet', position: 2, details: 'B' },
      { systemName: 'Haiden', faction: 'Flotta Stellare', position: 1, details: 'C' },
    ]);
    expect(map.get('Varati')).toEqual([
      { systemName: 'Varati', faction: 'Flotta Stellare', position: 1, details: 'A' },
      { systemName: 'Varati', faction: 'Earth Defense Fleet', position: 2, details: 'B' },
    ]);
    expect(map.get('Haiden')).toEqual([{ systemName: 'Haiden', faction: 'Flotta Stellare', position: 1, details: 'C' }]);
    expect(map.get('Nonexistent')).toBeUndefined();
  });
});

describe('watchlistFirst', () => {
  const entry = { systemName: 'x', faction: 'Flotta Stellare', position: 1, details: '' };
  const row = (name: string, watched: boolean) => ({ name, watchlist: watched ? [entry] : [] });

  it('puts watched systems first, keeping the original order within both groups', () => {
    const rows = [row('A', false), row('B', true), row('C', false), row('D', true)];
    expect(watchlistFirst(rows).map(r => r.name)).toEqual(['B', 'D', 'A', 'C']);
  });

  it('leaves the order alone when nothing is watched', () => {
    const rows = [row('A', false), row('B', false)];
    expect(watchlistFirst(rows).map(r => r.name)).toEqual(['A', 'B']);
  });
});
