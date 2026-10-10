import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { CONFLICT_MARGIN_POINTS, FACTION_NAME, RETREAT_INFLUENCE_PERCENT } from '../../core/config';
import { I18nService } from '../i18n.service';

/** Optional dialog data: the Ordini Ufficiali page asks for the full Ordini section. */
export interface HelpDialogData {
  orders?: boolean;
}

/**
 * Static usage guide, opened from the header ("Guida") and from the Ordini Ufficiali page.
 * The read-only sections follow the interface language; the architect section is internal to the
 * squadron and Italian only. The Ordini are explained in full only when opened from their page
 * (behind the passphrase): from the table the guide just says the page is reserved.
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
  protected readonly conflictMarginPoints = CONFLICT_MARGIN_POINTS;
  protected readonly retreatInfluencePercent = RETREAT_INFLUENCE_PERCENT;
  protected readonly showOrders = inject<HelpDialogData | null>(MAT_DIALOG_DATA, { optional: true })?.orders === true;
}
