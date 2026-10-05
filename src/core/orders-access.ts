/**
 * The Ordini Ufficiali page's passphrase check. See {@link ORDERS_PASSPHRASE_HASH} in
 * `config.ts` for why this is a deterrent rather than real access control.
 */
import { ORDERS_PASSPHRASE_HASH } from './config';

/** SHA-256 hex digest of `text`, via Web Crypto (available in both the browser and Node). */
export async function hashPassphrase(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Whether `candidate` matches the configured passphrase. */
export async function checkOrdersPassphrase(candidate: string): Promise<boolean> {
  return (await hashPassphrase(candidate)) === ORDERS_PASSPHRASE_HASH;
}
