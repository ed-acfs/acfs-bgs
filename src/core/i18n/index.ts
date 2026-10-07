/**
 * The languages of the read-only part of the tool. Plain functions over three dictionaries,
 * no Angular: the app wraps them in `I18nService`, and core modules (freshness, tick
 * coverage) take a `Lang` parameter that defaults to Italian.
 */
import { de } from './de';
import { en } from './en';
import { it } from './it';

export type Lang = 'it' | 'de' | 'en';

/** Every key of the Italian reference dictionary. */
export type MessageKey = keyof typeof it;

/** A complete translation: TypeScript rejects one with a key missing or extra. */
export type Dictionary = Record<MessageKey, string>;

/** Values for a message's `{name}` placeholders. */
export type MessageParams = Record<string, string | number>;

/** The languages in the order the selector shows them, with their own names. */
export const LANGUAGES: readonly { lang: Lang; name: string }[] = [
  { lang: 'it', name: 'Italiano' },
  { lang: 'de', name: 'Deutsch' },
  { lang: 'en', name: 'English' },
];

/** For a browser in none of the languages: English is the one everyone in Elite reads. */
export const FALLBACK_LANG: Lang = 'en';

/** The locale for numbers and dates in each language: decimal comma in Italian and German. */
export const LOCALES: Record<Lang, string> = { it: 'it-IT', de: 'de-DE', en: 'en-GB' };

const DICTIONARIES: Record<Lang, Dictionary> = { it, de, en };

/** Whether `key` is in the dictionaries: for keys built at run time, such as a priority reason's code. */
export function isMessageKey(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(it, key);
}

export function isLang(value: unknown): value is Lang {
  return value === 'it' || value === 'de' || value === 'en';
}

/**
 * The language to start in: the one chosen earlier if any, otherwise the first of the
 * browser's languages the tool has ("de-AT" counts as German), otherwise {@link FALLBACK_LANG}.
 */
export function pickLanguage(saved: string | null, browserLanguages: readonly string[]): Lang {
  if (isLang(saved)) {
    return saved;
  }
  for (const tag of browserLanguages) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLang(primary)) {
      return primary;
    }
  }
  return FALLBACK_LANG;
}

/** The message for `key` in `lang`, with each `{name}` replaced by its value in `params`. */
export function translate(lang: Lang, key: MessageKey, params?: MessageParams): string {
  const template = DICTIONARIES[lang][key];
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** A number with one decimal in the language's style: "42,5" in Italian and German, "42.5" in English. */
export function formatDecimal(lang: Lang, value: number): string {
  return value.toLocaleString(LOCALES[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** A whole number with the language's thousands separator: "1.234" or "1,234". */
export function formatInteger(lang: Lang, value: number): string {
  return value.toLocaleString(LOCALES[lang]);
}

/** A 0-100 influence as the table shows it: "42,5%" or "42.5%". */
export function formatPercent(lang: Lang, value: number): string {
  return `${formatDecimal(lang, value)}%`;
}

/** Day, month and time in UTC (game time), e.g. "4 ott, 21:28" in Italian. */
export function formatUtcTime(lang: Lang, ms: number, withYear = false): string {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(ms);
}
