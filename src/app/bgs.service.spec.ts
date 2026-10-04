import { TestBed } from '@angular/core/testing';
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
    expect(rows[0].systemName).toBe('System 0');
    expect(beyond.rows).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes no request to any sheet while none is configured', async () => {
    await service.getPage(0);

    expect(await service.getArchitectRegistry()).toEqual([]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([BGS_DATA_URL]);
  });

  it('retries the dataset after a failed load instead of caching the failure', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(textResponse('Not Found', 404)));

    await expect(service.getPage(0)).rejects.toThrow();
    const retried = await service.getPage(0);

    expect(retried.rows.length).toBe(TOTAL_SYSTEMS);
  });

  it('refuses to submit an assignment while no registry form is configured', async () => {
    await expect(
      service.submitAssignment({ yourName: 'Cmdr', systemName: 'Wong Sher', architect: '', affiliation: '', preferredFaction: '' }),
    ).rejects.toThrow('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
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
  extra: { body_count?: number; population?: number } = {},
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
        { name: 'Canonn Deep Space Research', influence: 0.021, active_states: ['Retreat'] },
        { name: 'Other Faction', influence: 0.5 },
      ]),
    ];

    const page = await service.getPage(0);

    expect(page.rows[0].retreatState).toBe('active');
    expect(page.rows[0].retreatDetails).toBe('Retreat: Canonn Deep Space Research (2.1%)');
  });

  it('does not log an anomaly for an unpaired pending retreat (R9 only applies to two-party states)', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const logSpy = vi.spyOn(logger, 'log');
    records = [
      systemWithPresences('Varati Ring', [
        { name: 'Canonn Deep Space Research', influence: 0.05, pending_states: ['Retreat'] },
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
      systemWithPresences('Some Other System', [{ name: 'Canonn', influence: 0.02, active_states: ['Retreat'] }]),
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
