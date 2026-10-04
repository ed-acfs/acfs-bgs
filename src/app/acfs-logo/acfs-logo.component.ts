import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SQUADRON_NAME } from '../../core/config';

/** The squadron's logo in the page header; it pulses gently while data is loading. */
@Component({
  selector: 'app-acfs-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<img src="assets/acfs-logo.png" [alt]="squadronName" class="acfs-logo" />`,
  styleUrl: './acfs-logo.component.scss',
  host: { '[class.is-animating]': 'animating()' },
})
export class AcfsLogoComponent {
  /** Whether the page is loading data. */
  readonly animating = input(false);

  protected readonly squadronName = SQUADRON_NAME;
}
