/**
 * Browser downloads of the table's rows, built on the pure JSON/CSV conversion in
 * `core/export.ts`.
 */
import { BgsRow } from '../core/bgs';
import { exportFilename, rowsToCsv, toExportRecord } from '../core/export';

/** Triggers a browser download of `content` under `filename`. */
function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Exports `rows` as a pretty-printed JSON file. */
export function exportRowsToJson(rows: readonly BgsRow[], nowMs: number = Date.now()): void {
  const records = rows.map(row => toExportRecord(row, nowMs));
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
  downloadBlob(exportFilename('json', nowMs), blob);
}

/** Exports `rows` as a CSV file. */
export function exportRowsToCsv(rows: readonly BgsRow[], nowMs: number = Date.now()): void {
  const blob = new Blob([rowsToCsv(rows, nowMs)], { type: 'text/csv' });
  downloadBlob(exportFilename('csv', nowMs), blob);
}
