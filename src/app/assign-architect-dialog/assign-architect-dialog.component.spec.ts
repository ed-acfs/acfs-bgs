import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { BgsRow } from '../../core/bgs';
import { BgsService } from '../bgs.service';
import {
  AFFILIATION_SQUADRON_MEMBER,
  AFFILIATION_NOT_A_COLONY,
  AFFILIATION_NOT_MEMBER,
  AFFILIATION_UNKNOWN,
} from '../../core/architect-form';
import { ArchitectRegistryRow } from '../../core/architect-registry';
import { AssignArchitectDialogComponent } from './assign-architect-dialog.component';

const ROW: BgsRow = {
  systemName: 'Varati',
  controllingFaction: 'Local Lads',
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
  // Highest influence first, as the service builds them.
  factions: [
    { name: 'Local Lads', influencePercent: 60 },
    { name: 'Flotta Stellare', influencePercent: 40 },
    { name: 'Earth Defense Fleet', influencePercent: 20 },
  ],
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
};

const REGISTRY: ArchitectRegistryRow[] = [
  {
    systemName: 'Some Other System',
    architect: 'Herix',
    affiliation: AFFILIATION_NOT_MEMBER,
    preferredFaction: 'Flat Galaxy Society',
  },
  {
    systemName: 'Yet Another System',
    architect: 'Herix',
    affiliation: AFFILIATION_NOT_MEMBER,
    preferredFaction: 'Flat Galaxy Society',
  },
];

describe('AssignArchitectDialogComponent', () => {
  let fixture: ComponentFixture<AssignArchitectDialogComponent>;
  let component: AssignArchitectDialogComponent;
  let dialogRef: { close: ReturnType<typeof vi.fn>; disableClose: boolean };
  let service: {
    getArchitectRegistry: ReturnType<typeof vi.fn>;
    submitAssignment: ReturnType<typeof vi.fn>;
    recordAssignment: ReturnType<typeof vi.fn>;
  };

  /** The component's form, reached past `protected` — these are its externally observable defaults. */
  function form(): AssignArchitectDialogComponent['form'] {
    return component['form'];
  }

  /** What picking an option in a dropdown does: sets the control, then reports the user's choice. */
  async function chooseAffiliation(value: string): Promise<void> {
    form().controls.affiliation.setValue(value);
    component['onAffiliationChosen']();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('acfs-bgs:your-name:v1', 'LCU No Fool Like One');
    dialogRef = { close: vi.fn(), disableClose: false };
    service = {
      getArchitectRegistry: vi.fn().mockResolvedValue(REGISTRY),
      submitAssignment: vi.fn().mockResolvedValue(undefined),
      recordAssignment: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AssignArchitectDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { row: ROW } },
        { provide: BgsService, useValue: service },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AssignArchitectDialogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('pre-fills the remembered reporter name and defaults to "Don\'t know"', () => {
    expect(form().controls.yourName.value).toBe('LCU No Fool Like One');
    expect(form().controls.affiliation.value).toBe(AFFILIATION_UNKNOWN);
    expect(form().controls.preferredFaction.value).toBe('');
    expect(fixture.nativeElement.textContent).toContain('Varati');
  });

  it('defaults a squadron architect to the squadron faction when it is present', async () => {
    await chooseAffiliation(AFFILIATION_SQUADRON_MEMBER);
    expect(form().controls.preferredFaction.value).toBe('Flotta Stellare');
  });

  it('adopts a known architect\'s most recent answers, noting how often they chose the faction', async () => {
    form().controls.architect.setValue('herix');
    await fixture.whenStable();

    expect(form().controls.affiliation.value).toBe(AFFILIATION_NOT_MEMBER);
    expect(form().controls.preferredFaction.value).toBe('Flat Galaxy Society');
    expect(component['factionNote']()).toContain('2 volte');
    // The faction isn't present in this system, so it has to be offered as an extra option.
    expect(component['factionOptions']()).toContain('Flat Galaxy Society');
  });

  it('will not send an incomplete form', async () => {
    form().controls.yourName.setValue('');
    await component['send']();
    expect(service.submitAssignment).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('records the submission locally and closes on success', async () => {
    form().controls.architect.setValue('Brand New CMDR');
    await fixture.whenStable();
    await component['send']();

    const submission = service.submitAssignment.mock.calls[0][0];
    expect(submission).toEqual({
      yourName: 'LCU No Fool Like One',
      systemName: 'Varati',
      architect: 'Brand New CMDR',
      affiliation: AFFILIATION_UNKNOWN,
      preferredFaction: '',
    });
    expect(service.recordAssignment).toHaveBeenCalledWith(submission);
    expect(dialogRef.close).toHaveBeenCalledWith(submission);
  });

  it('sends only a preferred faction when the architect is unknown', async () => {
    form().controls.preferredFaction.setValue('Flotta Stellare');
    component['onFactionChosen']();
    await fixture.whenStable();
    await component['send']();

    expect(service.submitAssignment.mock.calls[0][0]).toEqual({
      yourName: 'LCU No Fool Like One',
      systemName: 'Varati',
      architect: '',
      affiliation: AFFILIATION_UNKNOWN,
      preferredFaction: 'Flotta Stellare',
    });
  });

  it('requires the architect name once the answer says whether they are a member', async () => {
    for (const affiliation of [AFFILIATION_SQUADRON_MEMBER, AFFILIATION_NOT_MEMBER]) {
      await chooseAffiliation(affiliation);
      expect(form().controls.architect.hasError('required')).toBe(true);
    }
    await component['send']();
    expect(service.submitAssignment).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with the typed values when the submission fails', async () => {
    service.submitAssignment.mockRejectedValue(new Error('offline'));
    form().controls.architect.setValue('Brand New CMDR');
    await fixture.whenStable();
    await component['send']();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(dialogRef.disableClose).toBe(false);
    expect(component['sendError']()).toBeTruthy();
    expect(component['canRetry']()).toBe(true);
    expect(form().controls.architect.value).toBe('Brand New CMDR');

    // Retrying sends the same submission again, once the network is back.
    service.submitAssignment.mockResolvedValue(undefined);
    await component['send']();
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('clears and locks the architect field, and submits it blank, when the system is not a colony', async () => {
    form().controls.architect.setValue('Someone Typed This First');
    await fixture.whenStable();

    await chooseAffiliation(AFFILIATION_NOT_A_COLONY);

    expect(form().controls.architect.value).toBe('');
    expect(form().controls.architect.disabled).toBe(true);

    await component['send']();
    expect(service.submitAssignment.mock.calls[0][0].architect).toBe('');
  });
});

describe('AssignArchitectDialogComponent changing an existing assignment', () => {
  let fixture: ComponentFixture<AssignArchitectDialogComponent>;
  let component: AssignArchitectDialogComponent;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AssignArchitectDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: vi.fn(), disableClose: false } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            row: { ...ROW, architect: 'Herix', preferredFaction: 'Canonn', preferredFactionRecorded: true },
            current: { architect: 'Herix', affiliation: AFFILIATION_NOT_MEMBER, preferredFaction: 'Canonn' },
          },
        },
        {
          provide: BgsService,
          useValue: { getArchitectRegistry: vi.fn().mockResolvedValue(REGISTRY), submitAssignment: vi.fn(), recordAssignment: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AssignArchitectDialogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('starts from the recorded values instead of the defaults, and says it is a change', () => {
    const form = component['form'];
    expect(form.controls.architect.value).toBe('Herix');
    expect(form.controls.affiliation.value).toBe(AFFILIATION_NOT_MEMBER);
    expect(form.controls.preferredFaction.value).toBe('Canonn');
    expect(component['factionOptions']()).toContain('Canonn');
    expect(fixture.nativeElement.textContent).toContain('Modifica assegnazione');
  });
});
