// egtEngine.js — orchestrates the whole tournament: build each round's context
// from stored scores + events, run its calculators, then recompute points,
// money, and the leaderboard, flag position changes vs the prior night, reseed
// R6 when R5 closes, and persist a night snapshot. This is the "live update"
// the packet regenerates from (seed §5).

const EgtEngine = (function () {
  const g = name => (typeof window !== 'undefined' ? window[name] : undefined);
  const S = () => g('EgtScoring');
  const P = () => g('EgtPoints');
  const M = () => g('EgtMoney');
  const SG = () => g('EgtSideGames');
  const ST = () => g('EgtStandings');
  const STORE = () => g('EgtStore');

  // Assemble the context a calculator needs for one round.
  function buildRoundCtx(state, roundId) {
    const model = state.model;
    const round = model.rounds.find(r => r.id === roundId);
    const course = model.courses[round.courseId];
    const players = round.players.map(id => model.playersById[id]);
    const alloc = model.derived[roundId].allocations;
    const scores = state.scores[roundId] || {};
    const events = {
      bbb: state.events.bbb?.[roundId] || [],
      wolf: state.events.wolf?.[roundId] || [],
      scrambleGross: state.events.scrambleGross?.[roundId] || {},
      altShotGross: state.events.altShotGross?.[roundId] || {},
    };
    const config = model.formatConfigs[roundId];
    const ctx = { round, course, players, teams: round.teams, alloc, scores, config, events };
    // Round-specific extras.
    if (roundId === 'R5') ctx.teamHandicaps = model.seedStrokeAllocations.R5._teamHandicaps;
    if (roundId === 'R6') {
      ctx.singlesCourseHandicaps = model.derived.R6.courseHandicaps;
      ctx.pairings = state.events.singlesPairings || [];
    }
    return ctx;
  }

  // Run every calculator relevant to a round; skins runs every round.
  function runRound(state, roundId) {
    const ctx = buildRoundCtx(state, roundId);
    const sc = S();
    const out = { skins: sc.skins(ctx) };
    switch (roundId) {
      case 'R1':
        out.bbb = sc.bingoBangoBongo(ctx);
        out.nines = sc.nines(ctx);
        break;
      case 'R2': out.fourBall = sc.fourBallMatch(ctx); break;
      case 'R3': out.wolf = sc.wolf(ctx); break;
      case 'R4': out.teamStableford = sc.teamStableford(ctx); break;
      case 'R5':
        out.scramble = sc.scramble(ctx);
        out.alternateShot = sc.alternateShot(ctx);
        break;
      case 'R6':
        out.singles = sc.singles(ctx);
        out.stableford = sc.individualStableford(ctx);
        break;
    }
    return out;
  }

  // Results for every finalized round (what points/money/standings run on).
  function resultsForFinalized(state) {
    const out = {};
    (state.finalized || []).forEach(rid => { out[rid] = runRound(state, rid); });
    return out;
  }

  // Cumulative skins won (gross + net) across finalized rounds — a tiebreaker
  // and a money input.
  function skinsTotals(resultsByRound) {
    const totals = {};
    Object.values(resultsByRound).forEach(r => {
      if (!r.skins) return;
      ['gross', 'net'].forEach(pot => {
        Object.entries(r.skins[pot].won).forEach(([pid, n]) => { totals[pid] = (totals[pid] || 0) + n; });
      });
    });
    return totals;
  }

  // Head-to-head match wins (four-ball overall, alt-shot, singles) — tiebreaker.
  function headToHead(model, resultsByRound) {
    const wins = {}; model.players.forEach(p => { wins[p.id] = 0; });
    const teamPlayers = (rid, name) => {
      const round = model.rounds.find(r => r.id === rid);
      const t = (round.teams || []).find(x => x.name === name);
      return t ? t.players : [];
    };
    const r2 = resultsByRound.R2;
    if (r2?.fourBall && r2.fourBall.segments.overall.winnerTeam !== 'halve') {
      teamPlayers('R2', r2.fourBall.segments.overall.winnerTeam).forEach(pid => { wins[pid] += 1; });
    }
    const r5 = resultsByRound.R5;
    if (r5?.alternateShot && r5.alternateShot.winnerTeam !== 'halve') {
      teamPlayers('R5', r5.alternateShot.winnerTeam).forEach(pid => { wins[pid] += 1; });
    }
    const r6 = resultsByRound.R6;
    if (r6?.singles) r6.singles.results.forEach(m => { if (m.winner !== 'halve') wins[m.winner] += 1; });
    return wins;
  }

  // Full live recompute + snapshot. opts.season=true triggers season awards +
  // PTM settlement (end of tournament).
  function liveUpdate(state, opts) {
    const o = opts || {};
    const model = state.model;
    const store = STORE();
    const standingsMod = ST();

    const resultsByRound = resultsForFinalized(state);
    const skins = skinsTotals(resultsByRound);
    const h2h = headToHead(model, resultsByRound);
    const r6Stab = resultsByRound.R6?.stableford?.totals || {};

    // Season inputs (final settlement only).
    let seasonInputs = null, ptm = null;
    if (o.season) {
      const seasonStats = SG().seasonStats(model, state.scores);
      seasonInputs = { final: true, seasonStats, skinsTotals: skins };
      ptm = SG().passTheMoney(model, state.scores);
    }

    const points = P().compute(model, resultsByRound, seasonInputs);
    const money = M().compute(model, resultsByRound, state.events, ptm);

    const tie = { r6Stableford: r6Stab, headToHead: h2h, skins };
    let board = standingsMod.leaderboard(model, points, tie);

    // Determine current night from the latest finalized round.
    const finalizedSeq = (state.finalized || []).map(rid => model.rounds.find(r => r.id === rid)?.seq || 0);
    const latestRid = (state.finalized || [])[finalizedSeq.indexOf(Math.max(...finalizedSeq, 0))];
    const night = latestRid ? standingsMod.ROUND_NIGHT[latestRid] : standingsMod.NIGHT_ORDER[0];

    const prevSnap = store.latestSnapshotBefore(state, night, standingsMod.NIGHT_ORDER);
    board = standingsMod.withDeltas(board, prevSnap);

    // Reseed R6 once R5 is finalized (and pairings not already set).
    let r6Pairings = state.events.singlesPairings;
    if ((state.finalized || []).includes('R5') && (!r6Pairings || !r6Pairings.length)) {
      r6Pairings = standingsMod.reseedR6(board);
      store.setEvent(state, 'singlesPairings', r6Pairings);
    }

    // Persist a night snapshot (deltas measured against the prior night).
    const snapshot = standingsMod.makeSnapshot(model, night, board, money.total, {
      roundsFinalized: state.finalized.slice(),
    });
    if (!o.noPersist) store.addSnapshot(state, snapshot);

    return { resultsByRound, points, money, standings: board, night, snapshot, r6Pairings, skins, headToHead: h2h, ptm };
  }

  return { buildRoundCtx, runRound, resultsForFinalized, skinsTotals, headToHead, liveUpdate };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtEngine });
}
