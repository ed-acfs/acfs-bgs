import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { BgsRow, FactionDetail } from '../../core/bgs';
import { PriorityWatchlistDialogComponent } from './priority-watchlist-dialog.component';

function faction(name: string, influencePercent: number, activeStates: string[] = []): FactionDetail {
  return { name, influencePercent, allegiance: null, government: null, activeStates };
}

/** Amait on 9 October 2026: Earth Defense Fleet controls, 4,1 points above Flotta Stellare. */
const amait = {
  systemName: 'Amait',
  controllingFaction: 'Earth Defense Fleet',
  population: null,
  stationCount: null,
  bodyCount: null,
  stations: [],
  watchlist: [],
  stateEntries: [],
  factions: [
    { name: 'Earth Defense Fleet', influencePercent: 35.7 },
    { name: 'Flotta Stellare', influencePercent: 31.6 },
    { name: 'Amait Galactic Network', influencePercent: 12 },
  ],
  factionDetails: [faction('Earth Defense Fleet', 35.7), faction('Flotta Stellare', 31.6), faction('Amait Galactic Network', 12)],
  margin: { points: -4.1, versus: 'Earth Defense Fleet', versusInfluence: 35.7, controlled: false },
} as unknown as BgsRow;

describe('PriorityWatchlistDialogComponent', () => {
  async function open(row: BgsRow): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [PriorityWatchlistDialogComponent],
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { row } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PriorityWatchlistDialogComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  /** The text of the cells in the faction table's row for `name`. */
  function factionRow(host: HTMLElement, name: string): HTMLTableRowElement {
    return [...host.querySelectorAll<HTMLTableRowElement>('tr')].find(tr => tr.cells[0]?.textContent?.includes(name))!;
  }

  it('marks the factions within conflict reach of ours, as the table does', async () => {
    const host = await open(amait);

    const marks = [...host.querySelectorAll<HTMLElement>('.info-risk')];
    expect(marks.map(mark => mark.title)).toEqual([
      '4,1 punti sopra Flotta Stellare: possibile conflitto',
      'Possibile conflitto con: Earth Defense Fleet',
    ]);
    expect(marks[0].closest('tr')!.textContent).toContain('Earth Defense Fleet');
    expect(marks[1].closest('tr')!.textContent).toContain('Flotta Stellare');
  });

  it('marks the native factions with an N, and warns of a Retreat only for the others', async () => {
    const host = await open({
      ...amait,
      factionDetails: [
        ...amait.factionDetails,
        faction('Fellowship of 11', 2.1),
        faction('Betel Free', 3, ['Retreat']),
        faction('Amait Monarchy', 1.9),
      ],
    });

    expect(factionRow(host, 'Amait Galactic Network').querySelector('.info-native')).not.toBeNull();
    expect(factionRow(host, 'Amait Monarchy').querySelector('.info-native')).not.toBeNull();
    expect(factionRow(host, 'Earth Defense Fleet').querySelector('.info-native')).toBeNull();
    expect(factionRow(host, 'Flotta Stellare').querySelector('.info-native')).toBeNull();

    expect(factionRow(host, 'Fellowship of 11').querySelector<HTMLElement>('.info-risk')!.title).toBe(
      'Al 2,5% o meno: Retreat probabile al prossimo tick',
    );
    expect(factionRow(host, 'Betel Free').querySelector<HTMLElement>('.info-risk')!.title).toBe(
      'In Retreat: se resta sotto il 2,5%, lascia il sistema',
    );
    // Native: it can't retreat, however low it goes.
    expect(factionRow(host, 'Amait Monarchy').querySelector('.info-risk')).toBeNull();
  });
});
