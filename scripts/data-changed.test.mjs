import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dataChanged } from './data-changed.mjs';

const published = {
  faction: 'Flotta Stellare',
  generated_at: '2026-10-04T22:06:20.696Z',
  tick_at: '2026-10-04T16:06:50.000Z',
  source: 'spansh.co.uk',
  count: 2,
  results: [
    { name: 'Wong Sher', updated_at: '2026-10-04 18:00:00+00' },
    { name: 'Lyncis Sector CL-Y d68', updated_at: '2026-10-04 18:00:00+00' },
  ],
};

test('a new download time alone is not a change', () => {
  assert.equal(dataChanged({ ...published, generated_at: '2026-10-04T22:36:00.000Z' }, published), false);
});

test('the same systems in another order are not a change', () => {
  assert.equal(dataChanged({ ...published, results: [...published.results].reverse() }, published), false);
});

test('an updated system is a change', () => {
  const results = [{ ...published.results[0], updated_at: '2026-10-04 22:30:00+00' }, published.results[1]];
  assert.equal(dataChanged({ ...published, results }, published), true);
});

test('a new tick is a change, since the counter depends on it', () => {
  assert.equal(dataChanged({ ...published, tick_at: '2026-10-05T16:10:00.000Z' }, published), true);
});

test('no published data counts as a change', () => {
  assert.equal(dataChanged(published, null), true);
});
