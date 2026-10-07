import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { STORAGE_PREFIX } from '../core/config';
import {
  Lang,
  MessageKey,
  MessageParams,
  formatDecimal,
  formatInteger,
  formatPercent,
  formatUtcTime,
  pickLanguage,
  translate,
} from '../core/i18n';

/** localStorage key the chosen language is stored under. */
const LANG_KEY = `${STORAGE_PREFIX}lang`;

function readSavedLang(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

/**
 * The interface language of the read-only part of the tool, as a signal: templates that call
 * {@link t} re-render when it changes. Starts from the language chosen earlier, otherwise the
 * browser's (see `pickLanguage`).
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);

  readonly lang = signal<Lang>(pickLanguage(readSavedLang(), navigator.languages ?? [navigator.language]));
  readonly isItalian = computed(() => this.lang() === 'it');

  constructor() {
    this.document.documentElement.lang = this.lang();
  }

  /** Switches language and remembers the choice for the next visit. */
  setLang(lang: Lang): void {
    this.lang.set(lang);
    this.document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Storage unavailable (e.g. private browsing) — the choice just won't be remembered.
    }
  }

  /** The message for `key` in the current language. Arrow functions, so templates can take them unbound. */
  readonly t = (key: MessageKey, params?: MessageParams): string => translate(this.lang(), key, params);
  readonly decimal = (value: number): string => formatDecimal(this.lang(), value);
  readonly integer = (value: number): string => formatInteger(this.lang(), value);
  readonly percent = (value: number): string => formatPercent(this.lang(), value);
  readonly utcTime = (ms: number): string => formatUtcTime(this.lang(), ms);
}
