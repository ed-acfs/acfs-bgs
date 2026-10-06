/**
 * The officers' Assign password, remembered on this device after the first successful
 * assignment so it isn't asked every time — forgotten again as soon as the script rejects it.
 * Stored in plain text in this browser's localStorage: fine on an officer's own device, and
 * the script, not this, is what actually protects the registry.
 */
import { STORAGE_PREFIX } from '../core/config';

/** localStorage key the password is stored under. */
const ASSIGN_PASSWORD_KEY = `${STORAGE_PREFIX}assign-password:v1`;

export function readAssignPassword(): string {
  try {
    return localStorage.getItem(ASSIGN_PASSWORD_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeAssignPassword(password: string): void {
  try {
    localStorage.setItem(ASSIGN_PASSWORD_KEY, password);
  } catch {
    // Storage unavailable (e.g. private browsing) — the password will just be asked again.
  }
}

export function forgetAssignPassword(): void {
  try {
    localStorage.removeItem(ASSIGN_PASSWORD_KEY);
  } catch {
    // Nothing stored to forget.
  }
}
