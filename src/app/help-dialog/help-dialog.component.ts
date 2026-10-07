import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { FACTION_NAME } from '../../core/config';
import { I18nService } from '../i18n.service';

/**
 * Static usage guide, opened from the header ("Guida") and from the Ordini Ufficiali page.
 * No input data — same content everywhere, so one dialog component covers both entry points.
 * The table section follows the interface language; the architect and Ordini sections are
 * internal squadron tools, explained in full only in Italian.
 */
@Component({
  selector: 'app-help-dialog',
  imports: [MatButtonModule, MatDialogModule],
  templateUrl: './help-dialog.component.html',
  styleUrl: './help-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpDialogComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly factionName = FACTION_NAME;
}
