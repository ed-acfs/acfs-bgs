import { TestBed } from '@angular/core/testing';
import { ARCHITECT_FORM_ACTION, ARCHITECTS_SHEET_URL, WATCHLIST_SHEET_URL } from '../core/config';
import { BgsService } from './bgs.service';
import { logger } from '../core/logger';

const BGS_DATA_URL = 'data/bgs.json';

function textResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Not Found',
    text: () => Promise.resolve(body),
  } as Response;
}

function dataset(results: unknown[]) {
  return JSON.stringify({ faction: 'Flotta Stellare', generated_at: '2026-10-04T17:49:25.854Z', count: results.length, results });
}

/** The squadron sheets as Google publishes them: the form's own headers, Italian timestamp column included. */
const ARCHITECTS_TSV =
  'Informazioni cronologiche\tYour Name\tSystem Name\tArchitect Name\tACFS Architect\tPreferred Faction\n' +
  '04/10/2026 21:00:00\tSkyflash\tSystem 1\tHabba-Nero\tNot an ACFS Member\tFlotta Stellare\n';
const WATCHLIST_TSV = 'System\tFaction\tPosition\tDetails\nSystem 1\tFlotta Stellare\t1\tKeep control.\n';

function systemRecord(name: string) {
  return { name, controlling_minor_faction: null, x: 0, y: 0, z: 0 };
}

describe('BgsService dataset loading', () => {
  const TOTAL_SYSTEMS = 389;
  let service: BgsService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    const records = Array.from({ length: TOTAL_SYSTEMS }, (_unused, i) => systemRecord(`System ${i}`));
    const responses = new Map<string | null, string>([
      [BGS_DATA_URL, dataset(records)],
      [ARCHITECTS_SHEET_URL, ARCHITECTS_TSV],
      [WATCHLIST_SHEET_URL, WATCHLIST_TSV],
    ]);
    fetchMock = vi.fn((url: string) =>
      responses.has(url)
        ? Promise.resolve(textResponse(responses.get(url)!))
        : Promise.reject(new Error(`Unexpected fetch in test: ${url}`)),
    );
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({});
    service = TestBed.inject(BgsService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns every system on page 0, as a single page', async () => {
    const first = await service.getPage(0);

    expect(first.rows.length).toBe(TOTAL_SYSTEMS);
    expect(first.totalCount).toBe(TOTAL_SYSTEMS);
    expect(first.totalPages).toBe(1);
  });

  it('fetches the dataset once, however many pages and full-dataset reads are requested', async () => {
    const rows = await service.getAllRows();
    await service.getPage(0);
    const beyond = await service.getPage(1);

    expect(rows.length).toBe(TOTAL_SYSTEMS);
    // System 1 is on the watchlist (see WATCHLIST_TSV), so it comes first; then the file's order.
    expect(rows.slice(0, 2).map(row => row.systemName)).toEqual(['System 1', 'System 0']);
    expect(beyond.rows).toEqual([]);
    expect(fetchMock.mock.calls.filter(([url]) => url === BGS_DATA_URL)).toHaveLength(1);
  });

  it('reads the architect registry and the watchlist from the squadron sheets', async () => {
    const page = await service.getPage(0);
    const system1 = page.rows.find(row => row.systemName === 'System 1')!;

    expect(await service.getArchitectRegistry()).toEqual([
      { systemName: 'System 1', architect: 'Habba-Nero', affiliation: 'Not an ACFS Member', preferredFaction: 'Flotta Stellare' },
    ]);
    expect(system1.architect).toBe('Habba-Nero');
    expect(system1.preferredFaction).toBe('Flotta Stellare');
    expect(system1.preferredFactionRecorded).toBe(true);
    expect(system1.watchlist).toEqual([{ systemName: 'System 1', faction: 'Flotta Stellare', position: 1, details: 'Keep control.' }]);
  });

  it('retries the dataset after a failed load instead of caching the failure', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(textResponse('Not Found', 404)));

    await expect(service.getPage(0)).rejects.toThrow();
    const retried = await service.getPage(0);

    expect(retried.rows.length).toBe(TOTAL_SYSTEMS);
  });

  it('submits an assignment to the squadron form, as an opaque no-cors POST', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 0, type: 'opaque' } as Response));

    await service.submitAssignment({ yourName: 'Cmdr', systemName: 'Wong Sher', architect: '', affiliation: '', preferredFaction: '' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ARCHITECT_FORM_ACTION);
    expect(init.method).toBe('POST');
    expect(init.mode).toBe('no-cors');
    expect(String(init.body)).toContain('entry.2086138170=Wong+Sher');
  });

  it('writes through the protected Apps Script, once configured, with the password in a text/plain JSON body', async () => {
    service.assignScriptUrl = 'https://script.google.com/macros/s/test/exec';
    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response));

    await service.submitAssignment({ yourName: 'Cmdr', systemName: 'Wong Sher', architect: '', affiliation: "Don't know", preferredFaction: '' }, 'segreta');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://script.google.com/macros/s/test/exec');
    expect(init.mode).toBeUndefined();
    expect((init.headers as Record<string, string>)['Content-Type']).toContain('text/plain');
    expect(JSON.parse(String(init.body))).toMatchObject({ password: 'segreta', systemName: 'Wong Sher' });
  });

  it("rejects with the script's reason when it refuses the assignment", async () => {
    service.assignScriptUrl = 'https://script.google.com/macros/s/test/exec';
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: false, error: 'password' }) } as Response),
    );

    await expect(
      service.submitAssignment({ yourName: 'Cmdr', systemName: 'Wong Sher', architect: '', affiliation: "Don't know", preferredFaction: '' }, 'sbagliata'),
    ).rejects.toMatchObject({ name: 'AssignRejectedError', reason: 'password' });
  });
});

interface FactionPresenceFixture {
  name: string;
  influence: number;
  active_states?: string[];
  pending_states?: string[];
}

function systemWithPresences(
  name: string,
  presences: FactionPresenceFixture[],
  extra: { body_count?: number; population?: number; ebgs_conflicts?: unknown } = {},
) {
  return { name, controlling_minor_faction: null, x: 0, y: 0, z: 0, minor_faction_presences: presences, ...extra };
}

describe('BgsService state summarisation (retreat, FR-1/FR-2)', () => {
  let service: BgsService;
  let fetchMock: ReturnType<typeof vi.fn>;
  let records: ReturnType<typeof systemWithPresences>[];

  beforeEach(() => {
    localStorage.clear();
    records = [];
    fetchMock = vi.fn((url: string) =>
      url === BGS_DATA_URL
        ? Promise.resolve(textResponse(dataset(records)))
        : Promise.reject(new Error(`Unexpected fetch in test: ${url}`)),
    );
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({});
    service = TestBed.inject(BgsService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders an active retreat for a single faction, with no second corroborator required', async () => {
    records = [
      systemWithPresences('Varati Ring', [
        { name: 'Flotta Stellare', influence: 0.021, active_states: ['Retreat'] },
        { name: 'Other Faction', influence: 0.5 },
      ]),
    ];

    const page = await service.getPage(0);

    expect(page.rows[0].retreatState).toBe('active');
    expect(page.rows[0].retreatDetails).toBe('Retreat: Flotta Stellare (2.1%)');
  });

  it('lists the State details as structured entries, our faction first, active winning over pending', async () => {
    records = [
      systemWithPresences('Misir', [
        { name: 'Earth Defense Fleet', influence: 0.3, active_states: ['CivilWar'] },
        { name: 'Flotta Stellare', influence: 0.25, active_states: ['CivilWar'], pending_states: ['Election'] },
        { name: 'Civitas Dei', influence: 0.2, pending_states: ['Election'] },
      ]),
    ];

    const page = await service.getPage(0);

    expect(page.rows[0].stateEntries).toEqual([
      { kind: 'war', state: 'CivilWar', status: 'active', factions: ['Flotta Stellare', 'Earth Defense Fleet'], score: null },
      { kind: 'election', state: 'Election', status: 'pending', factions: ['Flotta Stellare', 'Civitas Dei'], score: null },
    ]);
  });

  it("attaches EliteBGS's score to an active conflict from our side, our days first", async () => {
    records = [
      systemWithPresences(
        'Misir',
        [
          { name: 'Earth Defense Fleet', influence: 0.3, active_states: ['CivilWar'] },
          { name: 'Flotta Stellare', influence: 0.3, active_states: ['CivilWar'] },
        ],
        {
          ebgs_conflicts: {
            updated_at: '2026-10-06T08:00:00.000Z',
            conflicts: [
              { type: 'election', status: 'active', faction1: { name: 'Someone', stake: null, days_won: 3 }, faction2: { name: 'Else', stake: null, days_won: 0 } },
              {
                type: 'civilwar',
                status: 'active',
                faction1: { name: 'Earth Defense Fleet', stake: 'Bolden Port', days_won: 2 },
                faction2: { name: 'flotta stellare', stake: null, days_won: 1 },
              },
            ],
          },
        },
      ),
    ];

    const page = await service.getPage(0);

    expect(page.rows[0].stateEntries[0].score).toEqual({
      ours: 1,
      theirs: 2,
      opponent: 'Earth Defense Fleet',
      ourStake: null,
      theirStake: 'Bolden Port',
      updatedAt: '2026-10-06T08:00:00.000Z',
    });
  });

  it('gives no score when EliteBGS has none for the conflict, or the conflict is still pending', async () => {
    const conflicts = { updated_at: null, conflicts: [] };
    records = [
      systemWithPresences('A', [
        { name: 'Flotta Stellare', influence: 0.3, active_states: ['War'] },
        { name: 'Other', influence: 0.3, active_states: ['War'] },
      ], { ebgs_conflicts: conflicts }),
      systemWithPresences('B', [
        { name: 'Flotta Stellare', influence: 0.3, pending_states: ['Election'] },
        { name: 'Other', influence: 0.3, pending_states: ['Election'] },
      ], {
        ebgs_conflicts: {
          updated_at: null,
          conflicts: [{ type: 'election', status: 'pending', faction1: { name: 'Flotta Stellare', stake: null, days_won: 0 }, faction2: { name: 'Other', stake: null, days_won: 0 } }],
        },
      }),
    ];

    const page = await service.getPage(0);

    expect(page.rows.map(r => r.stateEntries[0].score)).toEqual([null, null]);
  });

  it('does not log an anomaly for an unpaired pending retreat (R9 only applies to two-party states)', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const logSpy = vi.spyOn(logger, 'log');
    records = [
      systemWithPresences('Varati Ring', [
        { name: 'Flotta Stellare', influence: 0.05, pending_states: ['Retreat'] },
      ]),
    ];

    const page = await service.getPage(0);
    const anomalyCalls = (calls: unknown[][]) => calls.filter(([message]) => message === 'BGS conflict-state anomaly');

    expect(page.rows[0].retreatState).toBe('pending');
    expect(anomalyCalls(warnSpy.mock.calls)).toEqual([]);
    expect(anomalyCalls(logSpy.mock.calls)).toEqual([]);
  });

  it('suppresses the retreat icon for a faction in its own home system', async () => {
    records = [
      systemWithPresences('Wong Sher', [{ name: 'Flotta Stellare', influence: 0.02, active_states: ['Retreat'] }]),
    ];

    const page = await service.getPage(0);

    expect(page.rows[0].retreatState).toBeNull();
  });

  it('still surfaces a retreat for the same faction away from its home system', async () => {
    records = [
      systemWithPresences('Some Other System', [{ name: 'Flotta Stellare', influence: 0.02, active_states: ['Retreat'] }]),
    ];

    const page = await service.getPage(0);

    expect(page.rows[0].retreatState).toBe('active');
  });

  it('maps body_count and population through to the row, defaulting to null when the API omits them', async () => {
    records = [
      systemWithPresences('With Data', [], { body_count: 32, population: 26481079 }),
      systemWithPresences('Without Data', []),
    ];

    const page = await service.getPage(0);

    expect(page.rows[0].bodyCount).toBe(32);
    expect(page.rows[0].population).toBe(26481079);
    expect(page.rows[1].bodyCount).toBeNull();
    expect(page.rows[1].population).toBeNull();
  });
});
