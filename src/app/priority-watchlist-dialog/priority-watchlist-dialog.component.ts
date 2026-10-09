import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { BgsRow, FactionDetail, StationService } from '../../core/bgs';
import { CloseFaction, conflictRisks } from '../../core/close-factions';
import { FACTION_NAME, RETREAT_INFLUENCE_PERCENT } from '../../core/config';
import { isNativeFaction } from '../../core/home-systems';
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

  /** Whether the faction is native to this system (see {@link isNativeFaction}): the "N" next to its name. */
  protected isNative(factionName: string): boolean {
    return isNativeFaction(factionName, this.row.systemName);
  }

  /**
   * Hover text for the ⚠️ next to a faction's influence — a conflict within reach, a Retreat
   * under way or likely — or null when there's nothing to warn about.
   */
  protected warningTitle(faction: FactionDetail): string | null {
    const lines = [this.riskTitle(faction.name), this.retreatTitle(faction)].filter(line => line !== null);
    return lines.length > 0 ? lines.join('\n') : null;
  }

  /**
   * A Retreat under way, or likely at the next tick (influence at or below
   * {@link RETREAT_INFLUENCE_PERCENT}); never for a native faction, which can't retreat.
   */
  private retreatTitle(faction: FactionDetail): string | null {
    if (this.isNative(faction.name)) {
      return null;
    }
    const threshold = this.i18n.percent(RETREAT_INFLUENCE_PERCENT);
    if (faction.activeStates.includes('Retreat')) {
      return this.t('info.retreatActive', { threshold });
    }
    return faction.influencePercent <= RETREAT_INFLUENCE_PERCENT ? this.t('info.retreatExpected', { threshold }) : null;
  }

  /** A conflict within reach of ours — next to ours, naming who it's with. */
  private riskTitle(factionName: string): string | null {
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
