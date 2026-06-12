import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();
const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const CS = W.CourseService;

const legacy = {
  id: 'leg', name: 'Legacy Links', location: 'Old Town, NJ', rating: 71.2, slope: 128,
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, yds: 400, hdcp: i + 1 })),
};

test('normalizeCourse upgrades a legacy course to the tee model', () => {
  const c = CS.normalizeCourse(legacy);
  assert.equal(c.holeCount, 18);
  assert.equal(c.tees.length, 1);
  assert.equal(c.tees[0].rating, 71.2);
  assert.equal(c.tees[0].slope, 128);
  assert.equal(c.rating, 71.2, 'legacy mirror fields preserved');
});

test('normalizeCourse keeps explicit tees and 9-hole layouts', () => {
  const nine = {
    id: 'n9', name: 'Niner', location: 'X', holeCount: 9,
    holes: legacy.holes.slice(0, 9),
    tees: [
      { id: 'blue', name: 'Blue', rating: 35.8, slope: 120, yds: Array(9).fill(390) },
      { id: 'red', name: 'Red', rating: 34.1, slope: 110 },
    ],
  };
  const c = CS.normalizeCourse(nine);
  assert.equal(c.holeCount, 9);
  assert.equal(c.tees.length, 2);
  assert.equal(CS.getTee(c, 'red').slope, 110);
  assert.equal(CS.getTee(c, 'missing').id, 'blue', 'falls back to first tee');
});

test('holesForTee substitutes tee yardages when present', () => {
  const c = CS.normalizeCourse({
    ...legacy,
    tees: [{ id: 'tips', name: 'Tips', rating: 74, slope: 140, yds: Array(18).fill(450) }],
  });
  const holes = CS.holesForTee(c, 'tips');
  assert.equal(holes[0].yds, 450);
  assert.equal(holes[0].par, 4);
});

test('coursePar sums hole pars', () => {
  assert.equal(CS.coursePar(legacy), 72);
});

test('searchLocal matches name and location case-insensitively', () => {
  const list = [legacy, { id: 'x', name: 'Sunny Dunes', location: 'Beach, CA', holes: [] }];
  assert.equal(CS.searchLocal('dunes', list).length, 1);
  assert.equal(CS.searchLocal('nj', list)[0].id, 'leg');
  assert.equal(CS.searchLocal('', list).length, 2);
});

test('favorites toggle and persist', () => {
  jeq(CS.getFavoriteIds(), []);
  CS.toggleFavorite('leg');
  assert.equal(CS.isFavorite('leg'), true);
  CS.toggleFavorite('leg');
  assert.equal(CS.isFavorite('leg'), false);
});

test('recents dedupe, cap at 10, newest first', () => {
  for (let i = 0; i < 12; i++) {
    CS.recordRecent({ ...legacy, id: 'c' + i, name: 'Course ' + i });
  }
  CS.recordRecent({ ...legacy, id: 'c5', name: 'Course 5' });
  const recents = CS.getRecents();
  assert.equal(recents.length, 10);
  assert.equal(recents[0].id, 'c5', 'replayed course moves to front');
  assert.equal(recents[0].tees.length, 1, 'recents are stored normalized');
});

test('course providers aggregate and normalize results', (t, done) => {
  assert.equal(CS.providerAvailable(), false);
  CS.searchProviders('pines', (results) => {
    jeq(results, []);
    CS.registerProvider({
      id: 'fakeapi', label: 'Fake API',
      search: (_q, cb) => cb([{ id: 'remote1', name: 'Remote Pines', location: 'Cloud, NJ', rating: 70, slope: 120, holes: legacy.holes }]),
    });
    CS.searchProviders('pines', (results2) => {
      assert.equal(results2.length, 1);
      assert.equal(results2[0].providerId, 'fakeapi');
      assert.equal(results2[0].tees.length, 1, 'remote results come back normalized');
      done();
    });
  });
});
