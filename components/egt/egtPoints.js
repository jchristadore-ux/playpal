// egtPoints.js — the EGT Cup points engine. Turns finalized round results
// (calculator outputs) into per-player points with a full breakdown, then adds
// the four season awards. Verified against pointsConfig.maxPossible:
//   per-round maxes 6+4+4+5+4+7 = 30, season awards 2+2+1+1 = 6 → 36
//   (Brian 30: he misses R1, worth 6).

const EgtPoints = (function () {

  // Rounds played for money/stakes only — they award NO EGT Cup points and are
  // excluded from the standings (R1 Minerals is a flat/stakes-only round).
  const STANDINGS_EXCLUDED_ROUNDS = ['R1'];

  // Max Cup points a round can award a single player (for the "Max" column).
  const ROUND_MAX_POINTS = { R1: 6, R2: 4, R3: 4, R4: 5, R5: 4, R6: 7 };

  // Split a ranked finish table across positions, sharing tied slots evenly.
  //   ranked: [{ player, value }] already sorted best-first
  //   slots:  [4,3,2,1] points for 1st..last. Ties pool and divide.
  function rankedFinishPoints(ranked, slots) {
    const out = {}; ranked.forEach(r => { out[r.player] = 0; });
    let i = 0;
    while (i < ranked.length) {
      let j = i; while (j + 1 < ranked.length && ranked[j + 1].value === ranked[i].value) j++;
      const size = j - i + 1;
      const pool = slots.slice(i, i + size).reduce((a, b) => a + (b || 0), 0);
      const share = pool / size;
      for (let k = i; k <= j; k++) out[ranked[k].player] = share;
      i = j + 1;
    }
    return out;
  }

  function addPoints(acc, pid, category, pts) {
    if (!acc[pid]) acc[pid] = { total: 0, breakdown: [] };
    acc[pid].total += pts;
    acc[pid].breakdown.push({ category, points: pts });
  }

  // Award points for one finalized round given its calculator result bundle.
  //   roundId + results: whatever calculators produced for that round.
  function pointsForRound(model, roundId, results, acc) {
    const cfg = model.pointsConfig[roundId] || {};
    const round = model.rounds.find(r => r.id === roundId);
    const teamPlayers = name => {
      const t = (round.teams || []).find(x => x.name === name);
      return t ? t.players : [];
    };

    if (roundId === 'R1') {
      if (results.bbb) results.bbb.champions.forEach(pid => {
        addPoints(acc, pid, 'BBB champion', (cfg.bbbChampion || 0) / results.bbb.champions.length);
      });
      if (results.nines) results.nines.champions.forEach(pid => {
        addPoints(acc, pid, 'Nines champion', (cfg.ninesChampion || 0) / results.nines.champions.length);
      });
    } else if (roundId === 'R2' && results.fourBall) {
      const seg = results.fourBall.segments;
      const award = (m, label, pts) => {
        if (m.winnerTeam === 'halve') return;
        teamPlayers(m.winnerTeam).forEach(pid => addPoints(acc, pid, label, pts));
      };
      award(seg.front, 'Nassau front', cfg.nassauFront || 1);
      award(seg.back, 'Nassau back', cfg.nassauBack || 1);
      award(seg.overall, 'Nassau overall', cfg.nassauOverall || 2);
    } else if (roundId === 'R3' && results.wolf) {
      const ranked = results.wolf.ranked.map(r => ({ player: r.player, value: r.units }));
      const pts = rankedFinishPoints(ranked, cfg.wolfFinish || [4, 3, 2, 1]);
      Object.entries(pts).forEach(([pid, p]) => addPoints(acc, pid, 'Wolf finish', p));
    } else if (roundId === 'R4' && results.teamStableford) {
      const ts = results.teamStableford;
      ts.segments.forEach((s, i) => {
        if (s.winner === 'halve') return;
        teamPlayers(s.winner).forEach(pid => addPoints(acc, pid, `Stableford seg ${i + 1}`, cfg.segmentWin || 1));
      });
      if (ts.overallWinner !== 'halve') teamPlayers(ts.overallWinner).forEach(pid => addPoints(acc, pid, 'Stableford 18 total', cfg.overall18 || 2));
    } else if (roundId === 'R5') {
      // Full-18 BBB champion + best round-robin match-play record, 2 pts each
      // (ties split the pool) — R5 stays worth 4 toward the 30-point ceiling.
      if (results.bbb) results.bbb.champions.forEach(pid => {
        addPoints(acc, pid, 'BBB champion', (cfg.bbbChampion || 2) / results.bbb.champions.length);
      });
      if (results.matchPlay) results.matchPlay.champions.forEach(pid => {
        addPoints(acc, pid, 'Match play champion', (cfg.matchPlayChampion || 2) / results.matchPlay.champions.length);
      });
    } else if (roundId === 'R6') {
      if (results.singles) results.singles.results.forEach(m => {
        if (m.winner === 'halve') {
          addPoints(acc, m.a, 'Singles halve', cfg.singlesHalve || 1.5);
          addPoints(acc, m.b, 'Singles halve', cfg.singlesHalve || 1.5);
        } else {
          addPoints(acc, m.winner, 'Singles win', cfg.singlesWin || 3);
        }
      });
      if (results.stableford) {
        const ranked = results.stableford.ranked.map(r => ({ player: r.player, value: r.points }));
        const pts = rankedFinishPoints(ranked, cfg.stablefordFinish || [4, 3, 2, 1]);
        Object.entries(pts).forEach(([pid, p]) => addPoints(acc, pid, 'Stableford finish', p));
      }
    }
    return acc;
  }

  // Season awards from cumulative skins, net birdies, putts, FIR+GIR.
  //   seasonStats: EgtSideGames.seasonStats output. skinsTotals: { pid: n }.
  function seasonAwards(model, seasonStats, skinsTotals, acc) {
    const cfg = model.pointsConfig.seasonAwards || {};
    const winnersOf = (valueOf, lowest) => {
      const entries = model.players.map(p => ({ pid: p.id, v: valueOf(p.id) }));
      const best = lowest ? Math.min(...entries.map(e => e.v)) : Math.max(...entries.map(e => e.v));
      return entries.filter(e => e.v === best && isFinite(e.v)).map(e => e.pid);
    };
    const grant = (winners, label, pts) => winners.forEach(pid => addPoints(acc, pid, label, pts / winners.length));
    grant(winnersOf(pid => skinsTotals?.[pid] || 0, false), 'Skins King', cfg.skinsKing || 2);
    grant(winnersOf(pid => seasonStats?.[pid]?.netBirdies || 0, false), 'Birdie King (net)', cfg.birdieKingNet || 2);
    // Fewest putts requires putts to actually be tracked — a player with zero
    // recorded putt holes is ineligible, not a 0-putt winner.
    grant(winnersOf(pid => {
      const s = seasonStats?.[pid];
      return s && s.puttHoles > 0 ? s.putts : Infinity;
    }, true), 'Flat Stick (fewest putts)', cfg.flatStickFewestPutts || 1);
    grant(winnersOf(pid => (seasonStats?.[pid]?.fairwaysHit || 0) + (seasonStats?.[pid]?.greensInReg || 0), false), 'Iron Man (FIR+GIR)', cfg.ironManFIRplusGIR || 1);
    return acc;
  }

  // Full engine: all finalized rounds + optional season awards.
  //   resultsByRound: { R1: {...}, R2: {...}, ... } only for finalized rounds.
  function compute(model, resultsByRound, seasonInputs) {
    const acc = {};
    model.players.forEach(p => { acc[p.id] = { total: 0, breakdown: [] }; });
    model.rounds.forEach(round => {
      if (STANDINGS_EXCLUDED_ROUNDS.includes(round.id)) return; // flat/stakes-only
      if (resultsByRound[round.id]) pointsForRound(model, round.id, resultsByRound[round.id], acc);
    });
    if (seasonInputs && seasonInputs.final) {
      seasonAwards(model, seasonInputs.seasonStats, seasonInputs.skinsTotals, acc);
    }
    return acc;
  }

  // "Max possible" per player, computed from first principles so it is
  // idempotent (safe to re-run on rehydrated persisted models): the sum of each
  // tourney round's ceiling for rounds the player plays, plus the season
  // awards. Excluded (flat/stakes-only) rounds contribute nothing — with R1
  // out, every player caps at 24 + 6 = 30.
  function adjustedMaxPossible(model) {
    const awardsTotal = Object.values(model.pointsConfig.seasonAwards || {})
      .reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
    const out = {};
    model.players.forEach(p => {
      let m = awardsTotal;
      model.rounds.forEach(r => {
        if (STANDINGS_EXCLUDED_ROUNDS.includes(r.id)) return;
        if (r.players.includes(p.id)) m += (ROUND_MAX_POINTS[r.id] || 0);
      });
      out[p.id] = m;
    });
    return out;
  }

  return { STANDINGS_EXCLUDED_ROUNDS, ROUND_MAX_POINTS, rankedFinishPoints, pointsForRound, seasonAwards, compute, adjustedMaxPossible };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtPoints });
}
