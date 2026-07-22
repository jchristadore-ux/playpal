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
    };
    const config = model.formatConfigs[roundId];
    const ctx = { round, course, players, teams: round.teams, alloc, scores, config, events };

    // Overlay individual-Nassau matches, available on EVERY round (side bets, or
    // the round's primary format for R5). The UI stores them under
    // events.roundMatches[roundId]; the legacy events.r5Matches key is honored
    // for R5 so older persisted states still resolve. Pops resolve here — manual
    // popHoles win, otherwise CH difference off the low within each match — via
    // the same helper the scorer bridge uses, so engine and tracker agree.
    const H = g('EgtHandicap');
    const chById = model.derived[roundId].courseHandicaps;
    const holes18 = course.holes.slice(0, 18).map(h => ({ hole: h.hole, si: h.si }));
    const overlaySrc = (state.events.roundMatches && state.events.roundMatches[roundId])
      || (roundId === 'R5' ? state.events.r5Matches : null) || [];
    ctx.overlayMatches = overlaySrc
      .filter(m => (m.matchType === '2v2'
        ? m.teams && (m.teams.team1 || []).length === 2 && (m.teams.team2 || []).length === 2
        : (m.playersInMatch || []).length === 2))
      .map(m => ({
        ...m,
        popFlags: H.matchPopFlags(chById, holes18, m.playersInMatch || [], m.popHoles),
      }));
    ctx.matches = ctx.overlayMatches; // matchPlay() reads ctx.matches

    if (roundId === 'R6') {
      ctx.singlesCourseHandicaps = model.derived.R6.courseHandicaps;
      ctx.pairings = state.events.singlesPairings || [];
    }
    return ctx;
  }

  // Run every calculator relevant to a round.
  function runRound(state, roundId) {
    const ctx = buildRoundCtx(state, roundId);
    const sc = S();
    const out = {};
    // Overlay individual-Nassau matches settle on every round (side bets that
    // fold into the zero-sum tournament money). For R5 these matches ARE the
    // round's primary match play, so it also drives Cup points (below).
    out.overlayMatchPlay = sc.matchPlay(ctx);
    switch (roundId) {
      case 'R1':
        out.bbb = sc.bingoBangoBongo(ctx);
        out.nines = sc.nines(ctx);
        break;
      case 'R2': out.fourBall = sc.fourBallMatch(ctx); break;
      case 'R3': out.wolf = sc.wolf(ctx); break;
      case 'R4': out.teamStableford = sc.teamStableford(ctx); break;
      case 'R5':
        out.bbb = sc.bingoBangoBongo(ctx);   // full 18, gross
        out.matchPlay = out.overlayMatchPlay; // the matches configured pre-round
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

  // Round ids that count toward the tournament (standings, awards, tiebreakers).
  // R1 is flat/stakes-only — its stats stay out of everything but money.
  function tourneyRoundIds() {
    const excluded = (P().STANDINGS_EXCLUDED_ROUNDS) || [];
    return rid => !excluded.includes(rid);
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
    if (r5?.matchPlay) r5.matchPlay.matches.forEach(m => { m.winnerIds.forEach(pid => { if (wins[pid] != null) wins[pid] += 1; }); });
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

    // Seed the R6 singles BEFORE computing round results, so R6 singles points
    // and money resolve in this same pass (the SportsCenter provider and the
    // printable run liveUpdate once). Seeding basis is the Cup standings THROUGH
    // R5 — R6 is excluded from the preliminary board that determines the seeds.
    if ((state.finalized || []).includes('R5')
        && (!state.events.singlesPairings || !state.events.singlesPairings.length)) {
      const preFinalized = (state.finalized || []).filter(rid => rid !== 'R6');
      const preResults = resultsForFinalized(Object.assign({}, state, { finalized: preFinalized }));
      const preBoard = standingsMod.leaderboard(model, P().compute(model, preResults, null), {
        r6Stableford: {}, headToHead: headToHead(model, preResults),
      });
      store.setEvent(state, 'singlesPairings', standingsMod.reseedR6(preBoard));
    }

    const resultsByRound = resultsForFinalized(state);
    const h2h = headToHead(model, resultsByRound);
    const r6Stab = resultsByRound.R6?.stableford?.totals || {};

    // Cumulative tourney stats (putts / FIR / GIR / birdies …) over R2-R6,
    // live from whatever scores are entered — shown on the standings page and
    // reused as the season-award inputs at final settlement.
    const counts = tourneyRoundIds();
    const tourneyScores = {};
    Object.keys(state.scores || {}).forEach(rid => { if (counts(rid)) tourneyScores[rid] = state.scores[rid]; });
    const tourneyStats = SG().seasonStats(model, tourneyScores);

    // Season inputs (final settlement only). Season awards read tourney rounds
    // only (R2-R6) — R1 stats never feed Birdie King / Flat Stick / Iron Man.
    let seasonInputs = null, ptm = null;
    if (o.season) {
      seasonInputs = { final: true, seasonStats: tourneyStats };
      ptm = SG().passTheMoney(model, state.scores); // The Rock runs R2-R6 already
    }

    const points = P().compute(model, resultsByRound, seasonInputs);
    const money = M().compute(model, resultsByRound, state.events, ptm, state.stakes);

    const tie = { r6Stableford: r6Stab, headToHead: h2h };
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

    return { resultsByRound, points, money, standings: board, night, snapshot, r6Pairings, headToHead: h2h, ptm, tourneyStats };
  }

  return { buildRoundCtx, runRound, resultsForFinalized, headToHead, liveUpdate };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtEngine });
}
