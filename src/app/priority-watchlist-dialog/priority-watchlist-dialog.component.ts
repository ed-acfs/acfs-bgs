import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { BgsRow, FactionDetail, StationService } from '../../core/bgs';
import { CloseFaction, conflictRisks } from '../../core/close-factions';
import { FACTION_NAME, RETREAT_INFLUENCE_PERCENT } from '../../core/config';
import { isNativeFaction } from '../../core/home-systems';
import { GlobalStateReading, isGlobalState } from '../../core/global-states';
import { RETREAT_ICON, STATE_EMOJI, stateIcon } from '../../core/state-icons';
import { I18nService } from '../i18n.service';

/** The system whose info the dialog shows. */
export interface PriorityWatchlistDialogData {
  row: BgsRow;
  /** Each faction's global states (Expansion), read from its freshest system — see `core/global-states.ts`. */
  globalStates?: ReadonlyMap<string, GlobalStateReading>;
  /** The last tick (ISO 8601), to say when a global state was read before it. */
  tickAt?: string | null;
}

/** One state in the States column. */
interface StateItem {
  name: string;
  pending: boolean;
  /** For a global state read from another system: where and when; null otherwise. */
  title: string | null;
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
  protected readonly retreatIcon = RETREAT_ICON;
  /** The game's icon for a state, when we have one (see `core/state-icons.ts`). */
  protected readonly stateIcon = stateIcon;
  /** The emoji for a state drawn with one instead (Election's 🗳️), or undefined. */
  protected stateEmoji(state: string): string | undefined {
    return STATE_EMOJI[state];
  }
  /** The factions the table flags with ⚠️ for this system, by name. */
  private readonly risks = new Map<string, CloseFaction>(conflictRisks(this.data.row).map(risk => [risk.name, risk]));

  /**
   * The faction's states for the States column: the active ones, then those pending (greyed
   * out). Global states (Expansion) come from the faction's freshest system rather than this
   * one, which may lag days behind — pending, active or already over.
   */
  protected states(faction: FactionDetail): StateItem[] {
    const reading = this.data.globalStates?.get(faction.name);
    const local = (states: string[]) => (reading ? states.filter(state => !isGlobalState(state)) : states);
    // Read here: nothing to explain.
    const title = reading && reading.sourceSystem !== this.row.systemName ? this.globalTitle(reading) : null;
    return [
      ...local(faction.activeStates).map(name => ({ name, pending: false, title: null })),
      ...(reading?.active ?? []).map(name => ({ name, pending: false, title })),
      ...local(faction.pendingStates).map(name => ({ name, pending: true, title: null })),
      ...(reading?.pending ?? []).map(name => ({ name, pending: true, title })),
    ];
  }

  /** "Faction-wide state, read from Wong Sher (updated …)", and a caveat when that's from before the last tick. */
  private globalTitle(reading: GlobalStateReading): string {
    const title = this.t('info.globalState', { system: reading.sourceSystem, time: this.i18n.utcTime(reading.updatedAtMs) });
    const tickMs = this.data.tickAt ? Date.parse(this.data.tickAt) : NaN;
    return reading.updatedAtMs < tickMs ? `${title}\n${this.t('info.globalStale')}` : title;
  }

  /** Whether the faction is native to this system (see {@link isNativeFaction}): the "N" next to its name. */
  protected isNative(factionName: string): boolean {
    return isNativeFaction(factionName, this.row.systemName);
  }

  /**
   * The Retreat icon next to a faction's influence, as the table's State column draws it: plain
   * for a Retreat under way, dashed when only likely at the next tick (influence at or below
   * {@link RETREAT_INFLUENCE_PERCENT}). Null for a native faction, which can't retreat.
   */
  protected retreatWarning(faction: FactionDetail): { title: string; expected: boolean } | null {
    if (this.isNative(faction.name)) {
      return null;
    }
    const threshold = this.i18n.percent(RETREAT_INFLUENCE_PERCENT);
    if (faction.activeStates.includes('Retreat')) {
      return { title: this.t('info.retreatActive', { threshold }), expected: false };
    }
    return faction.influencePercent <= RETREAT_INFLUENCE_PERCENT
      ? { title: this.t('info.retreatExpected', { threshold }), expected: true }
      : null;
  }

  /**
   * Hover text for the ⚠️ of a conflict within reach of ours — next to ours, naming who it's
   * with — or null when there's none.
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
