/**
 * The static vocabulary for the Ordini Ufficiali report: activity types, status flags and
 * trend arrows, as the squadron's Discord report already uses them. Kept as data
 * (`order-types.json`) rather than code so the list can grow without touching `orders.ts`.
 */
import data from './order-types.json';

export type OrderRenderStyle = 'operation' | 'plain' | 'note';

/** One selectable kind of order line ("Election", "War", "Inf per ACFS", a free note…). */
export interface OrderType {
  key: string;
  label: string;
  /** Discord emoji shorthand (e.g. `:ballot_box:`), or '' for a plain note with no icon. */
  icon: string;
  /**
   * The same icon as a Unicode emoji, for the editor's selectors — `icon` stays the Discord
   * shorthand that goes into the copied report. Server-only emoji (`:Expansion:`) get the
   * closest Unicode lookalike.
   */
  display: string;
  /**
   * 'operation': two lines, system + status then "{verb} per {tag} > {detail}".
   * 'plain': two lines like 'operation', but the second line is just {detail} (no verb prefix) —
   * for entries like a colonisation build that aren't phrased as "{verb} per {tag}".
   * 'note': a single line, icon (if any) followed by {detail} — for a sentence standing on its own,
   * where any system names are typed inline rather than held in a separate field.
   */
  style: OrderRenderStyle;
  /** English BGS verb used in the second line ("Election", "War", "Inf") — only set for 'operation' types. */
  verb?: string;
  /**
   * How long this type's BGS "Pending" state typically lasts before resolving at a tick:
   * 1 day for a pending war/election (resolves at the very next tick), 3 for a pending
   * expansion (can take a few ticks). Informational only — nothing currently computes a
   * countdown from it, since the dataset doesn't record when a pending state started.
   */
  pendingDurationDays?: number;
}

export interface OrderFlag {
  key: string;
  /** Discord shorthand written into the report (e.g. `:arrow_down:`, or a server emoji like `:RedAlert:`). */
  emoji: string;
  /** Unicode emoji shown in the editor instead of the shorthand (closest lookalike for server emoji). */
  display: string;
  label: string;
}

export const ORDER_TYPES: readonly OrderType[] = data.types as OrderType[];
export const ORDER_STATUSES: readonly OrderFlag[] = data.statuses;
export const ORDER_TRENDS: readonly OrderFlag[] = data.trends;

export function findOrderType(key: string): OrderType | undefined {
  return ORDER_TYPES.find(type => type.key === key);
}

export function findStatusEmoji(key: string): string | undefined {
  return ORDER_STATUSES.find(status => status.key === key)?.emoji;
}

export function findTrendEmoji(key: string): string | undefined {
  return ORDER_TRENDS.find(trend => trend.key === key)?.emoji;
}
