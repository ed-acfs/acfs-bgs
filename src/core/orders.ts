/**
 * The "Ordini Ufficiali" report: a day's worth of operations, composed in the app and pasted
 * into Discord. No Angular and no browser APIs — pure data in, Markdown text out — mirroring
 * the hand-written report the squadron already posts (see `orders.spec.ts` for a reconstruction
 * of one).
 */
import { BgsRow } from './bgs';
import { findOrderType, findStatusEmoji, findTrendEmoji, OrderRenderStyle } from './order-types';
import { SQUADRON_TAG } from './config';

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
  /** The real-world date the report is composed on; rendered as the in-game date (see {@link formatOrdersDate}). */
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

/**
 * A starting point for "Aggiungi agli ordini" on a table row: guesses the type from whatever
 * active-or-pending state the row has (war, then election, then expansion), falling back to
 * an influence push with its current percentage prefilled. Always lands in the 'operazioni'
 * section at priority 1 — the user sorts it from there. The outcome text (`detail`) is left
 * for the user to write, since it depends on who's attacking whom, which the dataset doesn't say.
 */
export function draftItemFromRow(row: Pick<BgsRow, 'systemName' | 'factionInfluence' | 'warState' | 'electionState' | 'expansionState'>): OrderItem {
  if (row.warState) {
    return { ...createOrderItem('operazioni', 'war'), system: row.systemName, pending: row.warState === 'pending' };
  }
  if (row.electionState) {
    return { ...createOrderItem('operazioni', 'election'), system: row.systemName, pending: row.electionState === 'pending' };
  }
  if (row.expansionState) {
    return {
      ...createOrderItem('note', 'expansion'),
      statusKeys: ['new'],
      detail: `Pending Expansion da **${row.systemName}** - Sistema di arrivo: **?**`,
    };
  }
  return {
    ...createOrderItem('operazioni', 'influence'),
    system: row.systemName,
    score: row.factionInfluence !== null ? `${row.factionInfluence.toFixed(1)}%` : '',
  };
}
