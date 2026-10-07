import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LANGUAGES } from '../../core/i18n';
import { I18nService } from '../i18n.service';

/**
 * The flags in the header that switch the interface language. Drawn as SVG: Windows shows
 * flag emoji as bare letters ("IT", "DE").
 */
@Component({
  selector: 'app-language-switcher',
  template: `
    <div class="lang-switcher" role="group" [attr.aria-label]="i18n.t('header.language')">
      @for (language of languages; track language.lang) {
        <button
          type="button"
          class="lang-button"
          [class.lang-button--active]="i18n.lang() === language.lang"
          [attr.aria-pressed]="i18n.lang() === language.lang"
          [attr.lang]="language.lang"
          [title]="language.name"
          [attr.aria-label]="language.name"
          (click)="i18n.setLang(language.lang)"
        >
          @switch (language.lang) {
            @case ('it') {
              <svg viewBox="0 0 3 2" aria-hidden="true">
                <rect width="1" height="2" fill="#009246" />
                <rect x="1" width="1" height="2" fill="#fff" />
                <rect x="2" width="1" height="2" fill="#ce2b37" />
              </svg>
            }
            @case ('de') {
              <svg viewBox="0 0 5 3" aria-hidden="true">
                <rect width="5" height="1" fill="#000" />
                <rect y="1" width="5" height="1" fill="#dd0000" />
                <rect y="2" width="5" height="1" fill="#ffce00" />
              </svg>
            }
            @case ('en') {
              <svg viewBox="0 0 60 30" aria-hidden="true">
                <clipPath id="lang-flag-uk-diagonals">
                  <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
                </clipPath>
                <rect width="60" height="30" fill="#012169" />
                <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6" />
                <path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#lang-flag-uk-diagonals)" stroke="#c8102e" stroke-width="4" />
                <path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10" />
                <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" stroke-width="6" />
              </svg>
            }
          }
        </button>
      }
    </div>
  `,
  styles: `
    .lang-switcher {
      display: inline-flex;
      gap: 4px;
      align-items: center;
    }
    .lang-button {
      display: inline-flex;
      padding: 3px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: none;
      cursor: pointer;
      opacity: 0.55;
      transition: opacity 0.15s;
    }
    .lang-button:hover,
    .lang-button:focus-visible {
      opacity: 1;
    }
    .lang-button--active {
      opacity: 1;
      border-color: rgba(255, 255, 255, 0.6);
    }
    svg {
      display: block;
      width: 24px;
      height: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSwitcherComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly languages = LANGUAGES;
}
