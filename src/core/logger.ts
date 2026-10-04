/**
 * Thin console wrapper that stays silent unless enabled. Use this instead of calling
 * `console.*` directly so diagnostic output never reaches end users. The app enables it in
 * dev mode (see `main.ts`); core code can't ask Angular itself, so it's told instead.
 */
let enabled = false;

/** Turns diagnostic output on or off. */
export function setLoggingEnabled(value: boolean): void {
  enabled = value;
}

export const logger = {
  log: (...args: unknown[]): void => {
    if (enabled) { console.log(...args); }
  },
  warn: (...args: unknown[]): void => {
    if (enabled) { console.warn(...args); }
  },
  error: (...args: unknown[]): void => {
    if (enabled) { console.error(...args); }
  },
};
