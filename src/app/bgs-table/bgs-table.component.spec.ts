import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { BgsRow } from '../../core/bgs';
import { FACTION_NAME } from '../../core/config';
import { BgsPage, BgsService } from '../bgs.service';
import { BgsTableComponent, comparePriorityRows } from './bgs-table.component';

/** A minimal, fully-populated row — only `systemName` varies between rows in these tests. */
function row(systemName: string): BgsRow {
  return {
    systemName,
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
    stateEntries: [],
    expansionState: null,
    bodyCount: null,
    population: null,
    x: 0,
    y: 0,
    z: 0,
    updatedAt: null,
    watchlist: [],
  };
}

/** Stands in for the real API's own page size — deliberately much bigger than any display page size. */
const SERVER_PAGE_SIZE = 500;
const TOTAL_SYSTEMS = 4106;

function serverPage(page: number): BgsPage {
  const start = page * SERVER_PAGE_SIZE;
  const count = Math.max(0, Math.min(SERVER_PAGE_SIZE, TOTAL_SYSTEMS - start));
  return {
    page,
    rows: Array.from({ length: count }, (_unused, i) => row(`System ${start + i}`)),
    totalCount: TOTAL_SYSTEMS,
    totalPages: Math.max(1, Math.ceil(TOTAL_SYSTEMS / SERVER_PAGE_SIZE)),
  };
}

describe('BgsTableComponent paging against a large API page size (issue #7 follow-up)', () => {
  let fixture: ComponentFixture<BgsTableComponent>;
  let component: BgsTableComponent;
  let service: { getPage: ReturnType<typeof vi.fn>; prefetchPage: ReturnType<typeof vi.fn>; getArchitectRegistry: ReturnType<typeof vi.fn>; getDatasetInfo: ReturnType<typeof vi.fn>; getAllRows: ReturnType<typeof vi.fn> };

  /** Reaches past `protected`/`private` — these are the component's externally observable state. */
  function pageSize(): number {
    return component['pageSize']();
  }
  function visibleRows(): BgsRow[] {
    return component['visibleRows']();
  }

  beforeEach(async () => {
    service = {
      getPage: vi.fn((page: number) => Promise.resolve(serverPage(page))),
      prefetchPage: vi.fn(),
      getArchitectRegistry: vi.fn().mockResolvedValue([]),
      getDatasetInfo: vi.fn().mockResolvedValue({ generatedAt: '2026-10-04T21:28:47Z', tickAt: '2026-10-04T16:06:50Z', count: 500, conflictScoresAvailable: true }),
      // The tick counter's rows; mocked apart so the getPage call counts above stay about paging.
      getAllRows: vi.fn().mockResolvedValue([]),
    };

    await TestBed.configureTestingModule({
      imports: [BgsTableComponent],
      providers: [
        { provide: BgsService, useValue: service },
        { provide: MatDialog, useValue: {} },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BgsTableComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('shows only the default display page size on load, not the whole (500-row) server page', () => {
    expect(pageSize()).toBe(10);
    expect(visibleRows().length).toBe(10);
    expect(visibleRows()[0].systemName).toBe('System 0');
    expect(service.getPage).toHaveBeenCalledTimes(1);
    expect(service.getPage).toHaveBeenCalledWith(0);
  });

  it('switches to a larger display page size using only what was already downloaded', async () => {
    service.getPage.mockClear();

    component['setPageSize'](100);
    await fixture.whenStable();

    expect(pageSize()).toBe(100);
    expect(visibleRows().length).toBe(100);
    // The first server page already had 500 rows buffered — no fetch was needed for this.
    expect(service.getPage).not.toHaveBeenCalled();
  });

  it('fetches another server page only once paging forward runs past what is buffered', async () => {
    component['setPageSize'](100);
    await fixture.whenStable();
    service.getPage.mockClear();

    // Display pages of 100 rows fit 5 to a 500-row server page — pages 2-5 stay within it.
    for (let i = 0; i < 4; i++) {
      component['nextPage']();
      await fixture.whenStable();
    }
    expect(service.getPage).not.toHaveBeenCalled();
    expect(visibleRows().length).toBe(100);
    expect(visibleRows()[0].systemName).toBe('System 400');

    // The 6th display page (rows 500-600) needs the second server page.
    component['nextPage']();
    await fixture.whenStable();

    expect(service.getPage).toHaveBeenCalledWith(1);
    expect(visibleRows().length).toBe(100);
    expect(visibleRows()[0].systemName).toBe('System 500');
  });

  it('does not fetch the same server page twice when a page-size change races the initial load', async () => {
    service.getPage.mockClear();

    // The constructor's own initial buffering fires (and reaches the service) synchronously;
    // racing a page-size change immediately after, before that first fetch resolves, must not
    // capture the same server page index and issue a second request for it.
    const freshFixture = TestBed.createComponent(BgsTableComponent);
    const freshComponent = freshFixture.componentInstance;
    freshComponent['setPageSize'](100);
    await freshFixture.whenStable();

    const pageZeroCalls = service.getPage.mock.calls.filter(([page]) => page === 0).length;
    expect(pageZeroCalls).toBe(1);
    expect(freshComponent['visibleRows']().length).toBe(100);
    expect(freshComponent['visibleRows']()[0].systemName).toBe('System 0');
  });

  it('switches language from the flags, and remembers the choice', async () => {
    localStorage.removeItem('acfs-bgs:lang');
    const host: HTMLElement = fixture.nativeElement;
    const headerText = () => host.querySelector('[aria-controls="bgs-legend"]')!.textContent!.trim();
    expect(headerText()).toBe('Legenda');
    expect(host.querySelector('a[routerLink="/ordini"]')).not.toBeNull();

    host.querySelector<HTMLButtonElement>('.lang-button[lang="de"]')!.click();
    await fixture.whenStable();
    expect(headerText()).toBe('Legende');
    // The Ordini are internal and Italian only: no link to them in the other languages.
    expect(host.querySelector('a[routerLink="/ordini"]')).toBeNull();
    expect(host.querySelector('[title^="Aggiungi "]')).toBeNull();
    expect(host.querySelector('.bgs-pager-status')!.textContent).toContain('Seite 1');
    expect(host.querySelector('.bgs-pager-count')!.textContent).toBe('(4.106 Systeme)');
    expect(document.documentElement.lang).toBe('de');
    expect(localStorage.getItem('acfs-bgs:lang')).toBe('de');

    host.querySelector<HTMLButtonElement>('.lang-button[lang="en"]')!.click();
    await fixture.whenStable();
    expect(headerText()).toBe('Legend');
    expect(host.querySelector('.bgs-pager-count')!.textContent).toBe('(4,106 systems)');

    host.querySelector<HTMLButtonElement>('.lang-button[lang="it"]')!.click();
    await fixture.whenStable();
    expect(headerText()).toBe('Legenda');
    localStorage.removeItem('acfs-bgs:lang');
  });

  it('opens and closes the legend panel from the header button', async () => {
    const host: HTMLElement = fixture.nativeElement;
    const legendButton = host.querySelector<HTMLButtonElement>('[aria-controls="bgs-legend"]')!;
    expect(host.querySelector('#bgs-legend')).toBeNull();

    legendButton.click();
    await fixture.whenStable();
    expect(host.querySelector('#bgs-legend')).not.toBeNull();
    expect(legendButton.getAttribute('aria-expanded')).toBe('true');

    legendButton.click();
    await fixture.whenStable();
    expect(host.querySelector('#bgs-legend')).toBeNull();
  });

  it('sorts by system name from the Sistema header, case-insensitively, and flips on a second click', async () => {
    service.getAllRows.mockResolvedValue([row('Wong Sher'), row('alpha Centauri'), row('Sol'), row('Achenar')]);
    const host: HTMLElement = fixture.nativeElement;
    const header = host.querySelector<HTMLButtonElement>('button[title="Ordina per nome del sistema"]')!;

    header.click();
    await fixture.whenStable();
    expect(visibleRows().map(r => r.systemName)).toEqual(['Achenar', 'alpha Centauri', 'Sol', 'Wong Sher']);
    expect(header.textContent).toContain('▲');

    header.click();
    await fixture.whenStable();
    expect(visibleRows().map(r => r.systemName)).toEqual(['Wong Sher', 'Sol', 'alpha Centauri', 'Achenar']);
    expect(header.textContent).toContain('▼');
  });

  it('keeps the Watchlist systems on top whatever the sort, sorted among themselves', async () => {
    const watched = (systemName: string): BgsRow => ({
      ...row(systemName),
      watchlist: [{ systemName, faction: FACTION_NAME, position: 1, details: '' }],
    });
    service.getAllRows.mockResolvedValue([row('Achenar'), watched('Wong Sher'), row('Sol'), watched('Crowfor')]);
    const host: HTMLElement = fixture.nativeElement;
    const header = host.querySelector<HTMLButtonElement>('button[title="Ordina per nome del sistema"]')!;

    header.click();
    await fixture.whenStable();
    expect(visibleRows().map(r => r.systemName)).toEqual(['Crowfor', 'Wong Sher', 'Achenar', 'Sol']);

    header.click();
    await fixture.whenStable();
    expect(visibleRows().map(r => r.systemName)).toEqual(['Wong Sher', 'Crowfor', 'Sol', 'Achenar']);
  });

  it('opens the State details panel from the State icons, with factions, influence and status', async () => {
    const misir: BgsRow = {
      ...row('Misir'),
      warState: 'active',
      warDetails: 'CivilWar: Flotta Stellare vs Earth Defense Fleet',
      factions: [
        { name: 'Earth Defense Fleet', influencePercent: 30 },
        { name: 'Flotta Stellare', influencePercent: 25 },
      ],
      stateEntries: [
        {
          kind: 'war',
          state: 'CivilWar',
          status: 'active',
          factions: ['Flotta Stellare', 'Earth Defense Fleet'],
          score: { ours: 1, theirs: 2, opponent: 'Earth Defense Fleet', ourStake: null, theirStake: 'Bolden Port', updatedAt: '2026-10-06T08:00:00Z' },
        },
      ],
    };
    service.getAllRows.mockResolvedValue([misir]);
    const host: HTMLElement = fixture.nativeElement;
    host.querySelector<HTMLButtonElement>('button[title="Ordina per nome del sistema"]')!.click();
    await fixture.whenStable();

    host.querySelector<HTMLButtonElement>('.bgs-state-button')!.click();
    await fixture.whenStable();

    const panel = document.querySelector('.bgs-state-panel')!;
    expect(panel.textContent).toContain('Civil War');
    expect(panel.textContent).toContain('in corso');
    expect(panel.textContent).toContain('Earth Defense Fleet');
    expect(panel.textContent).toContain('25,0%');
    expect(panel.textContent).toContain('1-2');
    expect(panel.textContent).toContain('Bolden Port');
  });

  it('marks the services next to the system name and filters to the systems that have one', async () => {
    const zandu: BgsRow = {
      ...row('Zandu'),
      stations: [
        {
          name: 'Vaucanson Hub',
          type: 'Coriolis Starport',
          controllingFaction: FACTION_NAME,
          distanceToArrival: 282,
          services: [
            { kind: 'material-trader', type: 'Encoded' },
            { kind: 'technology-broker', type: null },
          ],
        },
      ],
    };
    service.getAllRows.mockResolvedValue([row('Plain'), zandu]);
    const host: HTMLElement = fixture.nativeElement;
    host.querySelector<HTMLButtonElement>('button[title="Solo i sistemi con un Material Trader o un Technology Broker"]')!.click();
    await fixture.whenStable();

    expect(visibleRows().map(r => r.systemName)).toEqual(['Zandu']);
    const icons = [...host.querySelectorAll<HTMLButtonElement>('.bgs-service-icon')];
    expect(icons.map(icon => icon.title)).toEqual([
      'Material Trader: Encoded\nVaucanson Hub, 282 ls',
      'Technology Broker: tipo non noto\nVaucanson Hub, 282 ls',
    ]);
  });

  it('flags a gap of 5 points or less from the controlling faction or a neighbour, and an expected Retreat', async () => {
    const close: BgsRow = {
      ...row('Amait'),
      controllingFaction: 'Earth Defense Fleet',
      factionInfluence: 31.6,
      margin: { points: -4.1, versus: 'Earth Defense Fleet', versusInfluence: 35.7, controlled: false },
    };
    const edge: BgsRow = {
      ...row('Edge'),
      controllingFaction: FACTION_NAME,
      factionInfluence: 40,
      margin: { points: 5, versus: 'Other', versusInfluence: 35, controlled: true },
    };
    const far: BgsRow = {
      ...row('Far'),
      controllingFaction: 'Other',
      factionInfluence: 10,
      margin: { points: -20, versus: 'Other', versusInfluence: 30, controlled: false },
    };
    const sinking: BgsRow = { ...row('Sinking'), factionInfluence: 2.1 };
    const geras: BgsRow = {
      ...row('Geras'),
      controllingFaction: 'Quebecois Patriots',
      factionInfluence: 6,
      factions: [
        { name: 'Quebecois Patriots', influencePercent: 53.9 },
        { name: 'Geras Order', influencePercent: 7.1 },
        { name: FACTION_NAME, influencePercent: 6 },
        { name: 'Labour of Geras', influencePercent: 4.7 },
      ],
      margin: { points: -47.9, versus: 'Quebecois Patriots', versusInfluence: 53.9, controlled: false },
    };
    // Already in an election with the controller, level with it: nothing left to warn about.
    const voting: BgsRow = {
      ...row('Voting'),
      controllingFaction: 'Canonn',
      factionInfluence: 42.3,
      margin: { points: 0, versus: 'Canonn', versusInfluence: 42.3, controlled: false },
      stateEntries: [{ kind: 'election', state: 'Election', status: 'active', factions: [FACTION_NAME, 'Canonn'], score: null }],
    };
    // At war with another faction, a neighbour 2,6 points below: our influence is frozen, no warning.
    const fighting: BgsRow = {
      ...row('Fighting'),
      controllingFaction: 'LP 254-27 Free',
      factionInfluence: 9.6,
      factions: [
        { name: 'LP 254-27 Free', influencePercent: 64.9 },
        { name: 'Rivals', influencePercent: 9.6 },
        { name: FACTION_NAME, influencePercent: 9.6 },
        { name: 'Neighbours', influencePercent: 7 },
      ],
      margin: { points: -55.3, versus: 'LP 254-27 Free', versusInfluence: 64.9, controlled: false },
      stateEntries: [{ kind: 'war', state: 'War', status: 'active', factions: [FACTION_NAME, 'Rivals'], score: null }],
    };
    service.getAllRows.mockResolvedValue([close, edge, far, sinking, geras, voting, fighting]);
    const host: HTMLElement = fixture.nativeElement;
    host.querySelector<HTMLButtonElement>('button[title="Ordina per nome del sistema"]')!.click();
    await fixture.whenStable();

    const risky = [...host.querySelectorAll<HTMLElement>('td.bgs-margin--risk')].map(cell => cell.textContent!.trim());
    expect(risky).toEqual(['⚠️ −4,1', '⚠️ +5,0']);
    const expected = host.querySelectorAll<HTMLElement>('.bgs-state-icon--expected');
    expect(expected.length).toBe(1);
    expect(expected[0].title).toContain('2,1%');
    const closeCells = host.querySelectorAll<HTMLElement>('td.bgs-influence--close');
    expect(closeCells.length).toBe(1);
    expect(closeCells[0].textContent!.trim()).toMatch(/^⚠️ 6[.,]0%$/);
    expect(closeCells[0].title).toContain('Geras Order (7,1%): sopra di 1,1 punti');
    expect(closeCells[0].title).toContain('Labour of Geras (4,7%): sotto di 1,3 punti');
  });

    /** Types into a quick-filter name field the way a user does (marking it dirty), then leaves it. */
  async function typeAndLeave(label: string, text: string): Promise<void> {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    input.dispatchEvent(new Event('focus'));
    input.value = text;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  it('applies a typed faction name when leaving the field, without Enter', async () => {
    await typeAndLeave('Filtra per nome della fazione', 'Canonn');
    expect(component['factionFilterMode']()).toBe('name');
    expect(component['factionFilterName']()).toBe('Canonn');
  });

  it('does not switch the architect filter on when the field is only clicked in and out of', async () => {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[aria-label="Filtra per nome dell\'architetto"]')!;
    input.dispatchEvent(new Event('focus'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(component['architectFilterMode']()).toBe('all');
  });

  it("explains that filtering by the squadron's own faction keeps every system", async () => {
    await typeAndLeave('Filtra per nome della fazione', FACTION_NAME.toUpperCase());
    const hint = (fixture.nativeElement as HTMLElement).querySelector('.bgs-filter-hint');
    expect(hint?.textContent).toContain('Controllati');

    await typeAndLeave('Filtra per nome della fazione', 'Canonn');
    expect((fixture.nativeElement as HTMLElement).querySelector('.bgs-filter-hint')).toBeNull();
  });
});

describe('comparePriorityRows', () => {
  /** Three otherwise-identical P1 systems (an active war), varying only population/body count. */
  function p1Row(systemName: string, population: number | null, bodyCount: number | null): BgsRow {
    return { ...row(systemName), preferredFaction: 'Flotta Stellare', warState: 'active', population, bodyCount };
  }

  it('breaks a tied priority score by higher population first', () => {
    const highPop = p1Row('High Pop', 10_000_000, 10);
    const lowPop = p1Row('Low Pop', 10, 10);

    expect(comparePriorityRows(highPop, lowPop, 'desc')).toBeLessThan(0); // highPop sorts first
    expect(comparePriorityRows(lowPop, highPop, 'desc')).toBeGreaterThan(0);
  });

  it('breaks a population tie by higher body count', () => {
    const moreBodies = p1Row('More Bodies', 10, 10);
    const fewerBodies = p1Row('Fewer Bodies', 10, 1);

    expect(comparePriorityRows(moreBodies, fewerBodies, 'desc')).toBeLessThan(0);
  });

  it('ranks all three example systems in the requested order regardless of sort direction', () => {
    const highPopHighBodies = p1Row('A', 10_000_000, 10);
    const lowPopHighBodies = p1Row('B', 10, 10);
    const lowPopLowBodies = p1Row('C', 10, 1);
    const systems = [lowPopLowBodies, highPopHighBodies, lowPopHighBodies];

    for (const direction of ['desc', 'asc'] as const) {
      const sorted = [...systems].sort((a, b) => comparePriorityRows(a, b, direction));
      expect(sorted.map(s => s.systemName)).toEqual(['A', 'B', 'C']);
    }
  });

  it('still lets the priority score itself take precedence over population/body count', () => {
    const worseScoreBigSystem = { ...row('Big but quiet'), preferredFaction: 'Flotta Stellare', population: 10_000_000, bodyCount: 50 };
    const betterScoreSmallSystem = p1Row('Small but at war', 1, 1);

    // Descending (highest priority first): the P1 war system beats the quiet big system.
    expect(comparePriorityRows(betterScoreSmallSystem, worseScoreBigSystem, 'desc')).toBeLessThan(0);
  });
});
