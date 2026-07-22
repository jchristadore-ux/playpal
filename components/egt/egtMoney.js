// egtMoney.js — the money engine. Each cash game contributes a zero-sum vector
// (dollars, to the cent), so a round's per-player money necessarily sums to $0
// (seed §8). Values come from moneyDefaults. Pass-the-Money and any season
// settlement are handled as a final zero-sum transfer.

const EgtMoney = (function () {

  const cents = x => Math.round(x * 100) / 100;

  // Force a vector to net exactly zero by pushing residual float error onto the
  // largest-magnitude entry (keeps the guarantee under floating point).
  function zeroBalance(vec) {
    const ids = Object.keys(vec);
    let sum = 0; ids.forEach(id => { vec[id] = cents(vec[id]); sum += vec[id]; });
    if (Math.abs(sum) > 1e-9 && ids.length) {
      let big = ids[0]; ids.forEach(id => { if (Math.abs(vec[id]) > Math.abs(vec[big])) big = id; });
      vec[big] = cents(vec[big] - sum);
    }
    return vec;
  }

  // Pairwise per-quantity settlement: money_i = rate*(n*q_i - Σq). Zero-sum.
  // Used for BBB, Nines, skins (quantity = points or skins won).
  function pairwise(ids, quantityOf, rate) {
    const n = ids.length;
    const total = ids.reduce((a, id) => a + quantityOf(id), 0);
    const vec = {};
    ids.forEach(id => { vec[id] = rate * (n * quantityOf(id) - total); });
    return zeroBalance(vec);
  }

  // Team match: winners split what losers pay. netPoints = winner − loser.
  function teamMatch(teamPlayers, winnerTeam, loserTeam, netPoints, rate) {
    const vec = {};
    const stake = netPoints * rate;
    const winners = teamPlayers[winnerTeam], losers = teamPlayers[loserTeam];
    (winners || []).forEach(pid => { vec[pid] = stake / winners.length; });
    (losers || []).forEach(pid => { vec[pid] = -stake / losers.length; });
    return zeroBalance(vec);
  }

  // Fixed prize (CTP, Long Drive): winner collects `value`, the other players
  // split the cost equally.
  function prizePot(ids, winner, value) {
    const vec = {}; ids.forEach(id => { vec[id] = 0; });
    if (!winner || !ids.includes(winner)) return vec;
    const others = ids.filter(id => id !== winner);
    vec[winner] = value;
    others.forEach(id => { vec[id] = -value / others.length; });
    return zeroBalance(vec);
  }

  // Fixed prize to a game's WINNER(S) — the round's champion(s) collect `value`,
  // funded equally by everyone who didn't win. A tie for first splits the prize
  // between the co-winners; the losers split the cost. Zero-sum. If there is no
  // contest (no winner, or everyone tied for first), no money changes hands.
  // Used for R1's BBB and Nines, which pay a flat prize to the winner rather
  // than settling per point.
  function prizeToWinners(ids, winners, value) {
    const vec = {}; ids.forEach(id => { vec[id] = 0; });
    const w = (winners || []).filter(id => ids.includes(id));
    const losers = ids.filter(id => !w.includes(id));
    if (!w.length || !losers.length || !value) return zeroBalance(vec);
    const prizeEach = value / w.length;
    const costEach = value / losers.length;
    w.forEach(id => { vec[id] = prizeEach; });
    losers.forEach(id => { vec[id] = -costEach; });
    return zeroBalance(vec);
  }

  function addVec(target, vec, label, breakdown) {
    Object.entries(vec).forEach(([pid, amt]) => {
      target[pid] = (target[pid] || 0) + amt;
      if (breakdown && amt) (breakdown[pid] = breakdown[pid] || []).push({ label, amount: cents(amt) });
    });
  }

  // Settle a bundle of configured match-play matches (the individual-Nassau
  // overlay available on every round, plus R5's primary round-robin) Nassau-
  // style: front 1 / back 1 / overall 2 units at each match's own stake
  // (falling back to the round's nassauPerPoint). 2v2 sides split evenly.
  // Zero-sum per segment. Used on every round so any wagered side match is
  // tallied into the tournament money.
  function settleMatchPlay(total, matchPlay, val, breakdown) {
    ((matchPlay && matchPlay.matches) || []).forEach(m => {
      const stake = (m.stakes != null && m.stakes !== '') ? Number(m.stakes) : val('nassauPerPoint');
      const label = m.sides.map(s => s.map(pid => pid.slice(0, 2)).join('+')).join(' v ');
      [['front', m.front, 1], ['back', m.back, 1], ['overall', m.overall, 2]].forEach(([name, seg, units]) => {
        if (!seg || seg.winner === 'halve') return;
        const winners = seg.winner === 'A' ? m.sides[0] : m.sides[1];
        const losers = seg.winner === 'A' ? m.sides[1] : m.sides[0];
        const vec = {};
        winners.forEach(pid => { vec[pid] = (units * stake) / winners.length; });
        losers.forEach(pid => { vec[pid] = -(units * stake) / losers.length; });
        addVec(total, zeroBalance(vec), `Match ${label} ${name}`, breakdown);
      });
    });
  }

  // Money for one finalized round. `results` bundles that round's calculator
  // outputs; `events` supplies CTP/LD winners.
  function moneyForRound(model, roundId, results, events, stakes) {
    const md = model.moneyDefaults;
    // Per-round stake overrides (set on the Rounds tab); fall back to defaults.
    const S = (stakes && stakes[roundId]) || {};
    const val = k => (S[k] != null && S[k] !== '' ? Number(S[k]) : md[k]);
    const round = model.rounds.find(r => r.id === roundId);
    const ids = round.players.slice();
    const total = {}; ids.forEach(id => { total[id] = 0; });
    const breakdown = {};
    const teamPlayers = {}; (round.teams || []).forEach(t => { teamPlayers[t.name] = t.players; });

    // Primary cash game per round.
    if (roundId === 'R1') {
      // R1 is flat/stakes-only: BBB and Nines each pay a fixed prize to that
      // game's winner (funded equally by the field), NOT a per-point settlement.
      // A tie for first splits the prize. Skins are not played for money on R1
      // (see the skins block below) — the money is BBB + Nines + any side Nassau.
      if (results.bbb) addVec(total, prizeToWinners(ids, results.bbb.champions, val('bbbNinesWinner')), 'BBB (winner)', breakdown);
      if (results.nines) addVec(total, prizeToWinners(ids, results.nines.champions, val('bbbNinesWinner')), 'Nines (winner)', breakdown);
    } else if (roundId === 'R2' && results.fourBall) {
      // Nassau: settle each segment team-to-team at nassauPerPoint.
      const segs = results.fourBall.segments;
      [['front', segs.front, model.pointsConfig.R2.nassauFront], ['back', segs.back, model.pointsConfig.R2.nassauBack], ['overall', segs.overall, model.pointsConfig.R2.nassauOverall]]
        .forEach(([name, m, pts]) => {
          if (m.winnerTeam === 'halve') return;
          const winner = m.winnerTeam;
          const loser = round.teams.find(t => t.name !== winner).name;
          addVec(total, teamMatch(teamPlayers, winner, loser, pts, val('nassauPerPoint')), `Nassau ${name}`, breakdown);
        });
    } else if (roundId === 'R3' && results.wolf) {
      // Wolf units are already zero-sum; value each unit.
      const vec = {}; ids.forEach(id => { vec[id] = (results.wolf.units[id] || 0) * val('wolfPerUnit'); });
      addVec(total, zeroBalance(vec), 'Wolf', breakdown);
    } else if (roundId === 'R4' && results.teamStableford) {
      // 2v2 aggregate net Stableford: the three segment matches (1-6 / 7-12 /
      // 13-18) and the 18-hole total settle team-to-team at nassauPerPoint,
      // valued by the same point weights as the Cup (segment 1 / overall 2).
      const ts = results.teamStableford;
      const rate = val('nassauPerPoint');
      const other = name => (round.teams.find(t => t.name !== name) || {}).name;
      const pc = model.pointsConfig.R4 || {};
      ts.segments.forEach((s, i) => {
        if (s.winner === 'halve') return;
        addVec(total, teamMatch(teamPlayers, s.winner, other(s.winner), pc.segmentWin || 1, rate), `Stableford seg ${i + 1}`, breakdown);
      });
      if (ts.overallWinner !== 'halve') {
        addVec(total, teamMatch(teamPlayers, ts.overallWinner, other(ts.overallWinner), pc.overall18 || 2, rate), 'Stableford 18 total', breakdown);
      }
    } else if (roundId === 'R5') {
      // Full-18 BBB pays a flat prize to the winner (same convention as R1);
      // the round-robin match play settles via the general overlay pass below
      // (R5's matches ARE its overlay). Ties for the BBB win split the prize.
      if (results.bbb) addVec(total, prizeToWinners(ids, results.bbb.champions, val('bbbNinesWinner')), 'BBB (winner)', breakdown);
    } else if (roundId === 'R6' && results.singles) {
      // Championship / Bronze singles: each seeded 1v1 settles Nassau-style
      // (front 1 / back 1 / overall 2 units) at nassauPerPoint. Zero-sum per pair.
      const rate = val('nassauPerPoint');
      results.singles.results.forEach(pr => {
        [['front', pr.front, 1], ['back', pr.back, 1], ['overall', pr.match, 2]].forEach(([name, seg, units]) => {
          if (!seg || seg.winner === 'halve') return;
          const w = seg.winner === 'A' ? pr.a : pr.b;
          const l = seg.winner === 'A' ? pr.b : pr.a;
          const vec = {}; vec[w] = units * rate; vec[l] = -units * rate;
          addVec(total, zeroBalance(vec), `Singles ${pr.a.slice(0, 2)}v${pr.b.slice(0, 2)} ${name}`, breakdown);
        });
      });
    }

    // Overlay individual-Nassau side matches settle on every round (any money
    // wagered through the Nassau engine is tallied). For R5 this is the round's
    // primary round-robin; elsewhere these are side bets layered on the format.
    settleMatchPlay(total, results.overlayMatchPlay, val, breakdown);

    // Skins are NOT played for money on any round. They are still derived from
    // the entered scores by the skins calculator so the Cup's Skins King award
    // and the total-skins tiebreaker keep working — they just don't settle cash.
    // (Each round's money is its primary format + any side Nassau.)

    // CTP / Long Drive prizes for this round.
    (events?.ctp || []).filter(e => e.round === roundId).forEach(e => {
      addVec(total, prizePot(ids, e.player, val('ctpLd')), `CTP h${e.hole}`, breakdown);
    });
    (events?.longDrive || []).filter(e => e.round === roundId).forEach(e => {
      addVec(total, prizePot(ids, e.player, val('ctpLd')), `Long Drive h${e.hole}`, breakdown);
    });

    zeroBalance(total);
    return { roundId, total, breakdown, netsToZero: Math.abs(Object.values(total).reduce((a, b) => a + b, 0)) < 1e-6 };
  }

  // Final Pass-the-Money settlement: the ending holder collects bill + pot from
  // the field, split equally. Zero-sum across all four.
  function passTheMoneySettlement(model, ptm) {
    const ids = model.players.map(p => p.id);
    const value = (ptm.bill || 0) + (ptm.potTotal || 0);
    return { total: prizePot(ids, ptm.finalHolder, value), value, holder: ptm.finalHolder };
  }

  // Whole-tournament money: sum finalized rounds + PTM settlement.
  //   stakes: optional { [roundId]: { [key]: number } } overrides (Rounds tab).
  function compute(model, resultsByRound, events, ptm, stakes) {
    const ids = model.players.map(p => p.id);
    const total = {}; ids.forEach(id => { total[id] = 0; });
    const rounds = {};
    model.rounds.forEach(round => {
      if (!resultsByRound[round.id]) return;
      const rm = moneyForRound(model, round.id, resultsByRound[round.id], events, stakes);
      rounds[round.id] = rm;
      Object.entries(rm.total).forEach(([pid, amt]) => { total[pid] = (total[pid] || 0) + amt; });
    });
    if (ptm && ptm.finalHolder) {
      const s = passTheMoneySettlement(model, ptm);
      rounds.passTheMoney = s;
      Object.entries(s.total).forEach(([pid, amt]) => { total[pid] = (total[pid] || 0) + amt; });
    }
    zeroBalance(total);
    return { rounds, total, netsToZero: Math.abs(Object.values(total).reduce((a, b) => a + b, 0)) < 1e-6 };
  }

  return { cents, zeroBalance, pairwise, teamMatch, prizePot, prizeToWinners, moneyForRound, passTheMoneySettlement, compute };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtMoney });
}
