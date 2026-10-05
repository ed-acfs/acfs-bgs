import { BgsRow } from './bgs';
import {
  createOrderItem,
  draftItemFromRow,
  formatOrdersDate,
  OrderItem,
  OrdersDraft,
  renderOrderItem,
  parseIsoDay,
  pendingExpansionTemplate,
  pendingItemsFromRows,
  renderOrdersMarkdown,
  resolveOrdersDay,
  setOrderPending,
  toggleOrderStatus,
} from './orders';
import { ORDER_STATUSES } from './order-types';

function item(partial: Partial<OrderItem> & Pick<OrderItem, 'section' | 'typeKey'>): OrderItem {
  return {
    id: 'test',
    priority: null,
    system: '',
    score: '',
    trend: null,
    statusKeys: [],
    pending: false,
    detail: '',
    ...partial,
  };
}

describe('formatOrdersDate', () => {
  it('keeps the real day and month but shifts the year 1286 years into Elite Dangerous time', () => {
    expect(formatOrdersDate(new Date(2026, 9, 5))).toBe('05/10/3312');
  });

  it('pads single-digit days and months', () => {
    expect(formatOrdersDate(new Date(2026, 0, 1))).toBe('01/01/3312');
  });
});

describe('resolveOrdersDay', () => {
  const now = new Date(2026, 9, 5, 21, 30);

  it('defaults to tomorrow', () => {
    expect(resolveOrdersDay(null, now)).toBe('2026-10-06');
  });

  it('keeps a picked day from today on', () => {
    expect(resolveOrdersDay('2026-10-05', now)).toBe('2026-10-05');
    expect(resolveOrdersDay('2026-10-08', now)).toBe('2026-10-08');
  });

  it('drops a picked day in the past, or one that is not a date, for tomorrow', () => {
    expect(resolveOrdersDay('2026-10-04', now)).toBe('2026-10-06');
    expect(resolveOrdersDay('ieri', now)).toBe('2026-10-06');
  });

  it('rolls over the end of the month', () => {
    expect(resolveOrdersDay(null, new Date(2026, 9, 31))).toBe('2026-11-01');
  });
});

describe('parseIsoDay', () => {
  it('reads a day as local midnight, so the in-game date shows the same day', () => {
    expect(formatOrdersDate(parseIsoDay('2026-10-06')!)).toBe('06/10/3312');
  });
});

describe('renderOrderItem', () => {
  it('renders an election with a score, a trend and a status', () => {
    const line = renderOrderItem(
      item({
        section: 'operazioni',
        typeKey: 'election',
        system: 'Lyncis Sector NY-R b4-2',
        score: 'Close Defeat; 0-1',
        trend: 'down',
        statusKeys: ['urgent'],
        detail: '**CONQUISTA del sistema**',
      }),
    );
    expect(line).toBe(
      ':ballot_box: **Lyncis Sector NY-R b4-2** (Close Defeat; 0-1) :arrow_down: :RedAlert:\n' +
        'Election per ACFS > **CONQUISTA del sistema**',
    );
  });

  it('renders a war with no score or trend, just a status', () => {
    const line = renderOrderItem(
      item({
        section: 'concluse',
        typeKey: 'war',
        system: 'Ross 878',
        statusKeys: ['done'],
        detail: '**difesa** di _Sturt Horizons_',
      }),
    );
    expect(line).toBe(':crossed_swords: **Ross 878** :white_check_mark:\nWar per ACFS > **difesa** di _Sturt Horizons_');
  });

  it('prefixes the verb with "Pending" when the state has not started yet', () => {
    const line = renderOrderItem(
      item({
        section: 'operazioni',
        typeKey: 'war',
        system: 'Ross 878',
        pending: true,
        detail: '**difesa** di _Sturt Horizons_',
      }),
    );
    expect(line).toBe(':crossed_swords: **Ross 878**\nPending War per ACFS > **difesa** di _Sturt Horizons_');
  });

  it('renders the stable trend for a change of 0-1%', () => {
    const line = renderOrderItem(
      item({
        section: 'operazioni',
        typeKey: 'influence',
        system: 'LP 254-26',
        score: '14.2%',
        trend: 'stable',
        detail: '14%',
      }),
    );
    expect(line).toBe(':bar_chart: **LP 254-26** (14.2%) :left_right_arrow:\nInf per ACFS > 14%');
  });

  it('renders more than one status flag in order', () => {
    const line = renderOrderItem(
      item({
        section: 'concluse',
        typeKey: 'influence',
        system: 'HIP 30129',
        score: '37.4%',
        statusKeys: ['new', 'urgent'],
        detail: '51%',
      }),
    );
    expect(line).toBe(':bar_chart: **HIP 30129** (37.4%) :new: :RedAlert:\nInf per ACFS > 51%');
  });

  it('renders a "plain" type (construction) without the "per ACFS" prefix', () => {
    const line = renderOrderItem(
      item({
        section: 'concluse',
        typeKey: 'construction',
        system: 'Lyncis Sector CL-Y d68',
        statusKeys: ['done'],
        detail: 'Completare _Gauss Vision_ (Dodec Station)',
      }),
    );
    expect(line).toBe(':construction_site: **Lyncis Sector CL-Y d68** :white_check_mark:\nCompletare _Gauss Vision_ (Dodec Station)');
  });

  it('renders a "note" type as a single line, icon and status inline with the detail', () => {
    const line = renderOrderItem(
      item({
        section: 'note',
        typeKey: 'expansion',
        statusKeys: ['new'],
        detail: 'Pending Expansion da **Fular** - Sistema di arrivo: **BD+21 717**',
      }),
    );
    expect(line).toBe(':Expansion: Pending Expansion da **Fular** - Sistema di arrivo: **BD+21 717** :new:');
  });

  it('renders a free note with no icon at all', () => {
    const line = renderOrderItem(item({ section: 'note', typeKey: 'note', detail: 'Qualcosa da segnalare.' }));
    expect(line).toBe('Qualcosa da segnalare.');
  });

  it('is empty for an unknown type key, rather than throwing', () => {
    expect(renderOrderItem(item({ section: 'note', typeKey: 'does-not-exist', detail: 'x' }))).toBe('');
  });
});

describe('renderOrdersMarkdown', () => {
  /**
   * Reconstructs the shape of the squadron's 05/10/3312 Discord report (one priority tier
   * trimmed to its real entries, "Cantieri Aperti" dropped because it has nothing in it that
   * day — see the module doc for why an empty section is left out rather than posted blank).
   */
  const draft: OrdersDraft = {
    date: new Date(2026, 9, 5),
    mention: '@Membro Flotta',
    footerNote: 'Qualunque contributo è ben accetto e mai obbligatorio.',
    signature: ':acfs:',
    items: [
      item({
        section: 'operazioni',
        priority: 1,
        typeKey: 'election',
        system: 'Lyncis Sector NY-R b4-2',
        score: 'Close Defeat; 0-1',
        trend: 'down',
        statusKeys: ['urgent'],
        detail: '**CONQUISTA del sistema**',
      }),
      item({
        section: 'operazioni',
        priority: 2,
        typeKey: 'election',
        system: 'Crowfor',
        score: 'Victory; 2-0',
        trend: 'up',
        statusKeys: ['ok'],
        detail: '**conquista** di _Apgar City_',
      }),
      item({
        section: 'operazioni',
        priority: 2,
        typeKey: 'influence',
        system: 'Lyncis Sector CL-Y d68',
        score: '43.6%',
        statusKeys: ['new'],
        detail: '49% :arrow_forward: _Ri-Conquista_',
      }),
      item({
        section: 'operazioni',
        priority: 3,
        typeKey: 'election',
        system: 'Elohim',
        score: 'Victory; 3-1',
        trend: 'down',
        statusKeys: ['ok'],
        detail: '**conquista** di _Disraeli Beacon_',
      }),
      item({
        section: 'note',
        typeKey: 'expansion',
        statusKeys: ['new'],
        detail: 'Pending Expansion da **Fular** - Sistema di arrivo: **BD+21 717**',
      }),
      item({
        section: 'concluse',
        typeKey: 'influence',
        system: 'HIP 30129',
        score: '37.4%',
        statusKeys: ['new', 'urgent'],
        detail: '51%',
      }),
      item({
        section: 'concluse',
        typeKey: 'election',
        system: 'Lyncis Sector CL-Y d68',
        statusKeys: ['failed'],
        detail: '**DIFESA del sistema**',
      }),
      item({
        section: 'concluse',
        typeKey: 'construction',
        system: 'Lyncis Sector CL-Y d68',
        statusKeys: ['done'],
        detail: 'Completare _Gauss Vision_ (Dodec Station)',
      }),
      item({
        section: 'concluse',
        typeKey: 'war',
        system: 'Ross 878',
        statusKeys: ['done'],
        detail: '**difesa** di _Sturt Horizons_',
      }),
    ],
  };

  it('assembles the priority groups, the note and the concluded operations into one report', () => {
    expect(renderOrdersMarkdown(draft)).toBe(
      [
        '@Membro Flotta\n## AGGIORNAMENTO ORDINI DEL 05/10/3312',
        [
          ':Missions: **__OPERAZIONI__** :Missions:',
          '',
          '**Priorità** :one:',
          '',
          ':ballot_box: **Lyncis Sector NY-R b4-2** (Close Defeat; 0-1) :arrow_down: :RedAlert:\nElection per ACFS > **CONQUISTA del sistema**',
          '------',
          '',
          '**Priorità** :two:',
          '',
          ':ballot_box: **Crowfor** (Victory; 2-0) :arrow_up: :green_circle:\nElection per ACFS > **conquista** di _Apgar City_',
          '',
          ':bar_chart: **Lyncis Sector CL-Y d68** (43.6%) :new:\nInf per ACFS > 49% :arrow_forward: _Ri-Conquista_',
          '------',
          '',
          '**Priorità** :three:',
          '',
          ':ballot_box: **Elohim** (Victory; 3-1) :arrow_down: :green_circle:\nElection per ACFS > **conquista** di _Disraeli Beacon_',
          '------',
        ].join('\n'),
        [
          '**__NOTE & INFORMAZIONI__**',
          '',
          ':Expansion: Pending Expansion da **Fular** - Sistema di arrivo: **BD+21 717** :new:',
          '------',
        ].join('\n'),
        [
          '- **__OPERAZIONI CONCLUSE__**',
          '',
          ':bar_chart: **HIP 30129** (37.4%) :new: :RedAlert:\nInf per ACFS > 51%',
          '',
          ':ballot_box: **Lyncis Sector CL-Y d68** :x:\nElection per ACFS > **DIFESA del sistema**',
          '',
          ':construction_site: **Lyncis Sector CL-Y d68** :white_check_mark:\nCompletare _Gauss Vision_ (Dodec Station)',
          '',
          ':crossed_swords: **Ross 878** :white_check_mark:\nWar per ACFS > **difesa** di _Sturt Horizons_',
          '------',
        ].join('\n'),
        'NOTA\nQualunque contributo è ben accetto e mai obbligatorio.\n\nBuon gioco! \n:acfs:',
      ].join('\n\n'),
    );
  });

  it('leaves out a section with no items instead of posting an empty header', () => {
    const noCantieri: OrdersDraft = { ...draft, items: draft.items.filter(entry => entry.section !== 'cantieri') };
    expect(renderOrdersMarkdown(noCantieri)).not.toContain('CANTIERI');
  });

  it('renders nothing but the header and footer when there are no items at all', () => {
    const empty: OrdersDraft = { ...draft, items: [] };
    expect(renderOrdersMarkdown(empty)).toBe(
      '@Membro Flotta\n## AGGIORNAMENTO ORDINI DEL 05/10/3312\n\n' +
        'NOTA\nQualunque contributo è ben accetto e mai obbligatorio.\n\nBuon gioco! \n:acfs:',
    );
  });
});

describe('draftItemFromRow', () => {
  const baseRow: Parameters<typeof draftItemFromRow>[0] & { expansionState: 'active' | 'pending' | null } = {
    systemName: 'Ross 878',
    factionInfluence: 43.6,
    warState: null,
    electionState: null,
    expansionState: null,
  };

  it('prefers an active war, not pending', () => {
    const draft = draftItemFromRow({ ...baseRow, warState: 'active' });
    expect(draft.typeKey).toBe('war');
    expect(draft.system).toBe('Ross 878');
    expect(draft.pending).toBe(false);
  });

  it('puts a pending election in the notes, at 0-0 and flagged as new', () => {
    const draft = draftItemFromRow({ ...baseRow, electionState: 'pending' });
    expect(draft.typeKey).toBe('election');
    expect(draft.pending).toBe(true);
    expect(draft.section).toBe('note');
    expect(draft.score).toBe('Draw; 0-0');
    expect(draft.statusKeys).toEqual(['new']);
    expect(renderOrderItem(draft)).toBe(':ballot_box: **Ross 878** (Draw; 0-0) :new:\nPending Election per ACFS > ');
  });

  it('ignores a pending expansion, which Spansh repeats in nearly every system: an influence push', () => {
    const draft = draftItemFromRow({ ...baseRow, expansionState: 'pending' } as Parameters<typeof draftItemFromRow>[0]);
    expect(draft.typeKey).toBe('influence');
    expect(draft.section).toBe('operazioni');
  });

  it('defaults to an influence push with the current percentage, when nothing is active', () => {
    const draft = draftItemFromRow(baseRow);
    expect(draft.typeKey).toBe('influence');
    expect(draft.score).toBe('43.6%');
  });

  it('presets the influence traffic light as the status', () => {
    expect(draftItemFromRow(baseRow).statusKeys).toEqual(['warning']);
    expect(draftItemFromRow({ ...baseRow, factionInfluence: 55 }).statusKeys).toEqual(['ok']);
    expect(draftItemFromRow({ ...baseRow, factionInfluence: 12 }).statusKeys).toEqual(['bad']);
    expect(draftItemFromRow({ ...baseRow, factionInfluence: null }).statusKeys).toEqual([]);
  });

  it('leaves the score blank when the faction has no presence at all', () => {
    const draft = draftItemFromRow({ ...baseRow, factionInfluence: null });
    expect(draft.score).toBe('');
  });
});

describe('pendingItemsFromRows', () => {
  const row = (systemName: string, states: Partial<Pick<BgsRow, 'warState' | 'electionState' | 'expansionState'>>) => ({
    systemName,
    factionInfluence: 30,
    warState: null,
    electionState: null,
    expansionState: null,
    ...states,
  });

  it('collects pending wars and elections alphabetically, in the notes, and no expansions', () => {
    const items = pendingItemsFromRows(
      [
        row('Fular', { expansionState: 'pending' }),
        row('Ross 878', { warState: 'pending' }),
        row('Crowfor', { electionState: 'pending' }),
        row('Betel', { warState: 'active', expansionState: 'active' }),
      ],
      [],
    );
    expect(items.map(item => `${item.typeKey} ${item.system}`)).toEqual(['election Crowfor', 'war Ross 878']);
    expect(items.every(item => item.section === 'note')).toBe(true);
  });

  it('skips what is already in the orders', () => {
    const existing = [{ ...createOrderItem('operazioni', 'war'), system: 'Ross 878' }];
    expect(pendingItemsFromRows([row('Ross 878', { warState: 'pending' })], existing)).toEqual([]);
  });
});

describe('pendingExpansionTemplate', () => {
  it('is a pending expansion line to complete by hand', () => {
    expect(renderOrderItem(pendingExpansionTemplate())).toBe(':Expansion: Pending Expansion da **?** - Sistema di arrivo: **?** :new:');
  });
});

describe('toggleOrderStatus', () => {
  const order = ORDER_STATUSES.map(status => status.key);
  const election = item({ section: 'operazioni', priority: 2, typeKey: 'election', system: 'Crowfor', statusKeys: ['ok'] });

  it('moves a completed operation to the concluded ones, keeping its flags in the fixed order', () => {
    const done = toggleOrderStatus(election, 'done', order);
    expect(done.section).toBe('concluse');
    expect(done.statusKeys).toEqual(['ok', 'done']);
  });

  it('moves a failed operation there too, and done and failed exclude each other', () => {
    const failed = toggleOrderStatus(toggleOrderStatus(election, 'done', order), 'failed', order);
    expect(failed.section).toBe('concluse');
    expect(failed.statusKeys).toEqual(['ok', 'failed']);
  });

  it('moves it back to its priority under Operazioni when the check is taken off', () => {
    const reopened = toggleOrderStatus(toggleOrderStatus(election, 'done', order), 'done', order);
    expect(reopened.section).toBe('operazioni');
    expect(reopened.priority).toBe(2);
  });

  it('sends a reopened construction back to Cantieri', () => {
    const build = item({ section: 'concluse', typeKey: 'construction', statusKeys: ['done'] });
    expect(toggleOrderStatus(build, 'done', order).section).toBe('cantieri');
  });

  it('leaves the section alone for the other flags', () => {
    expect(toggleOrderStatus(election, 'urgent', order).section).toBe('operazioni');
  });
});

describe('setOrderPending', () => {
  const war = item({ section: 'operazioni', priority: 1, typeKey: 'war', system: 'Ross 878' });

  it('moves a pending war to the notes with a 0-0 draw and the new flag', () => {
    const pending = setOrderPending(war, true);
    expect(pending).toMatchObject({ section: 'note', pending: true, score: 'Draw; 0-0', statusKeys: ['new'] });
  });

  it('keeps a score already typed in', () => {
    expect(setOrderPending({ ...war, score: 'Draw; 1-1' }, true).score).toBe('Draw; 1-1');
  });

  it('moves it back to Operazioni once it starts, dropping the placeholder score', () => {
    const started = setOrderPending(setOrderPending(war, true), false);
    expect(started).toMatchObject({ section: 'operazioni', priority: 1, pending: false, score: '' });
  });

  it('does not move a note-style type such as an expansion', () => {
    const expansion = item({ section: 'note', typeKey: 'expansion' });
    expect(setOrderPending(expansion, true)).toMatchObject({ section: 'note', pending: true, score: '' });
  });
});

describe('createOrderItem', () => {
  it('defaults to priority 1 in the operazioni section', () => {
    expect(createOrderItem('operazioni', 'election').priority).toBe(1);
  });

  it('has no priority outside the operazioni section', () => {
    expect(createOrderItem('note', 'note').priority).toBeNull();
  });

  it('gives every item a distinct id', () => {
    const a = createOrderItem('note', 'note');
    const b = createOrderItem('note', 'note');
    expect(a.id).not.toBe(b.id);
  });
});
