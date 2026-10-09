import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { BgsRow, StationService } from '../../core/bgs';
import { CloseFaction, conflictRisks } from '../../core/close-factions';
import { FACTION_NAME } from '../../core/config';
import { I18nService } from '../i18n.service';

/** The system whose info the dialog shows. */
export interface PriorityWatchlistDialogData {
  row: BgsRow;
}

/**
 * Read-only info for a system — opened from the info button next to the System Name column,
 * on every row. Systems on the Priority Watchlist (the "System Info" list) show their watchlist
 * entries under Information; every system shows its controlling faction, population, station
 * and body counts, and a table of its factions (see `priority-watchlist.ts`).
 */
@Component({
  selector: 'app-priority-watchlist-dialog',
  imports: [MatButtonModule, MatDialogModule],
  templateUrl: './priority-watchlist-dialog.component.html',
  styleUrl: './priority-watchlist-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriorityWatchlistDialogComponent {
  private readonly data = inject<PriorityWatchlistDialogData>(MAT_DIALOG_DATA);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  protected readonly row = this.data.row;
  protected readonly entries = this.data.row.watchlist;
  /** The factions the table flags with ⚠️ for this system, by name. */
  private readonly risks = new Map<string, CloseFaction>(conflictRisks(this.data.row).map(risk => [risk.name, risk]));

  /**
   * Hover text for the ⚠️ next to a faction within conflict reach of ours — and next to ours,
   * naming who it's with — or null when there's nothing to warn about.
   */
  protected riskTitle(factionName: string): string | null {
    if (factionName === FACTION_NAME) {
      return this.risks.size > 0 ? this.t('info.closeOwn', { factions: [...this.risks.keys()].join(', ') }) : null;
    }
    const risk = this.risks.get(factionName);
    if (!risk) {
      return null;
    }
    return this.t(risk.points > 0 ? 'info.closeAbove' : 'info.closeBelow', {
      points: this.i18n.decimal(Math.abs(risk.points)),
      faction: FACTION_NAME,
    });
  }

  /** "Material Trader: Encoded", or "unknown type" in the current language when Spansh lists the service without its kind. */
  protected serviceLabel(service: StationService): string {
    const name = service.kind === 'material-trader' ? 'Material Trader' : 'Technology Broker';
    return `${name}: ${service.type ?? this.t('service.unknownType')}`;
  }
}
