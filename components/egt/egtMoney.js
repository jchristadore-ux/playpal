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

  function addVec(target, vec, label, breakdown) {
    Object.entries(vec).forEach(([pid, amt]) => {
      target[pid] = (target[pid] || 0) + amt;
      if (breakdown && amt) (breakdown[pid] = breakdown[pid] || []).push({ label, amount: cents(amt) });
    });
  }

  // Money for one finalized round. `results` bundles that round's calculator
  // outputs; `events` supplies CTP/LD winners.
  function moneyForRound(model, roundId, results, events) {
    const md = model.moneyDefaults;
    const round = model.rounds.find(r => r.id === roundId);
    const ids = round.players.slice();
    const total = {}; ids.forEach(id => { total[id] = 0; });
    const breakdown = {};
    const teamPlayers = {}; (round.teams || []).forEach(t => { teamPlayers[t.name] = t.players; });

    // Primary cash game per round.
    if (roundId === 'R1') {
      if (results.bbb) addVec(total, pairwise(ids, id => results.bbb.totals[id] || 0, md.bbbNinesPerPointDiff), 'BBB', breakdown);
      if (results.nines) addVec(total, pairwise(ids, id => results.nines.totals[id] || 0, md.bbbNinesPerPointDiff), 'Nines', breakdown);
    } else if (roundId === 'R2' && results.fourBall) {
      // Nassau: settle each segment team-to-team at nassauPerPoint.
      const segs = results.fourBall.segments;
      [['front', segs.front, model.pointsConfig.R2.nassauFront], ['back', segs.back, model.pointsConfig.R2.nassauBack], ['overall', segs.overall, model.pointsConfig.R2.nassauOverall]]
        .forEach(([name, m, pts]) => {
          if (m.winnerTeam === 'halve') return;
          const winner = m.winnerTeam;
          const loser = round.teams.find(t => t.name !== winner).name;
          addVec(total, teamMatch(teamPlayers, winner, loser, pts, md.nassauPerPoint), `Nassau ${name}`, breakdown);
        });
    } else if (roundId === 'R3' && results.wolf) {
      // Wolf units are already zero-sum; value each unit.
      const vec = {}; ids.forEach(id => { vec[id] = (results.wolf.units[id] || 0) * md.wolfPerUnit; });
      addVec(total, zeroBalance(vec), 'Wolf', breakdown);
    }

    // Skins (both pots) every round, valued per skin won at the ante.
    if (results.skins) {
      addVec(total, pairwise(ids, id => results.skins.gross.won[id] || 0, md.skinsAnte), 'Skins (gross)', breakdown);
      addVec(total, pairwise(ids, id => results.skins.net.won[id] || 0, md.skinsAnte), 'Skins (net)', breakdown);
    }

    // CTP / Long Drive prizes for this round.
    (events?.ctp || []).filter(e => e.round === roundId).forEach(e => {
      addVec(total, prizePot(ids, e.player, md.ctpLd), `CTP h${e.hole}`, breakdown);
    });
    (events?.longDrive || []).filter(e => e.round === roundId).forEach(e => {
      addVec(total, prizePot(ids, e.player, md.ctpLd), `Long Drive h${e.hole}`, breakdown);
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
  function compute(model, resultsByRound, events, ptm) {
    const ids = model.players.map(p => p.id);
    const total = {}; ids.forEach(id => { total[id] = 0; });
    const rounds = {};
    model.rounds.forEach(round => {
      if (!resultsByRound[round.id]) return;
      const rm = moneyForRound(model, round.id, resultsByRound[round.id], events);
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

  return { cents, zeroBalance, pairwise, teamMatch, prizePot, moneyForRound, passTheMoneySettlement, compute };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtMoney });
}
