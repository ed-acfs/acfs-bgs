import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchLastTick, slimSystem } from './fetch-bgs.mjs';

const system = {
  name: 'Wong Sher',
  controlling_minor_faction: 'Flotta Stellare',
  updated_at: '2026-10-04T17:24:53Z',
  x: 16.46875,
  y: 4.0625,
  z: -60.5,
  bodies: [{ name: 'Wong Sher A' }],
  synthesis_recipes: [{ name: 'FSD', level: 'Basic' }],
  minor_faction_presences: [{ name: 'Flotta Stellare', influence: 0.6, active_states: ['Boom'] }],
  stations: [
    { name: 'Starport', type: 'Coriolis Starport', controlling_minor_faction: 'Flotta Stellare', has_market: true },
    { name: 'X7Z-12B', type: 'Drake-Class Carrier', controlling_minor_faction: 'FleetCarrier' },
    { name: 'Outpost', controlling_minor_faction: 'Other Faction' },
  ],
};

test('drops bodies, synthesis recipes and the full station details', () => {
  const slim = slimSystem(system);

  assert.equal('bodies' in slim, false);
  assert.equal('synthesis_recipes' in slim, false);
  assert.equal('stations' in slim, false);
});

test('keeps the fields the app reads untouched', () => {
  const slim = slimSystem(system);

  assert.equal(slim.name, 'Wong Sher');
  assert.equal(slim.controlling_minor_faction, 'Flotta Stellare');
  assert.equal(slim.updated_at, '2026-10-04T17:24:53Z');
  assert.deepEqual([slim.x, slim.y, slim.z], [16.46875, 4.0625, -60.5]);
  assert.deepEqual(slim.minor_faction_presences, system.minor_faction_presences);
});

test('counts and lists stations without fleet carriers', () => {
  const slim = slimSystem(system);

  assert.equal(slim.station_count, 2);
  assert.deepEqual(slim.assets, [
    { name: 'Starport', type: 'Coriolis Starport', controlling_minor_faction: 'Flotta Stellare' },
    { name: 'Outpost', type: null, controlling_minor_faction: 'Other Faction' },
  ]);
});

test('handles a system Spansh returns without stations', () => {
  const { stations, ...withoutStations } = system;
  const slim = slimSystem(withoutStations);

  assert.equal(slim.station_count, 0);
  assert.deepEqual(slim.assets, []);
});

test('reads the last tick from the Tick Detector as an ISO timestamp', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify('2026-10-04T16:06:50+00:00')));
  assert.equal(await fetchLastTick(), '2026-10-04T16:06:50.000Z');
});

test('treats an unreachable Tick Detector as an unknown tick, without failing', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Service Unavailable', { status: 503 }));
  t.mock.method(console, 'warn', () => {});
  assert.equal(await fetchLastTick(), null);
});
