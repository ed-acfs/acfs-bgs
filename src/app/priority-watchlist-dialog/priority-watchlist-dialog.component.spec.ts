import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { BgsRow, FactionDetail } from '../../core/bgs';
import { PriorityWatchlistDialogComponent } from './priority-watchlist-dialog.component';

function faction(name: string, influencePercent: number): FactionDetail {
  return { name, influencePercent, allegiance: null, government: null, activeStates: [] };
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
  it('marks the factions within conflict reach of ours, as the table does', async () => {
    await TestBed.configureTestingModule({
      imports: [PriorityWatchlistDialogComponent],
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { row: amait } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PriorityWatchlistDialogComponent);
    await fixture.whenStable();

    const marks = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.info-risk')];
    expect(marks.map(mark => mark.title)).toEqual([
      '4,1 punti sopra Flotta Stellare: possibile conflitto',
      'Possibile conflitto con: Earth Defense Fleet',
    ]);
    expect(marks[0].closest('tr')!.textContent).toContain('Earth Defense Fleet');
    expect(marks[1].closest('tr')!.textContent).toContain('Flotta Stellare');
  });
});
