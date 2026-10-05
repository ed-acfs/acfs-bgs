import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

/**
 * Static usage guide, opened from the header ("Guida") and from the Ordini Ufficiali page.
 * No input data — same content everywhere, so one dialog component covers both entry points.
 */
@Component({
  selector: 'app-help-dialog',
  imports: [MatButtonModule, MatDialogModule],
  templateUrl: './help-dialog.component.html',
  styleUrl: './help-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpDialogComponent {}
