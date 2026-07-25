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

  // Record a directed head-to-head flow: `from` pays `to` `amt`. Accumulated so a
  // round/trip can be settled pairwise (each matchup on its own) instead of
  // globally netted. `pairs` is optional — helpers skip it when not tracking.
  function owe(pairs, from, to, amt) {
    if (!pairs || from === to || !amt) return;
    const k = from + '|' + to;
    pairs[k] = (pairs[k] || 0) + amt;
  }

  // Net the directed flow map into a head-to-head settlement list:
  // [{ from, to, amount }], one entry per matchup that isn't square. So a player
  // who wins one game off you but loses another still shows the net of just your
  // two-person exchanges — the way a group actually settles at the bar.
  function nettedSettlements(pairs) {
    const net = {};
    Object.entries(pairs || {}).forEach(([k, amt]) => {
      const [from, to] = k.split('|');
      const key = [from, to].sort().join('|');
      const [lo] = key.split('|');
      net[key] = (net[key] || 0) + (from === lo ? amt : -amt);
    });
    const out = [];
    Object.entries(net).forEach(([key, amt]) => {
      const [lo, hi] = key.split('|');
      const a = cents(amt);
      if (a > 0.005) out.push({ from: lo, to: hi, amount: a });
      else if (a < -0.005) out.push({ from: hi, to: lo, amount: cents(-a) });
    });
    return out;
  }

  // Flat prize to a game's WINNER(S): everyone who did NOT win pays the winner
  // `perPlayer`, and the winners split the collected pot equally. So in a
  // foursome a $5 game pays the winner $15 (each of the other three pays $5); a
  // tie for first splits that pot. Zero-sum. No contest (no winner, or everyone
  // tied for first) → no money. Used for BBB, The Nines, Wolf, and the
  // individual Stableford — every "$X to the winner from each player" game.
  // `pairs` (optional) collects the head-to-head flows.
  function flatFromEach(ids, winners, perPlayer, pairs) {
    const vec = {}; ids.forEach(id => { vec[id] = 0; });
    const w = (winners || []).filter(id => ids.includes(id));
    const losers = ids.filter(id => !w.includes(id));
    if (!w.length || !losers.length || !perPlayer) return zeroBalance(vec);
    const pot = perPlayer * losers.length;
    losers.forEach(id => { vec[id] = -perPlayer; });
    w.forEach(id => { vec[id] = pot / w.length; });
    losers.forEach(l => w.forEach(x => owe(pairs, l, x, perPlayer / w.length)));
    return zeroBalance(vec);
  }

  // Flat team result: each player on the winning team collects `perPlayer` from
  // each player on the losing team (partners never pay each other). A 2v2 at $5
  // pays each winner $10 and costs each loser $10. Zero-sum. Used for the
  // four-ball (R2) and the 2v2 aggregate Stableford (R4): the winning team takes
  // a flat stake off each opponent, with no Nassau segments.
  function teamFlat(teamPlayers, winnerTeam, loserTeam, perPlayer, pairs) {
    const vec = {};
    const winners = teamPlayers[winnerTeam] || [];
    const losers = teamPlayers[loserTeam] || [];
    winners.forEach(pid => { vec[pid] = perPlayer * losers.length; });
    losers.forEach(pid => { vec[pid] = -perPlayer * winners.length; });
    losers.forEach(l => winners.forEach(x => owe(pairs, l, x, perPlayer)));
    return zeroBalance(vec);
  }

  // Players tied for the most of some quantity (Wolf units, Stableford points).
  function topOf(ids, valueOf) {
    const best = Math.max(...ids.map(id => valueOf(id) || 0));
    return ids.filter(id => (valueOf(id) || 0) === best);
  }

  // Fixed prize (Pass-the-Money bill + pot): the holder collects `value`, the
  // other players split the cost equally. `pairs` (optional) collects flows.
  function prizePot(ids, winner, value, pairs) {
    const vec = {}; ids.forEach(id => { vec[id] = 0; });
    if (!winner || !ids.includes(winner)) return vec;
    const others = ids.filter(id => id !== winner);
    vec[winner] = value;
    others.forEach(id => { vec[id] = -value / others.length; });
    others.forEach(id => owe(pairs, id, winner, value / others.length));
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
  // (falling back to the round's nassauPerPoint). So a "$2 Nassau" is $2 front /
  // $2 back / $4 overall, settled per segment; a halved segment pays nothing.
  // 2v2 sides split evenly. Zero-sum per segment. Used on every round so any
  // wagered side match is tallied into the tournament money.
  function settleMatchPlay(total, matchPlay, val, breakdown, pairs) {
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
        const share = (units * stake) / (winners.length * losers.length);
        losers.forEach(l => winners.forEach(x => owe(pairs, l, x, share)));
      });
    });
  }

  // Money for one finalized round. `results` bundles that round's calculator
  // outputs. Every game is a flat stake — no per-point / per-unit settlement,
  // no skins, no CTP / Long Drive. (`events` is accepted for signature
  // compatibility but no longer drives any money.)
  // Baseline flat stakes, so money never goes NaN even if a persisted model
  // predates a defaults key (e.g. an old install rehydrated without a fresh seed
  // import, so `model.moneyDefaults` lacks fourballWinner/wolfWinner/etc.).
  const FLAT_STAKE_FALLBACK = {
    nassauPerPoint: 5, bbbNinesWinner: 5, fourballWinner: 5,
    wolfWinner: 5, teamStablefordWinner: 5, stablefordWinner: 5, ptmBill: 5,
  };

  function moneyForRound(model, roundId, results, events, stakes) {
    const md = model.moneyDefaults || {};
    // Per-round stake overrides (set on the Rounds tab); fall back to the model
    // defaults, then to the baseline so a missing key can't produce NaN/$0.
    const S = (stakes && stakes[roundId]) || {};
    const val = k => {
      const o = S[k];
      if (o != null && o !== '') return Number(o);
      return md[k] != null ? md[k] : FLAT_STAKE_FALLBACK[k];
    };
    const round = model.rounds.find(r => r.id === roundId);
    const ids = round.players.slice();
    const total = {}; ids.forEach(id => { total[id] = 0; });
    const breakdown = {};
    const pairs = {}; // directed head-to-head flows, for the pairwise settlement
    const teamPlayers = {}; (round.teams || []).forEach(t => { teamPlayers[t.name] = t.players; });
    const otherTeam = name => (round.teams.find(t => t.name !== name) || {}).name;

    // Primary cash game per round — a flat stake to the winner(s) off each other
    // player (individual games) or off each opponent (team games).
    if (roundId === 'R1') {
      // Flat/stakes-only: BBB and The Nines each pay the winner a flat stake,
      // collected from every other player (a tie for first splits the pot).
      if (results.bbb) addVec(total, flatFromEach(ids, results.bbb.champions, val('bbbNinesWinner'), pairs), 'BBB (winner)', breakdown);
      if (results.nines) addVec(total, flatFromEach(ids, results.nines.champions, val('bbbNinesWinner'), pairs), 'Nines (winner)', breakdown);
    } else if (roundId === 'R2' && results.fourBall) {
      // Four-ball: the winning team takes a flat stake off each opponent — no
      // Nassau segments. A halved overall match pays nothing.
      const ov = results.fourBall.segments.overall;
      if (ov.winnerTeam !== 'halve') {
        addVec(total, teamFlat(teamPlayers, ov.winnerTeam, otherTeam(ov.winnerTeam), val('fourballWinner'), pairs), 'Four-ball (team)', breakdown);
      }
    } else if (roundId === 'R3' && results.wolf) {
      // Wolf: the player with the most Wolf units wins a flat stake off each
      // other player (ties split). Not per unit.
      addVec(total, flatFromEach(ids, topOf(ids, id => results.wolf.units[id] || 0), val('wolfWinner'), pairs), 'Wolf (winner)', breakdown);
    } else if (roundId === 'R4' && results.teamStableford) {
      // 2v2 aggregate Stableford: the winning team takes a flat stake off each
      // opponent — no segments.
      const ts = results.teamStableford;
      if (ts.overallWinner !== 'halve') {
        addVec(total, teamFlat(teamPlayers, ts.overallWinner, otherTeam(ts.overallWinner), val('teamStablefordWinner'), pairs), 'Stableford (team)', breakdown);
      }
    } else if (roundId === 'R5') {
      // Full-18 BBB pays the winner a flat stake off each player (same as R1);
      // the round-robin match play settles via the overlay pass below.
      if (results.bbb) addVec(total, flatFromEach(ids, results.bbb.champions, val('bbbNinesWinner'), pairs), 'BBB (winner)', breakdown);
    } else if (roundId === 'R6' && results.stableford) {
      // Championship night: the individual Stableford winner takes a flat stake
      // off each other player (ties split). The seeded singles decide Cup
      // placement but carry no separate cash.
      addVec(total, flatFromEach(ids, topOf(ids, id => results.stableford.totals[id] || 0), val('stablefordWinner'), pairs), 'Stableford (winner)', breakdown);
    }

    // Overlay individual-Nassau side matches settle on every round — their
    // stakes are set per match before play (front · back · overall). For R5 this
    // is the round's primary round-robin; elsewhere they are side bets.
    settleMatchPlay(total, results.overlayMatchPlay, val, breakdown, pairs);

    // No skins, CTP, or Long Drive money on any round — every cash game is the
    // flat primary format plus any side Nassau.

    zeroBalance(total);
    return { roundId, total, breakdown, pairs, settlements: nettedSettlements(pairs),
      netsToZero: Math.abs(Object.values(total).reduce((a, b) => a + b, 0)) < 1e-6 };
  }

  // ── Off-course money (model.tripExtras) ──────────────────────────────────
  // Shared trip costs and the poker game settle with the golf, so the running
  // bankroll is what someone actually owes at the end of the week rather than
  // just the on-course wagers. Two item shapes:
  //
  //   collect — one player fronted a cost: { paidBy, from: [ids] } plus either
  //             `perPlayer` (what each listed player owes) or `total` (the whole
  //             bill, split equally across everyone who shared it — the payer
  //             included, so he carries his own share and collects the rest).
  //             A $85 dinner for four is `total: 85` → $21.25 each.
  //   pot     — a pool: { buyIns: {id: $}, payouts: {id: $} }. Net is payout
  //             minus buy-in, so it is zero-sum whenever the payouts add up to
  //             the buy-ins (the poker pot does: $120 in, $84 + $36 out).
  //
  // `alreadyInPot` records cash a player has physically handed over. It does not
  // move the P&L — the buy-in is already counted — but the settle-up needs it,
  // so it is returned as `prepaid` for the settlement view to credit.
  function tripExtrasSettlement(model, extras) {
    const ids = model.players.map(p => p.id);
    const total = {}; ids.forEach(id => { total[id] = 0; });
    const pairs = {};
    const prepaid = {};
    const items = [];
    ((extras && extras.items) || []).forEach(item => {
      const vec = {}; ids.forEach(id => { vec[id] = 0; });
      if (item.type === 'collect') {
        const payers = (item.from || []).filter(id => ids.includes(id));
        // `total` states the real bill and splits it evenly over everyone who
        // shared it (payers + the one who fronted it); `perPlayer` states the
        // share directly. Whichever the item carries.
        const per = Number(item.perPlayer)
          || (payers.length ? (Number(item.total) || 0) / (payers.length + 1) : 0);
        if (!ids.includes(item.paidBy) || !payers.length || !per) return;
        payers.forEach(id => { vec[id] -= per; vec[item.paidBy] += per; });
        payers.forEach(id => owe(pairs, id, item.paidBy, per));
      } else if (item.type === 'pot') {
        const buyIns = item.buyIns || {}, payouts = item.payouts || {};
        ids.forEach(id => { vec[id] += (Number(payouts[id]) || 0) - (Number(buyIns[id]) || 0); });
        // Head-to-head: split each net loser's stake across the net winners in
        // proportion to what they won, so the pot settles pairwise like the
        // rest of the ledger instead of needing a banker.
        const losers = ids.filter(id => vec[id] < 0);
        const winners = ids.filter(id => vec[id] > 0);
        const won = winners.reduce((a, id) => a + vec[id], 0);
        if (won > 0) losers.forEach(l => winners.forEach(x => owe(pairs, l, x, -vec[l] * (vec[x] / won))));
        Object.entries(item.alreadyInPot || {}).forEach(([id, amt]) => {
          if (ids.includes(id)) prepaid[id] = (prepaid[id] || 0) + (Number(amt) || 0);
        });
      } else return;
      zeroBalance(vec);
      // Carry each item's own prepaid map on the item — a settle-up has to know
      // WHICH pot the cash is sitting in to credit it against the right winners.
      const itemPrepaid = {};
      Object.entries(item.alreadyInPot || {}).forEach(([id, amt]) => {
        if (ids.includes(id)) itemPrepaid[id] = Number(amt) || 0;
      });
      items.push({ id: item.id, label: item.label, note: item.note || null, total: vec,
        prepaid: Object.keys(itemPrepaid).length ? itemPrepaid : null });
      Object.entries(vec).forEach(([pid, amt]) => { total[pid] += amt; });
    });
    zeroBalance(total);
    return { total, pairs, items, prepaid,
      netsToZero: Math.abs(Object.values(total).reduce((a, b) => a + b, 0)) < 1e-6 };
  }

  // Final Pass-the-Money settlement: the ending holder collects bill + pot from
  // the field, split equally. Zero-sum across all four.
  function passTheMoneySettlement(model, ptm) {
    const ids = model.players.map(p => p.id);
    const value = (ptm.bill || 0) + (ptm.potTotal || 0);
    const pairs = {};
    const total = prizePot(ids, ptm.finalHolder, value, pairs);
    return { total, pairs, value, holder: ptm.finalHolder };
  }

  // Whole-tournament money: sum finalized rounds + PTM settlement. `settlements`
  // is the head-to-head "who owes whom" list, netted per matchup (not globally
  // minimized) so it mirrors how the group settles at the bar.
  //   stakes: optional { [roundId]: { [key]: number } } overrides (Rounds tab).
  //   opts.extras: fold in the off-course ledger (final settlement only, so the
  //     running bankroll stays golf-only until the trip closes out).
  function compute(model, resultsByRound, events, ptm, stakes, opts) {
    const ids = model.players.map(p => p.id);
    const total = {}; ids.forEach(id => { total[id] = 0; });
    const rounds = {};
    const pairs = {};
    const addPairs = src => Object.entries(src || {}).forEach(([k, amt]) => { pairs[k] = (pairs[k] || 0) + amt; });
    model.rounds.forEach(round => {
      if (!resultsByRound[round.id]) return;
      const rm = moneyForRound(model, round.id, resultsByRound[round.id], events, stakes);
      rounds[round.id] = rm;
      Object.entries(rm.total).forEach(([pid, amt]) => { total[pid] = (total[pid] || 0) + amt; });
      addPairs(rm.pairs);
    });
    if (ptm && ptm.finalHolder) {
      const s = passTheMoneySettlement(model, ptm);
      rounds.passTheMoney = s;
      Object.entries(s.total).forEach(([pid, amt]) => { total[pid] = (total[pid] || 0) + amt; });
      addPairs(s.pairs);
    }
    // Off-course money (shared costs + poker) rides on the same ledger, so the
    // bankroll is the real bottom line rather than the on-course wagers alone.
    const golfOnly = {}; Object.entries(total).forEach(([pid, amt]) => { golfOnly[pid] = cents(amt); });
    let extras = null;
    if (model.tripExtras && opts && opts.extras) {
      extras = tripExtrasSettlement(model, model.tripExtras);
      rounds.tripExtras = extras;
      Object.entries(extras.total).forEach(([pid, amt]) => { total[pid] = (total[pid] || 0) + amt; });
      addPairs(extras.pairs);
    }
    zeroBalance(total);
    return { rounds, total, golfOnly, extras, pairs, settlements: nettedSettlements(pairs),
      netsToZero: Math.abs(Object.values(total).reduce((a, b) => a + b, 0)) < 1e-6 };
  }

  return { cents, zeroBalance, flatFromEach, teamFlat, topOf, prizePot, nettedSettlements, moneyForRound, tripExtrasSettlement, passTheMoneySettlement, compute };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtMoney });
}
