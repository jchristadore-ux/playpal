// egtStandings.js — leaderboard, tiebreakers, R6 reseeding, and night-over-night
// snapshots with position deltas. A snapshot is persisted per night (Tue/Wed/
// Thu/Fri) so movement is diffable.

const EgtStandings = (function () {

  // Which "night" a round's results belong to (seed dates).
  const ROUND_NIGHT = { R1: 'TUE', R2: 'WED', R3: 'WED', R4: 'THU', R5: 'THU', R6: 'FRI' };
  const NIGHT_ORDER = ['TUE', 'WED', 'THU', 'FRI'];

  // Display formatter for Cup points. Split pools produce thirds
  // (e.g. a 3-way champion split of 2 pts = 0.6666666666666666), which must
  // never hit a screen raw. Rounds to 2 decimals and drops trailing zeros:
  // 19 → 19, 3.5 → 3.5, 2/3 → 0.67. Every points display (app standings,
  // printable packet, ticker, SportsCenter) goes through this one helper.
  function fmtPoints(v) {
    const n = Math.round((Number(v) || 0) * 100) / 100;
    return n;
  }

  // Build the ranked leaderboard from points, breaking ties by the seed's order:
  //   R6 Stableford points → head-to-head → chip-off.
  //   tie: { r6Stableford:{pid:pts}, headToHead:{pid:wins}, chipOff:{pid:rank} }
  function leaderboard(model, points, tie) {
    const t = tie || {};
    const rows = model.players.map(p => ({
      player: p.id,
      name: p.name,
      points: points?.[p.id]?.total || 0,
      breakdown: points?.[p.id]?.breakdown || [],
      r6Stableford: t.r6Stableford?.[p.id] || 0,
      headToHead: t.headToHead?.[p.id] || 0,
      chipOff: t.chipOff?.[p.id] ?? null,
      maxPossible: model.pointsConfig.maxPossible?.[p.id] ?? null,
    }));
    rows.sort((a, b) =>
      b.points - a.points ||
      b.r6Stableford - a.r6Stableford ||
      b.headToHead - a.headToHead ||
      ((a.chipOff ?? 99) - (b.chipOff ?? 99)) ||
      a.name.localeCompare(b.name)
    );
    // Dense ranks; a genuine full tie (nothing broke it) shares a rank.
    let rank = 0, prev = null;
    rows.forEach((r, i) => {
      const key = [r.points, r.r6Stableford, r.headToHead, r.chipOff].join('|');
      if (key !== prev) { rank = i + 1; prev = key; }
      r.rank = rank;
    });
    return rows;
  }

  // Reseed R6 singles from the standings after R5: 1v2 Championship, 3v4 Bronze.
  function reseedR6(standings) {
    const order = standings.slice().sort((a, b) => a.rank - b.rank || 0);
    const s = order.map(r => r.player);
    const pairings = [];
    if (s.length >= 2) pairings.push({ a: s[0], b: s[1], tier: 'Championship', seeds: [1, 2] });
    if (s.length >= 4) pairings.push({ a: s[2], b: s[3], tier: 'Bronze', seeds: [3, 4] });
    return pairings;
  }

  // Compare a fresh leaderboard against the previous snapshot → per-player delta.
  function withDeltas(current, previousSnapshot) {
    const prevRank = {};
    if (previousSnapshot) previousSnapshot.standings.forEach(r => { prevRank[r.player] = r.rank; });
    return current.map(r => {
      const was = prevRank[r.player];
      let move = 0, dir = 'same';
      if (was != null) { move = was - r.rank; dir = move > 0 ? 'up' : move < 0 ? 'down' : 'same'; }
      else dir = 'new';
      return { ...r, prevRank: was ?? null, move, direction: dir };
    });
  }

  // Assemble a night snapshot object (persisted by EgtStore).
  function makeSnapshot(model, night, standings, money, meta) {
    return {
      tripId: model.trip.id,
      night,
      timestamp: (meta && meta.timestamp) || new Date().toISOString(),
      standings: standings.map(r => ({
        player: r.player, name: r.name, rank: r.rank, points: r.points,
        move: r.move ?? 0, direction: r.direction ?? 'same', prevRank: r.prevRank ?? null,
      })),
      money: money || null,
      roundsFinalized: (meta && meta.roundsFinalized) || [],
    };
  }

  return { ROUND_NIGHT, NIGHT_ORDER, fmtPoints, leaderboard, reseedR6, withDeltas, makeSnapshot };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtStandings });
}
