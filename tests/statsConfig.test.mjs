import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();
const SS = W.StatsService;
const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

test('STAT_TRACK_DEFS exposes Putts/FIR/GIR on by default, PEN/U&D off (Sand removed)', () => {
  const byKey = Object.fromEntries(SS.STAT_TRACK_DEFS.map(d => [d.key, d]));
  for (const k of ['putts', 'fir', 'gir', 'pen', 'ud']) {
    assert.ok(byKey[k], `missing stat def: ${k}`);
  }
  assert.equal(byKey.sand, undefined, 'sand tracking removed');
  assert.equal(byKey.putts.default, true);
  assert.equal(byKey.fir.default, true);
  assert.equal(byKey.gir.default, true);
  assert.equal(byKey.pen.default, false);
  assert.equal(byKey.ud.default, false);
  jeq(SS.DEFAULT_STATS_CONFIG, { putts: true, fir: true, gir: true, pen: false, ud: false });
});

test('normalizeStatsConfig fills defaults, keeps known keys, drops unknown', () => {
  jeq(SS.normalizeStatsConfig(null), SS.DEFAULT_STATS_CONFIG, 'null → defaults');
  jeq(SS.normalizeStatsConfig({}), SS.DEFAULT_STATS_CONFIG, 'empty → defaults');
  jeq(
    SS.normalizeStatsConfig({ pen: true, gir: false, bogus: true }),
    { putts: true, fir: true, gir: false, pen: true, ud: false },
    'partial merges over defaults; unknown ignored'
  );
  // Non-boolean values are ignored (fall back to default).
  jeq(SS.normalizeStatsConfig({ putts: 'yes' }), SS.DEFAULT_STATS_CONFIG);
});

test('resolveRoundStatsConfig: explicit statsConfig wins (normalized)', () => {
  jeq(
    SS.resolveRoundStatsConfig({ statsConfig: { putts: false, fir: true } }),
    { putts: false, fir: true, gir: true, pen: false, ud: false }
  );
});

test('resolveRoundStatsConfig: legacy trackStats=true → all stats on', () => {
  jeq(
    SS.resolveRoundStatsConfig({ trackStats: true }),
    { putts: true, fir: true, gir: true, pen: true, ud: true }
  );
});

test('resolveRoundStatsConfig: legacy trip round → putts/FIR/GIR on', () => {
  jeq(
    SS.resolveRoundStatsConfig({ tripId: 'trip_1' }),
    { putts: true, fir: true, gir: true, pen: false, ud: false }
  );
});

test('resolveRoundStatsConfig: plain legacy round → putts only', () => {
  jeq(
    SS.resolveRoundStatsConfig({}),
    { putts: true, fir: false, gir: false, pen: false, ud: false }
  );
  // statsConfig takes precedence over a legacy trackStats flag on the same round.
  jeq(
    SS.resolveRoundStatsConfig({ trackStats: true, statsConfig: { putts: true, fir: false, gir: false } }),
    { putts: true, fir: false, gir: false, pen: false, ud: false }
  );
});
