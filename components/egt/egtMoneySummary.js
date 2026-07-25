// egtMoneySummary.js — one description of the tournament's money, shared by
// every surface that shows it: the EGT Cup screen's Money tab, the SportsCenter
// broadcast, and the printable settlement board (scripts/gen-settlement.mjs).
//
// It reads an EgtEngine.liveUpdate result and reshapes it for display. No math
// of its own beyond presentation: the dollars come from EgtMoney, the results
// from the calculators. The one thing it does compute is the settle-up
// adjustment for cash already handed over (a poker buy-in already in the pot
// shouldn't be collected twice) — see `settle` below.
//
// Everything degrades: call it mid-trip with two rounds finalized and you get
// two round rows, no off-course ledger, and a golf-only bottom line.

const EgtMoneySummary = (function () {

  const cents = x => Math.round((x || 0) * 100) / 100;

  // "+$110" / "−$107" / "—". Uses a real minus sign, not a hyphen.
  function money(n, opts) {
    const v = cents(n);
    if (!v && (opts && opts.dashZero)) return '—';
    return `${v < 0 ? '−' : '+'}$${Math.abs(v).toFixed(2).replace(/\.00$/, '')}`;
  }
  const tone = n => (cents(n) > 0 ? 'up' : cents(n) < 0 ? 'down' : 'flat');

  // ── how each stake was decided ───────────────────────────────────────────
  // Plain-language lines per round, read off that round's calculator output.
  // Only what carried money — the point of these is to explain a dollar figure.
  function workLines(model, roundId, res, nameOf) {
    const r = res || {};
    const out = [];
    const list = totals => Object.keys(totals || {})
      .sort((a, b) => (totals[b] || 0) - (totals[a] || 0))
      .map(pid => `${nameOf(pid)} ${totals[pid]}`).join(' · ');
    const topOf = totals => {
      const ids = Object.keys(totals || {});
      if (!ids.length) return '';
      const best = Math.max(...ids.map(id => totals[id] || 0));
      return ids.filter(id => (totals[id] || 0) === best).map(nameOf).join(' & ');
    };
    // A match segment reads as "who, by how much" — the engine's close-out
    // labels ("4&2") are right on a scorecard but confusing beside a dollar.
    const seg = (m, s) => (!s || s.winner === 'halve' ? 'halved'
      : `${nameOf(m.sides[s.winner === 'A' ? 0 : 1][0])} by ${Math.abs(s.up)}`);
    const matchCash = m => [[m.front, 1], [m.back, 1], [m.overall, 2]].reduce((a, pair) => {
      const s = pair[0];
      return a + (!s || s.winner === 'halve' ? 0 : pair[1] * (m.stakes || 0) * (s.winner === 'A' ? 1 : -1));
    }, 0);
    const matchLine = m => {
      const a = m.sides[0][0], b = m.sides[1][0];
      const net = matchCash(m);
      const paid = !net ? 'no money' : `${nameOf(net > 0 ? a : b)} +$${Math.abs(net)}`;
      return `${nameOf(a)} v ${nameOf(b)} — front ${seg(m, m.front)} · back ${seg(m, m.back)}`
        + ` · overall ${seg(m, m.overall)} → ${paid}`;
    };
    const teamName = nm => {
      const round = model.rounds.find(x => x.id === roundId);
      const t = ((round && round.teams) || []).find(x => x.name === nm);
      return t ? t.players.map(nameOf).join(' + ') : nm;
    };

    if (r.bbb && r.bbb.ranked && r.bbb.ranked.length) {
      out.push(`Bingo Bango Bongo — ${list(r.bbb.totals)} → ${topOf(r.bbb.totals)} takes the stake from each player`);
    }
    if (r.nines && r.nines.ranked && r.nines.ranked.length) {
      out.push(`The Nines — ${list(r.nines.totals)} → ${topOf(r.nines.totals)} takes the stake from each player`);
    }
    if (r.fourBall) {
      const ov = r.fourBall.segments.overall;
      out.push(ov.winnerTeam === 'halve'
        ? 'Four-ball — all square, no money'
        : `Four-ball — ${teamName(ov.winnerTeam)} by ${Math.abs(ov.up)} → each winner collects from each opponent`);
    }
    if (r.wolf && r.wolf.units) {
      const u = r.wolf.units;
      const units = Object.keys(u).sort((a, b) => (u[b] || 0) - (u[a] || 0))
        .map(pid => `${nameOf(pid)} ${u[pid] < 0 ? '−' : '+'}${Math.abs(u[pid])}`).join(' · ');
      out.push(`Wolf units — ${units} → ${topOf(u)} takes the stake from each player`);
    }
    if (r.teamStableford) {
      const ts = r.teamStableford;
      out.push(`Stableford points — ${list(ts.playerPoints)}`);
      const names = Object.keys(ts.teamTotals);
      out.push(`Teams — ${names.map(n => `${teamName(n)} ${ts.teamTotals[n]}`).join(' v ')}`
        + ` → ${ts.overallWinner === 'halve' ? 'tied, no money' : `${teamName(ts.overallWinner)} take it`}`);
    }
    if (r.stableford && r.stableford.totals) {
      out.push(`Stableford — ${list(r.stableford.totals)} → ${topOf(r.stableford.totals)} takes the stake from each player`);
    }
    const matches = (r.overlayMatchPlay && r.overlayMatchPlay.matches) || [];
    const oneVOne = matches.filter(m => m.sides[0].length === 1 && m.sides[1].length === 1);
    if (oneVOne.length > 2) out.push('Match play, front · back · overall at each match’s stake:');
    oneVOne.forEach(m => out.push((oneVOne.length > 2 ? '   ' : '') + matchLine(m)));
    return out;
  }

  // ── the settle-up, adjusted for cash already handed over ─────────────────
  // EgtMoney nets each pairing, which is the truth of who owes whom. But a
  // buy-in already sitting in a pot has physically been paid: that cash pays
  // the pot's winners in proportion to what they won, so it comes straight off
  // what its payer still has to hand over. Without this the payer is charged
  // twice — once into the pot, once again at the bar.
  function settleUp(money) {
    const settlements = (money && money.settlements) || [];
    const extras = money && money.extras;
    const flows = [];
    // Credit each item's prepaid cash against that item's own winners only —
    // money in the poker pot pays the poker winners, not whoever fronted a
    // shared cost.
    ((extras && extras.items) || []).forEach(item => {
      const t = item.total || {};
      Object.entries(item.prepaid || {}).forEach(([payer, amt]) => {
        if (!(t[payer] < 0) || !amt) return;
        const winners = Object.keys(t).filter(id => t[id] > 0);
        const pot = winners.reduce((a, id) => a + t[id], 0);
        if (!pot) return;
        winners.forEach(w => flows.push({ from: payer, to: w, amount: (amt * t[w]) / pot }));
      });
    });
    // A credit can only reduce a bill, never reverse it: if the pot holds more
    // of someone's cash than that pairing ends up owing, the excess is money
    // owed back to them, not a negative transfer. Clamp here and report the
    // leftover as `unapplied` so the caller can say so out loud.
    const unapplied = {};
    const rows = settlements.map(s => {
      const raw = cents(flows.filter(f => f.from === s.from && f.to === s.to)
        .reduce((a, f) => a + f.amount, 0));
      const amount = cents(s.amount);
      const credit = Math.min(raw, amount);
      if (raw > credit) unapplied[s.from] = cents((unapplied[s.from] || 0) + (raw - credit));
      return { from: s.from, to: s.to, amount, credit: cents(credit), due: cents(amount - credit) };
    });
    rows.unapplied = unapplied;
    return rows;
  }

  // ── the summary ──────────────────────────────────────────────────────────
  //   build(model, live) -> {
  //     players, standings, settle, rounds, extras, golfOnly, total,
  //     netsToZero, finalized, complete, prepaidNote
  //   }
  function build(model, live) {
    const money = (live && live.money) || {};
    const nameOf = pid => ((model.playersById || {})[pid] || {}).name || pid;
    const ids = (model.players || []).map(p => p.id);
    // Which rounds settled — money.rounds is keyed by round id, plus the
    // non-round entries the engine folds in (passTheMoney, tripExtras).
    const roundIds = (model.rounds || []).map(r => r.id);
    const finalized = Object.keys(money.rounds || {}).filter(k => roundIds.includes(k));

    const totalOf = pid => cents((money.total || {})[pid]);
    const golfOf = pid => cents((money.golfOnly || money.total || {})[pid]);
    const extrasOf = pid => cents(((money.extras || {}).total || {})[pid]);

    const standings = ids.slice()
      .sort((a, b) => totalOf(b) - totalOf(a))
      .map(pid => ({
        id: pid, name: nameOf(pid),
        total: totalOf(pid), golf: golfOf(pid), extras: extrasOf(pid),
        tone: tone(totalOf(pid)),
        verdict: totalOf(pid) > 0 ? 'collects' : totalOf(pid) < 0 ? 'pays out' : 'square',
      }));

    // One row per round that actually settled, in the order they were played.
    const rounds = (model.rounds || [])
      .slice().sort((a, b) => (a.seq || 0) - (b.seq || 0))
      .filter(r => (money.rounds || {})[r.id])
      .map(r => {
        const course = (model.courses || {})[r.courseId] || {};
        const by = {}; ids.forEach(pid => { by[pid] = cents(money.rounds[r.id].total[pid]); });
        return {
          id: r.id, seq: r.seq, date: r.date, course: course.name || r.courseId,
          players: r.players || ids, by,
          work: workLines(model, r.id, (live.resultsByRound || {})[r.id], nameOf),
        };
      });

    const extras = (((money.extras || {}).items) || []).map(it => {
      const by = {}; ids.forEach(pid => { by[pid] = cents((it.total || {})[pid]); });
      return { id: it.id, label: it.label, note: it.note || null, by };
    });

    const golfOnly = {}; ids.forEach(pid => { golfOnly[pid] = golfOf(pid); });
    const total = {}; ids.forEach(pid => { total[pid] = totalOf(pid); });

    const settle = settleUp(money);
    const prepaid = ((money.extras || {}).prepaid) || {};
    const prepaidNote = Object.keys(prepaid).map(pid => {
      const owed = settle.filter(s => s.from === pid).reduce((a, s) => a + s.amount, 0);
      const due = settle.filter(s => s.from === pid).reduce((a, s) => a + s.due, 0);
      return {
        id: pid, name: nameOf(pid), amount: cents(prepaid[pid]),
        owed: cents(owed), due: cents(due),
        // Cash in the pot beyond what this player ends up owing — it comes back
        // to them rather than cancelling a bill that isn't there.
        refund: cents((settle.unapplied || {})[pid] || 0),
      };
    });

    return {
      players: ids.map(pid => ({ id: pid, name: nameOf(pid) })),
      standings, settle, rounds, extras, golfOnly, total,
      hasExtras: extras.length > 0,
      netsToZero: !!money.netsToZero,
      finalized, complete: finalized.length >= (model.rounds || []).length,
      prepaidNote,
      tripName: (model.trip || {}).name || 'EGT CUP',
    };
  }

  return { build, money, tone, settleUp, workLines, cents };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtMoneySummary });
}
