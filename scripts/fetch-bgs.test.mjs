import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeConflictSystems, fetchConflictScores, fetchLastTick, slimSystem } from './fetch-bgs.mjs';

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

test('picks the systems where our faction has an active war, civil war or election', () => {
  const systems = [
    { name: 'A', minor_faction_presences: [{ name: 'Flotta Stellare', active_states: ['Civil War'] }] },
    { name: 'B', minor_faction_presences: [{ name: 'Flotta Stellare', active_states: ['Boom'], pending_states: ['Election'] }] },
    { name: 'C', minor_faction_presences: [{ name: 'Other', active_states: ['War'] }, { name: 'Flotta Stellare' }] },
    { name: 'D', minor_faction_presences: [{ name: 'Flotta Stellare', active_states: ['Election'] }] },
  ];
  assert.deepEqual(activeConflictSystems(systems, 'Flotta Stellare'), ['A', 'D']);
});

test('asks EliteBGS for conflict scores ten systems at a time, keyed by lowercased name', async t => {
  const names = Array.from({ length: 12 }, (_unused, i) => `System ${i}`);
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(url);
    const asked = new URL(url).searchParams.getAll('name');
    return new Response(JSON.stringify({
      docs: asked.map(name => ({
        name: name.toUpperCase(),
        updated_at: '2026-10-06T08:00:00.000Z',
        conflicts: [{ type: 'war', status: 'active', faction1: { name: 'Flotta Stellare', stake: '', days_won: 1, faction_id: 'x' }, faction2: { name: 'Other', stake: 'Port', days_won: 2 } }],
      })),
    }));
  });

  const scores = await fetchConflictScores(names);

  assert.equal(urls.length, 2);
  assert.equal(new URL(urls[0]).searchParams.getAll('name').length, 10);
  assert.deepEqual(scores['system 11'], {
    updated_at: '2026-10-06T08:00:00.000Z',
    conflicts: [{ type: 'war', status: 'active', faction1: { name: 'Flotta Stellare', stake: null, days_won: 1 }, faction2: { name: 'Other', stake: 'Port', days_won: 2 } }],
  });
});

test('does not call EliteBGS when no system is in conflict', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  assert.deepEqual(await fetchConflictScores([]), {});
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('treats an EliteBGS database error as no scores, even when it comes back as HTTP 200', async t => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ message: 'connect ECONNREFUSED 127.0.0.1:27017', error: {} })));
  assert.equal(await fetchConflictScores(['Misir']), null);
});

test('treats an EliteBGS HTTP 500 as no scores, without failing the download', async t => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () => new Response('{"message":"down"}', { status: 500 }));
  assert.equal(await fetchConflictScores(['Misir']), null);
});
