import { checkOrdersPassphrase, hashPassphrase } from './orders-access';
import { ORDERS_PASSPHRASE_HASH } from './config';

describe('hashPassphrase', () => {
  it('matches the configured hash for the placeholder passphrase', async () => {
    expect(await hashPassphrase('cambiami')).toBe(ORDERS_PASSPHRASE_HASH);
  });
});

describe('checkOrdersPassphrase', () => {
  it('accepts the configured passphrase', async () => {
    expect(await checkOrdersPassphrase('cambiami')).toBe(true);
  });

  it('rejects anything else', async () => {
    expect(await checkOrdersPassphrase('qualcosa-altro')).toBe(false);
  });
});
