/**
 * The squadron's "semafori": a traffic light for each controlled system's influence and for its
 * lead over the second faction (the Margine). At least one green light means the system is
 * calm; at least one red means it needs watching. Thresholds live in `config.json`.
 */
import { SEMAPHORE_THRESHOLDS, SemaphoreThreshold } from './config';

export type Semaphore = 'green' | 'yellow' | 'red';

/**
 * Compares the value as the table shows it, rounded to one decimal, so a cell reading "50,0%"
 * is never yellow because the raw value was 49.97.
 */
function classify(value: number, threshold: SemaphoreThreshold): Semaphore {
  const shown = Math.round(value * 10) / 10;
  if (shown >= threshold.green) {
    return 'green';
  }
  return shown >= threshold.yellow ? 'yellow' : 'red';
}

/** Influence in percent (0-100): green from 50%, yellow from 40%, red below (default thresholds). */
export function influenceSemaphore(influencePercent: number): Semaphore {
  return classify(influencePercent, SEMAPHORE_THRESHOLDS.influence);
}

/** Lead over the second faction, in points: green from 30, yellow from 18, red below (default thresholds). */
export function marginSemaphore(points: number): Semaphore {
  return classify(points, SEMAPHORE_THRESHOLDS.margin);
}

/** The Ordini Ufficiali status flag (`order-types.json`) matching a semaphore colour. */
export const SEMAPHORE_STATUS_KEY: Record<Semaphore, string> = {
  green: 'ok',
  yellow: 'warning',
  red: 'bad',
};
