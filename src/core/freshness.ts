import { Lang, MessageKey, formatUtcTime, translate } from './i18n';

/**
 * How stale a system's BGS reading is, in ticks-elapsed terms. Ticks aren't directly
 * observable (see the module doc below), so this approximates "ticks elapsed" with
 * "whole days elapsed since `updated_at`" — accurate to within one tick, which is enough
 * to colour a dot. See the feature's issue for the reasoning against exact tick counting.
 */
export type FreshnessBand = 'current' | 'oneTick' | 'days' | 'weeks' | 'unknown';

/** Everything a freshness pill needs to render, already computed for the current clock. */
export interface FreshnessInfo {
  band: FreshnessBand;
  /** Short age label for the pill, e.g. "oggi", "5g", "3s", "1a+", or "—" for unknown. */
  label: string;
  /** Full sentence naming the band and the age in words, for the pill's accessible name. */
  accessibleName: string;
  /** Hover text: the absolute time in UTC (game time), or an explanation when there isn't one. */
  title: string;
  /** The raw `updated_at` epoch millis, for sorting; null sorts last regardless of direction. */
  sortValue: number | null;
}

const WEEK_LABEL_CLAMP_WEEKS = 52;

/**
 * Spansh's `updated_at` isn't strict ISO 8601 — a space instead of `T`, and a two-digit
 * UTC offset (`+00` rather than `+00:00`) — which `Date` parses inconsistently across
 * engines. Normalising both before parsing makes it reliable everywhere.
 */
export function parseUpdatedAt(raw: string | null | undefined): number | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00');
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}

/** Whole days elapsed between `updatedAtMs` and `nowMs`, clamped to zero for future timestamps. */
export function daysElapsed(updatedAtMs: number, nowMs: number): number {
  const ms = nowMs - updatedAtMs;
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function bandFor(days: number): FreshnessBand {
  if (days === 0) {
    return 'current';
  }
  if (days === 1) {
    return 'oneTick';
  }
  if (days <= 6) {
    return 'days';
  }
  return 'weeks';
}

const BAND_KEYS: Record<FreshnessBand, MessageKey> = {
  current: 'fresh.band.current',
  oneTick: 'fresh.band.oneTick',
  days: 'fresh.band.days',
  weeks: 'fresh.band.weeks',
  unknown: 'fresh.band.unknown',
};

/** Short pill label: rounds down throughout, and clamps at a year to bound the pill width. */
function formatLabel(days: number, lang: Lang): string {
  if (days === 0) {
    return translate(lang, 'fresh.today');
  }
  if (days <= 6) {
    return translate(lang, 'fresh.daysShort', { n: days });
  }
  const weeks = Math.floor(days / 7);
  if (weeks >= WEEK_LABEL_CLAMP_WEEKS) {
    return translate(lang, 'fresh.yearPlus');
  }
  return translate(lang, 'fresh.weeksShort', { n: weeks });
}

/** The age phrase used in the accessible name, e.g. "oggi", "5 giorni fa", "3 settimane fa". */
function formatAgeWords(days: number, lang: Lang): string {
  if (days === 0) {
    return translate(lang, 'fresh.today');
  }
  if (days === 1) {
    return translate(lang, 'fresh.dayAgo');
  }
  if (days <= 6) {
    return translate(lang, 'fresh.daysAgo', { n: days });
  }
  const weeks = Math.floor(days / 7);
  if (weeks >= WEEK_LABEL_CLAMP_WEEKS) {
    return translate(lang, 'fresh.yearAgo');
  }
  return weeks === 1 ? translate(lang, 'fresh.weekAgo') : translate(lang, 'fresh.weeksAgo', { n: weeks });
}

/**
 * Computes everything a freshness pill needs from a system's raw `updated_at` string.
 * `nowMs` defaults to the real clock but is injectable for tests and for the table's
 * once-a-minute recompute timer. The texts are in `lang`, Italian by default.
 */
export function computeFreshness(raw: string | null | undefined, nowMs: number = Date.now(), lang: Lang = 'it'): FreshnessInfo {
  const updatedAtMs = parseUpdatedAt(raw);
  if (updatedAtMs === null) {
    return {
      band: 'unknown',
      label: '—',
      accessibleName: translate(lang, BAND_KEYS.unknown),
      title: translate(lang, BAND_KEYS.unknown),
      sortValue: null,
    };
  }

  const days = daysElapsed(updatedAtMs, nowMs);
  const band = bandFor(days);
  return {
    band,
    label: formatLabel(days, lang),
    accessibleName: translate(lang, 'fresh.accessible', { band: translate(lang, BAND_KEYS[band]), age: formatAgeWords(days, lang) }),
    title: translate(lang, 'fresh.title', { time: formatUtcTime(lang, updatedAtMs, true) }),
    sortValue: updatedAtMs,
  };
}
