import { computeFreshness } from '../freshness';
import { de } from './de';
import { en } from './en';
import { it as italian } from './it';
import { MessageKey, formatPercent, isMessageKey, pickLanguage, translate } from './index';

/** The `{name}` placeholders of a message, sorted. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
}

describe('pickLanguage', () => {
  it('keeps the language chosen earlier', () => {
    expect(pickLanguage('de', ['it-IT'])).toBe('de');
  });

  it("follows the first of the browser's languages the tool has, regional variants included", () => {
    expect(pickLanguage(null, ['de-AT', 'en-US'])).toBe('de');
    expect(pickLanguage(null, ['fr-FR', 'it'])).toBe('it');
    expect(pickLanguage('xx', ['en-US'])).toBe('en');
  });

  it('falls back to English for a browser in none of the languages', () => {
    expect(pickLanguage(null, ['fr-FR', 'pl'])).toBe('en');
    expect(pickLanguage(null, [])).toBe('en');
  });
});

describe('translate', () => {
  it('fills in the placeholders', () => {
    expect(translate('it', 'row.copy', { system: 'Sol' })).toBe('Copia Sol');
    expect(translate('de', 'row.copy', { system: 'Sol' })).toBe('Sol kopieren');
    expect(translate('en', 'pager.count', { count: '1,234' })).toBe('(1,234 systems)');
  });

  it('formats numbers in the language style', () => {
    expect(formatPercent('it', 42.5)).toBe('42,5%');
    expect(formatPercent('de', 42.5)).toBe('42,5%');
    expect(formatPercent('en', 42.5)).toBe('42.5%');
  });

  it('uses the same placeholders in every language as in Italian', () => {
    for (const key of Object.keys(italian) as MessageKey[]) {
      const expected = placeholders(italian[key]);
      expect({ key, placeholders: placeholders(de[key]) }).toEqual({ key, placeholders: expected });
      expect({ key, placeholders: placeholders(en[key]) }).toEqual({ key, placeholders: expected });
    }
  });

  it('has a non-empty message for every key in every language', () => {
    for (const key of Object.keys(italian) as MessageKey[]) {
      expect(de[key].trim(), key).not.toBe('');
      expect(en[key].trim(), key).not.toBe('');
    }
  });

  it('translates every priority reason code', () => {
    const codes = [
      'retreat', 'war-active', 'election-active', 'war-pending', 'election-pending', 'lead-below-4',
      'control-margin-under-3', 'lead-below-6', 'lead-lowest-ranked', 'lead-lowest-should-control',
      'control-margin-3-7', 'lead-below-10', 'gap-to-leader', 'control-lights-red',
      'control-lights-mixed', 'control-lights-yellow',
      'below-watchlist-position', 'out-of-scope', 'no-preference', 'assumed-needs-architect', 'none',
    ];
    for (const code of codes) {
      expect(isMessageKey(`reason.${code}`), code).toBe(true);
    }
  });
});

describe('computeFreshness in another language', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');

  it('labels the pill and the hover text in German and English', () => {
    const fourDaysAgo = '2026-10-03 10:00:00+00';
    expect(computeFreshness(fourDaysAgo, now, 'de').label).toBe('4T');
    expect(computeFreshness(fourDaysAgo, now, 'en').label).toBe('4d');
    expect(computeFreshness(fourDaysAgo, now, 'en').accessibleName).toBe('Days behind, updated 4 days ago');
    expect(computeFreshness(fourDaysAgo, now, 'de').title).toMatch(/^Aktualisiert am 3\. Okt\. 2026, 10:00 UTC$/);
  });

  it('stays Italian by default', () => {
    expect(computeFreshness('2026-10-07 08:00:00+00', now).label).toBe('oggi');
  });
});
