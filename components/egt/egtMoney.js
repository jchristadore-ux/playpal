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

  // Flat prize to a game's WINNER(S): everyone who did NOT win pays the winner
  // `perPlayer`, and the winners split the collected pot equally. So in a
  // foursome a $5 game pays the winner $15 (each of the other three pays $5); a
  // tie for first splits that pot. Zero-sum. No contest (no winner, or everyone
  // tied for first) → no money. Used for BBB, The Nines, Wolf, and the
  // individual Stableford — every "$X to the winner from each player" game.
  function flatFromEach(ids, winners, perPlayer) {
    const vec = {}; ids.forEach(id => { vec[id] = 0; });
    const w = (winners || []).filter(id => ids.includes(id));
    const losers = ids.filter(id => !w.includes(id));
    if (!w.length || !losers.length || !perPlayer) return zeroBalance(vec);
    const pot = perPlayer * losers.length;
    losers.forEach(id => { vec[id] = -perPlayer; });
    w.forEach(id => { vec[id] = pot / w.length; });
    return zeroBalance(vec);
  }

  // Flat team result: each player on the winning team collects `perPlayer` from
  // each player on the losing team (partners never pay each other). A 2v2 at $5
  // pays each winner $10 and costs each loser $10. Zero-sum. Used for the
  // four-ball (R2) and the 2v2 aggregate Stableford (R4): the winning team takes
  // a flat stake off each opponent, with no Nassau segments.
  function teamFlat(teamPlayers, winnerTeam, loserTeam, perPlayer) {
    const vec = {};
    const winners = teamPlayers[winnerTeam] || [];
    const losers = teamPlayers[loserTeam] || [];
    winners.forEach(pid => { vec[pid] = perPlayer * losers.length; });
    losers.forEach(pid => { vec[pid] = -perPlayer * winners.length; });
    return zeroBalance(vec);
  }

  // Players tied for the most of some quantity (Wolf units, Stableford points).
  function topOf(ids, valueOf) {
    const best = Math.max(...ids.map(id => valueOf(id) || 0));
    return ids.filter(id => (valueOf(id) || 0) === best);
  }

  // Fixed prize (Pass-the-Money bill + pot): the holder collects `value`, the
  // other players split the cost equally.
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

  // The whole Nassau bundle — front 1 + back 1 + overall 2 — as a single flat
  // stake to whoever WINS the match. So a "$2 Nassau" pays the winner 4 × $2 =
  // $8, flat (no per-segment split); win the 18-hole match, take it all.
  const NASSAU_UNITS = 4;

  // Settle a bundle of configured match-play matches (the individual-Nassau
  // overlay available on every round, plus R5's primary round-robin). Each match
  // is flat: the overall (18-hole) winner takes the whole Nassau bundle at the
  // match's own stake (falling back to the round's nassauPerPoint). A halved
  // match pays nothing. 2v2 sides split evenly. Zero-sum. Used on every round so
  // any wagered side match is tallied into the tournament money.
  function settleMatchPlay(total, matchPlay, val, breakdown) {
    ((matchPlay && matchPlay.matches) || []).forEach(m => {
      const stake = (m.stakes != null && m.stakes !== '') ? Number(m.stakes) : val('nassauPerPoint');
      const label = m.sides.map(s => s.map(pid => pid.slice(0, 2)).join('+')).join(' v ');
      const seg = m.overall;
      if (!seg || seg.winner === 'halve') return;
      const winners = seg.winner === 'A' ? m.sides[0] : m.sides[1];
      const losers = seg.winner === 'A' ? m.sides[1] : m.sides[0];
      const pot = NASSAU_UNITS * stake;
      const vec = {};
      winners.forEach(pid => { vec[pid] = pot / winners.length; });
      losers.forEach(pid => { vec[pid] = -pot / losers.length; });
      addVec(total, zeroBalance(vec), `Match ${label}`, breakdown);
    });
  }

  // Money for one finalized round. `results` bundles that round's calculator
  // outputs. Every game is a flat stake — no per-point / per-unit settlement,
  // no skins, no CTP / Long Drive. (`events` is accepted for signature
  // compatibility but no longer drives any money.)
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
    const otherTeam = name => (round.teams.find(t => t.name !== name) || {}).name;

    // Primary cash game per round — a flat stake to the winner(s) off each other
    // player (individual games) or off each opponent (team games).
    if (roundId === 'R1') {
      // Flat/stakes-only: BBB and The Nines each pay the winner a flat stake,
      // collected from every other player (a tie for first splits the pot).
      if (results.bbb) addVec(total, flatFromEach(ids, results.bbb.champions, val('bbbNinesWinner')), 'BBB (winner)', breakdown);
      if (results.nines) addVec(total, flatFromEach(ids, results.nines.champions, val('bbbNinesWinner')), 'Nines (winner)', breakdown);
    } else if (roundId === 'R2' && results.fourBall) {
      // Four-ball: the winning team takes a flat stake off each opponent — no
      // Nassau segments. A halved overall match pays nothing.
      const ov = results.fourBall.segments.overall;
      if (ov.winnerTeam !== 'halve') {
        addVec(total, teamFlat(teamPlayers, ov.winnerTeam, otherTeam(ov.winnerTeam), val('fourballWinner')), 'Four-ball (team)', breakdown);
      }
    } else if (roundId === 'R3' && results.wolf) {
      // Wolf: the player with the most Wolf units wins a flat stake off each
      // other player (ties split). Not per unit.
      addVec(total, flatFromEach(ids, topOf(ids, id => results.wolf.units[id] || 0), val('wolfWinner')), 'Wolf (winner)', breakdown);
    } else if (roundId === 'R4' && results.teamStableford) {
      // 2v2 aggregate Stableford: the winning team takes a flat stake off each
      // opponent — no segments.
      const ts = results.teamStableford;
      if (ts.overallWinner !== 'halve') {
        addVec(total, teamFlat(teamPlayers, ts.overallWinner, otherTeam(ts.overallWinner), val('teamStablefordWinner')), 'Stableford (team)', breakdown);
      }
    } else if (roundId === 'R5') {
      // Full-18 BBB pays the winner a flat stake off each player (same as R1);
      // the round-robin match play settles via the overlay pass below.
      if (results.bbb) addVec(total, flatFromEach(ids, results.bbb.champions, val('bbbNinesWinner')), 'BBB (winner)', breakdown);
    } else if (roundId === 'R6' && results.stableford) {
      // Championship night: the individual Stableford winner takes a flat stake
      // off each other player (ties split). The seeded singles decide Cup
      // placement but carry no separate cash.
      addVec(total, flatFromEach(ids, topOf(ids, id => results.stableford.totals[id] || 0), val('stablefordWinner')), 'Stableford (winner)', breakdown);
    }

    // Overlay individual-Nassau side matches settle on every round — their
    // stakes are set per match before play (front · back · overall). For R5 this
    // is the round's primary round-robin; elsewhere they are side bets.
    settleMatchPlay(total, results.overlayMatchPlay, val, breakdown);

    // No skins, CTP, or Long Drive money on any round — every cash game is the
    // flat primary format plus any side Nassau.

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

  return { cents, zeroBalance, flatFromEach, teamFlat, topOf, prizePot, moneyForRound, passTheMoneySettlement, compute };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtMoney });
}
