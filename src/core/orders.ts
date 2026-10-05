/**
 * The "Ordini Ufficiali" report: a day's worth of operations, composed in the app and pasted
 * into Discord. No Angular and no browser APIs — pure data in, Markdown text out — mirroring
 * the hand-written report the squadron already posts (see `orders.spec.ts` for a reconstruction
 * of one).
 */
import { BgsRow } from './bgs';
import { findOrderType, findStatusEmoji, findTrendEmoji, OrderRenderStyle } from './order-types';
import { SQUADRON_TAG } from './config';
import { influenceSemaphore, SEMAPHORE_STATUS_KEY } from './semaphore';

/** Which block of the report an item belongs to. */
export type OrderSection = 'operazioni' | 'cantieri' | 'note' | 'concluse';

/**
 * One line (or two) of the report. `detail` carries whatever inline Markdown the squadron
 * already uses (bold outcomes, italic station names) — see {@link OrderRenderStyle} for why
 * that's free text rather than further-structured fields: the wording genuinely varies line
 * to line, and forcing it into more fields would fight the exact phrasing the squadron wants.
 */
export interface OrderItem {
  id: string;
  section: OrderSection;
  /** Only meaningful in the 'operazioni' section, where it groups items under "Priorità N". */
  priority: number | null;
  /** Key into {@link ORDER_TYPES}. */
  typeKey: string;
  /** Required for 'operation' and 'plain' styles; unused for 'note' (the system name, if any, goes in `detail`). */
  system: string;
  /** Shown in parentheses after the system name, e.g. "43.6%" or "Close Defeat; 0-1". Optional. */
  score: string;
  trend: 'up' | 'down' | 'stable' | null;
  /** Status flag keys (from {@link ORDER_STATUSES}), rendered in order — a system can show more than one (e.g. "new" and "urgent" together). */
  statusKeys: string[];
  /**
   * True when this is still the BGS "Pending" state rather than the active one — an election
   * or war not yet underway (resolves at the next tick), or an expansion not yet finalised
   * (can take a few ticks). Prefixes the 'operation' verb with "Pending" (e.g. "Pending War
   * per ACFS > …"); has no effect on 'note'-style types, which already spell this out in
   * `detail` by hand (the squadron already writes "Pending Expansion da …").
   */
  pending: boolean;
  /** The rest of the line(s): the bold/italic outcome text, or the whole sentence for a 'note'. */
  detail: string;
}

/** Everything about one day's report besides the operation lines themselves. */
export interface OrdersDraft {
  /** The real-world day the orders are for (usually tomorrow, see {@link resolveOrdersDay}); rendered as the in-game date (see {@link formatOrdersDate}). */
  date: Date;
  /** The role or name pinged at the top (e.g. "@Membro Flotta"). Editable per report, not fixed in config. */
  mention: string;
  footerNote: string;
  signature: string;
  items: OrderItem[];
}

const SECTION_TITLES: Record<OrderSection, string> = {
  operazioni: ':Missions: **__OPERAZIONI__** :Missions:',
  cantieri: ':older_man: **__CANTIERI APERTI__** :older_man:',
  note: '**__NOTE & INFORMAZIONI__**',
  concluse: '- **__OPERAZIONI CONCLUSE__**',
};

/**
 * Discord's number emoji, "Priorità 1" through "Priorità 10" — the range the squadron's own
 * reports use. A priority outside this range falls back to the plain number.
 */
const PRIORITY_EMOJI: readonly string[] = [
  ':zero:',
  ':one:',
  ':two:',
  ':three:',
  ':four:',
  ':five:',
  ':six:',
  ':seven:',
  ':eight:',
  ':nine:',
  ':keycap_ten:',
];

function priorityLabel(priority: number): string {
  const emoji = PRIORITY_EMOJI[priority];
  return `**Priorità** ${emoji ?? priority}`;
}

/**
 * Elite Dangerous is set about 1286 years after its 2014 launch (e.g. 2026 plays as 3312) —
 * the squadron's reports date themselves in-game, not in the real year.
 */
const IN_GAME_YEAR_OFFSET = 1286;

/** The report's date line, in-game: real day and month, year shifted into Elite Dangerous's timeline. */
export function formatOrdersDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear() + IN_GAME_YEAR_OFFSET;
  return `${day}/${month}/${year}`;
}

/** A calendar day as `YYYY-MM-DD` (local time), the format of an `<input type="date">`. */
export function toIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The local-midnight Date for a `YYYY-MM-DD` day, or null if the text isn't one. */
export function parseIsoDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The day the orders are for. The squadron usually writes today's report for tomorrow, so
 * that's the default; a day the user picked is kept until it's in the past, so a choice left
 * over from an earlier session never dates a new report backwards.
 */
export function resolveOrdersDay(picked: string | null, now: Date): string {
  const today = toIsoDay(now);
  if (picked && parseIsoDay(picked) && picked >= today) {
    return picked;
  }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return toIsoDay(tomorrow);
}

function renderStatusSuffix(statusKeys: readonly string[]): string {
  const emoji = statusKeys.map(findStatusEmoji).filter((value): value is string => Boolean(value));
  return emoji.length > 0 ? ` ${emoji.join(' ')}` : '';
}

/** The icon/system/score/trend/status line shared by the 'operation' and 'plain' styles. */
function renderLeadLine(item: OrderItem, icon: string): string {
  const scorePart = item.score ? ` (${item.score})` : '';
  const trendEmoji = item.trend ? findTrendEmoji(item.trend) : null;
  const trendPart = trendEmoji ? ` ${trendEmoji}` : '';
  const prefix = icon ? `${icon} ` : '';
  return `${prefix}**${item.system}**${scorePart}${trendPart}${renderStatusSuffix(item.statusKeys)}`;
}

/** Renders one item as it appears in the report; empty string for an item of an unknown type. */
export function renderOrderItem(item: OrderItem): string {
  const type = findOrderType(item.typeKey);
  if (!type) {
    return '';
  }
  switch (type.style) {
    case 'operation': {
      const verb = item.pending ? `Pending ${type.verb}` : type.verb;
      return `${renderLeadLine(item, type.icon)}\n${verb} per ${SQUADRON_TAG} > ${item.detail}`;
    }
    case 'plain':
      return `${renderLeadLine(item, type.icon)}\n${item.detail}`;
    case 'note': {
      const prefix = type.icon ? `${type.icon} ` : '';
      return `${prefix}${item.detail}${renderStatusSuffix(item.statusKeys)}`;
    }
  }
}

function renderSection(section: OrderSection, items: readonly OrderItem[]): string | null {
  if (section === 'operazioni') {
    const byPriority = new Map<number, OrderItem[]>();
    for (const item of items) {
      const priority = item.priority ?? 0;
      const group = byPriority.get(priority);
      if (group) {
        group.push(item);
      } else {
        byPriority.set(priority, [item]);
      }
    }
    if (byPriority.size === 0) {
      return null;
    }
    const groups = [...byPriority.entries()]
      .sort(([a], [b]) => a - b)
      .map(([priority, group]) => `${priorityLabel(priority)}\n\n${group.map(renderOrderItem).join('\n\n')}\n------`);
    return `${SECTION_TITLES.operazioni}\n\n${groups.join('\n\n')}`;
  }

  if (items.length === 0) {
    return null;
  }
  return `${SECTION_TITLES[section]}\n\n${items.map(renderOrderItem).join('\n\n')}\n------`;
}

/**
 * The full report, ready to paste into Discord. Sections with no items are left out entirely
 * (including "Cantieri Aperti" when there's nothing open) rather than posted as an empty
 * placeholder header, which is the one deliberate difference from the hand-written original.
 */
export function renderOrdersMarkdown(draft: OrdersDraft): string {
  const bySection = (section: OrderSection) => draft.items.filter(item => item.section === section);

  const blocks: string[] = [`${draft.mention}\n## AGGIORNAMENTO ORDINI DEL ${formatOrdersDate(draft.date)}`];
  for (const section of ['operazioni', 'cantieri', 'note', 'concluse'] as const) {
    const rendered = renderSection(section, bySection(section));
    if (rendered) {
      blocks.push(rendered);
    }
  }
  blocks.push(`NOTA\n${draft.footerNote}\n\nBuon gioco! \n${draft.signature}`);

  return blocks.join('\n\n');
}

let nextOrderItemId = 0;

/** A blank item of the given type, ready for the form — see {@link OrderItem} for the fields' meaning. */
export function createOrderItem(section: OrderSection, typeKey: string): OrderItem {
  nextOrderItemId += 1;
  return {
    id: `order-${Date.now()}-${nextOrderItemId}`,
    section,
    priority: section === 'operazioni' ? 1 : null,
    typeKey,
    system: '',
    score: '',
    trend: null,
    statusKeys: [],
    pending: false,
    detail: '',
  };
}

/** The score of a conflict that hasn't started yet: nobody has won a day. */
export const PENDING_CONFLICT_SCORE = 'Draw; 0-0';

/** Status keys that mean the operation is over; they belong in the 'concluse' section. */
const CONCLUDED_STATUS_KEYS: readonly string[] = ['done', 'failed'];

function isPendingConflict(item: OrderItem): boolean {
  return item.pending && findOrderType(item.typeKey)?.style === 'operation';
}

/**
 * Where an item belongs when it isn't concluded: a war or election still pending goes under
 * "Note & informazioni" (the squadron announces it there the day before it starts), a
 * construction under "Cantieri aperti", a free note under "Note", everything else under
 * "Operazioni" (keeping its priority, or 1 if it never had one).
 */
function openSectionPatch(item: OrderItem): Pick<OrderItem, 'section' | 'priority'> {
  if (isPendingConflict(item)) {
    return { section: 'note', priority: item.priority };
  }
  const style = findOrderType(item.typeKey)?.style;
  if (style === 'plain') {
    return { section: 'cantieri', priority: item.priority };
  }
  if (style === 'note') {
    return { section: 'note', priority: item.priority };
  }
  return { section: 'operazioni', priority: item.priority ?? 1 };
}

/**
 * Turns a status flag on or off. Flags keep the fixed order of `order-types.json` whatever the
 * click order. "Concluso" and "Concluso senza successo" exclude each other and move the item
 * to "Operazioni concluse"; taking the last of them off moves it back where it came from.
 */
export function toggleOrderStatus(item: OrderItem, key: string, statusOrder: readonly string[]): OrderItem {
  const present = item.statusKeys.includes(key);
  let next = present ? item.statusKeys.filter(k => k !== key) : [...item.statusKeys, key];
  if (!present && CONCLUDED_STATUS_KEYS.includes(key)) {
    next = next.filter(k => k === key || !CONCLUDED_STATUS_KEYS.includes(k));
  }
  const statusKeys = statusOrder.filter(k => next.includes(k));
  const updated = { ...item, statusKeys };
  if (statusKeys.some(k => CONCLUDED_STATUS_KEYS.includes(k))) {
    return { ...updated, section: 'concluse' };
  }
  return item.section === 'concluse' ? { ...updated, ...openSectionPatch(updated) } : updated;
}

/**
 * Marks a war or election as pending (not started yet) or active. A pending conflict moves to
 * "Note & informazioni" with the score "Draw; 0-0" and the 🆕 flag, unless those were already
 * filled in; once it starts it moves back to "Operazioni". Concluded items stay where they are.
 */
export function setOrderPending(item: OrderItem, pending: boolean): OrderItem {
  const updated = { ...item, pending };
  if (item.typeKey === 'expansion') {
    // A note-style line: the "Pending" lives in the text the squadron writes, so swap it there.
    const detail = pending ? item.detail.replace(/^Expansion\b/, 'Pending Expansion') : item.detail.replace(/^Pending Expansion\b/, 'Expansion');
    return { ...updated, detail };
  }
  if (item.section === 'concluse' || findOrderType(item.typeKey)?.style !== 'operation') {
    return updated;
  }
  if (pending) {
    return {
      ...updated,
      ...openSectionPatch(updated),
      score: item.score || PENDING_CONFLICT_SCORE,
      statusKeys: item.statusKeys.includes('new') ? item.statusKeys : ['new', ...item.statusKeys],
    };
  }
  return {
    ...updated,
    ...openSectionPatch(updated),
    score: item.score === PENDING_CONFLICT_SCORE ? '' : item.score,
  };
}

type DraftRow = Pick<BgsRow, 'systemName' | 'factionInfluence' | 'warState' | 'electionState'>;

/**
 * A "Pending Expansion" line for "Note & informazioni", with origin and destination to fill in.
 * Never derived from the dataset: Spansh repeats a faction's pending Expansion in nearly every
 * system it's present in (189 of 389 on 5 October 2026), so the data can't tell where it starts.
 */
export function pendingExpansionTemplate(origin = ''): OrderItem {
  return {
    ...createOrderItem('note', 'expansion'),
    system: origin,
    pending: true,
    statusKeys: ['new'],
    detail: `Pending Expansion da **${origin || '?'}** - Sistema di arrivo: **?**`,
  };
}

/**
 * The text a 'note'-style line starts from when it gets a type and maybe a system: the
 * expansion sentence for an expansion, the bold system name for a free note. Note-style lines
 * have no separate system field in the report, so the system has to go into the text.
 */
function noteDetailFor(typeKey: string, system: string): Pick<OrderItem, 'detail' | 'pending' | 'statusKeys'> | null {
  if (typeKey === 'expansion') {
    const { detail, pending, statusKeys } = pendingExpansionTemplate(system);
    return { detail, pending, statusKeys };
  }
  if (findOrderType(typeKey)?.style === 'note' && system) {
    return { detail: `**${system}** `, pending: false, statusKeys: [] };
  }
  return null;
}

/** A new line from the editor's "Aggiungi riga" bar: section, type and an optional system. */
export function createOrderItemFromBar(section: OrderSection, typeKey: string, system: string): OrderItem {
  const item = { ...createOrderItem(section, typeKey), system };
  const note = noteDetailFor(typeKey, system);
  return note ? { ...item, ...note } : item;
}

/**
 * Changes a line's type. A line with no text yet that becomes an expansion or a free note gets
 * that type's starting text (see {@link noteDetailFor}), using the system already filled in.
 */
export function changeOrderType(item: OrderItem, typeKey: string): OrderItem {
  const updated = { ...item, typeKey };
  const note = item.detail.trim() === '' ? noteDetailFor(typeKey, item.system) : null;
  return note ? { ...updated, ...note, statusKeys: note.statusKeys.length > 0 ? note.statusKeys : item.statusKeys } : updated;
}

/**
 * A starting point for "Aggiungi agli ordini" on a table row: guesses the type from the row's
 * war or election, falling back to an influence push with its current percentage
 * prefilled and the influence traffic light as its status (🟢/🟡/🔴, see `semaphore.ts`).
 * Active operations land in 'operazioni' at priority 1 — the user sorts them from there.
 * A war or election still pending lands in 'note' with "Draw; 0-0" (see {@link setOrderPending}).
 * Expansions are ignored (see {@link pendingExpansionTemplate}). The outcome text
 * (`detail`) is left for the user to write, since it depends on who's attacking whom, which the
 * dataset doesn't say.
 */
export function draftItemFromRow(row: DraftRow): OrderItem {
  const conflict = row.warState ? { typeKey: 'war', state: row.warState } : row.electionState ? { typeKey: 'election', state: row.electionState } : null;
  if (conflict) {
    const item = { ...createOrderItem('operazioni', conflict.typeKey), system: row.systemName };
    return conflict.state === 'pending' ? setOrderPending(item, true) : item;
  }
  return {
    ...createOrderItem('operazioni', 'influence'),
    system: row.systemName,
    score: row.factionInfluence !== null ? `${row.factionInfluence.toFixed(1)}%` : '',
    statusKeys: row.factionInfluence !== null ? [SEMAPHORE_STATUS_KEY[influenceSemaphore(row.factionInfluence)]] : [],
  };
}

/**
 * Prefills "Note & informazioni" with every pending war and election of our faction in the
 * dataset, alphabetically, skipping any system and type already in the orders. Expansions are
 * left out on purpose (see {@link pendingExpansionTemplate}).
 */
export function pendingItemsFromRows(rows: readonly DraftRow[], existing: readonly OrderItem[]): OrderItem[] {
  const taken = new Set(existing.map(item => `${item.typeKey}|${item.system}`));
  const conflicts: OrderItem[] = [];
  const sorted = [...rows].sort((a, b) => a.systemName.localeCompare(b.systemName));
  const add = (item: OrderItem) => {
    const key = `${item.typeKey}|${item.system}`;
    if (!taken.has(key)) {
      taken.add(key);
      conflicts.push(item);
    }
  };
  for (const row of sorted) {
    if (row.warState === 'pending') {
      add(setOrderPending({ ...createOrderItem('operazioni', 'war'), system: row.systemName }, true));
    }
    if (row.electionState === 'pending') {
      add(setOrderPending({ ...createOrderItem('operazioni', 'election'), system: row.systemName }, true));
    }
  }
  return conflicts;
}
