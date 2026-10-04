import {
  ArchitectRegistryRow,
  architectNames,
  architectsWithAffiliation,
  buildArchitectInfoMap,
  findArchitectProfile,
  suggestArchitects,
} from './architect-registry';

function row(partial: Partial<ArchitectRegistryRow>): ArchitectRegistryRow {
  return { systemName: '', architect: '', affiliation: '', preferredFaction: '', ...partial };
}

describe('buildArchitectInfoMap', () => {
  it('keeps the last row for a system, since the registry is append-only', () => {
    const map = buildArchitectInfoMap([
      row({ systemName: 'Varati', architect: 'Old', preferredFaction: 'Flotta Stellare' }),
      row({ systemName: 'Varati', architect: 'New', preferredFaction: 'Earth Defense Fleet' }),
    ]);
    expect(map.get('Varati')).toEqual({ architect: 'New', affiliation: '', preferredFaction: 'Earth Defense Fleet' });
  });

  it('skips rows with no system name', () => {
    expect(buildArchitectInfoMap([row({ architect: 'Nobody' })]).size).toBe(0);
  });

  it('carries the affiliation through, so a "not a colony" answer can be told apart from no answer at all', () => {
    const map = buildArchitectInfoMap([
      row({ systemName: 'Varati', architect: '', affiliation: 'Nobody The System Is Not a Colony' }),
    ]);
    expect(map.get('Varati')?.affiliation).toBe('Nobody The System Is Not a Colony');
  });
});

describe('architectNames', () => {
  it('de-duplicates case-insensitively, keeping the most recent spelling, sorted A-Z', () => {
    const names = architectNames([
      row({ systemName: 'A', architect: 'herix' }),
      row({ systemName: 'B', architect: 'Alexa Chaney' }),
      row({ systemName: 'C', architect: 'Herix' }),
      row({ systemName: 'D', architect: '' }),
    ]);
    expect(names).toEqual(['Alexa Chaney', 'Herix']);
  });
});

describe('suggestArchitects', () => {
  const names = ['Alexa Chaney', 'Enrique Delgado', 'Herix', 'IamNickMan'];

  it('ranks prefix matches ahead of mid-name matches', () => {
    expect(suggestArchitects(names, 'nick')).toEqual(['IamNickMan']);
    expect(suggestArchitects(names, 'e')).toEqual(['Enrique Delgado', 'Alexa Chaney', 'Herix']);
  });

  it('is case-insensitive and caps the result count', () => {
    expect(suggestArchitects(names, 'HER')).toEqual(['Herix']);
    expect(suggestArchitects(names, '', 2)).toEqual(['Alexa Chaney', 'Enrique Delgado']);
  });
});

describe('findArchitectProfile', () => {
  const rows = [
    row({ systemName: 'A', architect: 'Herix', affiliation: 'Not an ACFS Member', preferredFaction: 'Flat Galaxy Society' }),
    row({ systemName: 'B', architect: 'herix', affiliation: '', preferredFaction: 'Flat Galaxy Society' }),
    row({ systemName: 'C', architect: 'Herix', affiliation: 'The Architect is an ACFS Member', preferredFaction: '' }),
    row({ systemName: 'D', architect: 'Someone Else', preferredFaction: 'Flotta Stellare' }),
  ];

  it('returns null for an unknown or blank name', () => {
    expect(findArchitectProfile(rows, 'Brand New CMDR')).toBeNull();
    expect(findArchitectProfile(rows, '   ')).toBeNull();
  });

  it('takes the most recent non-blank answers and counts the preferred faction', () => {
    const profile = findArchitectProfile(rows, ' herix ');
    expect(profile).toEqual({
      name: 'Herix',
      affiliation: 'The Architect is an ACFS Member',
      preferredFaction: 'Flat Galaxy Society',
      preferredFactionCount: 2,
    });
  });

  it('ignores the system currently being assigned', () => {
    const profile = findArchitectProfile(rows, 'Herix', 'A');
    expect(profile?.preferredFactionCount).toBe(1);
    expect(findArchitectProfile([rows[0]], 'Herix', 'A')).toBeNull();
  });
});

describe('architectsWithAffiliation', () => {
  const MEMBER = 'The Architect is an ACFS Member';

  it('lists architects whose latest answered affiliation is membership, case-insensitively', () => {
    const rows = [
      row({ systemName: 'A', architect: 'Habba-Nero', affiliation: MEMBER }),
      row({ systemName: 'B', architect: 'Machu', affiliation: "Don't know" }),
    ];
    expect(architectsWithAffiliation(rows, MEMBER)).toEqual(new Set(['habba-nero']));
  });

  it('keeps membership across a later blank answer, but not across a later different one', () => {
    const rows = [
      row({ systemName: 'A', architect: 'Habba-Nero', affiliation: MEMBER }),
      row({ systemName: 'B', architect: 'Habba-Nero', affiliation: '' }),
      row({ systemName: 'C', architect: 'Donkiro', affiliation: MEMBER }),
      row({ systemName: 'D', architect: 'Donkiro', affiliation: 'Not an ACFS Member' }),
    ];
    expect(architectsWithAffiliation(rows, MEMBER)).toEqual(new Set(['habba-nero']));
  });

  it('ignores rows without an architect', () => {
    expect(architectsWithAffiliation([row({ systemName: 'A', affiliation: MEMBER })], MEMBER)).toEqual(new Set());
  });
});
