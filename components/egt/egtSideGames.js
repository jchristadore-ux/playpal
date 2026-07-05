// egtSideGames.js — Pass the Money ("The Rock") ledger, CTP, Long Drive, and the
// per-round tracked-stat rollups that feed the season awards. Everything is
// derived from stored hole scores + a few event inputs, so it re-runs cleanly.

const EgtSideGames = (function () {
  const H = (typeof window !== 'undefined' && window.EgtHandicap) || EgtHandicap;

  function parOf(course, hole) {
    const h = (course.holes || []).find(x => x.hole === hole);
    return h ? h.par : null;
  }

  // ── Pass the Money — The Rock ─────────────────────────────────────────────
  // A $20 bill starts with John at R2 h1. A NET birdie transfers it to that
  // scorer; every 3-putt by anyone adds $1 to a side pot. Final holder after
  // R6 h18 keeps bill + pot. We walk rounds in seq order, holes 1..18.
  //   net basis: the game whose pops define "net" (default skinsNet — it exists
  //   every round). Ledger rows: { round, hole, from, to, reason, potTotal }.
  function passTheMoney(model, roundScores, opts) {
    const o = opts || {};
    const cfg = model.sideGames.passTheMoney;
    const netGame = o.netGame || 'skinsNet';
    const rounds = model.rounds.filter(r => r.seq >= 2).sort((a, b) => a.seq - b.seq);
    let holder = cfg.startHolder;      // 'john'
    let pot = 0;
    const ledger = [];
    rounds.forEach(round => {
      const course = model.courses[round.courseId];
      const alloc = model.derived[round.id].allocations;
      const scores = roundScores?.[round.id] || {};
      for (let hole = 1; hole <= 18; hole++) {
        // 3-putts add to the pot first (a putt total of 3+ counts once).
        round.players.forEach(pid => {
          const s = scores[pid]?.[hole];
          if (s && s.putts >= 3) { pot += 1; ledger.push({ round: round.id, hole, from: null, to: null, reason: `${pid} 3-putt`, potTotal: pot }); }
        });
        // Net-birdie transfer: best (lowest) net under par takes the rock.
        const par = parOf(course, hole);
        let best = null;
        round.players.forEach(pid => {
          const s = scores[pid]?.[hole];
          if (!s || s.gross == null || par == null) return;
          const popsOn = H.popsOnHole(alloc[pid]?.games?.[netGame]?.holes || [], hole);
          const n = s.gross - popsOn;
          if (n < par && (best == null || n < best.net)) best = { pid, net: n };
        });
        if (best && best.pid !== holder) {
          ledger.push({ round: round.id, hole, from: holder, to: best.pid, reason: 'net birdie', potTotal: pot });
          holder = best.pid;
        }
      }
    });
    return { startHolder: cfg.startHolder, finalHolder: holder, potTotal: pot, bill: model.moneyDefaults.ptmBill, ledger };
  }

  // ── CTP / Long Drive — event-driven records ──────────────────────────────
  //   ctpEvents: [{ round, hole, player }]  longDriveEvents: [{ round, hole, player }]
  function closestToPin(model, ctpEvents) {
    const value = model.sideGames.closestToPin.value;
    return (ctpEvents || []).map(e => ({ ...e, value }));
  }
  function longDrive(model, ldEvents) {
    const value = model.sideGames.longDrive.value;
    return (ldEvents || []).map(e => ({ ...e, value }));
  }

  // ── Tracked stats per player per round ───────────────────────────────────
  // Reads HoleScore fields (putts, fir, gir, sand) and derives scoring stats
  // (gross/net birdies, pars) from gross vs par + net pops. netBirdies use the
  // round's off-low skinsNet pops by default.
  function trackedStats(model, roundId, scores, opts) {
    const o = opts || {};
    const round = model.rounds.find(r => r.id === roundId);
    const course = model.courses[round.courseId];
    const alloc = model.derived[roundId].allocations;
    const netGame = o.netGame || 'skinsNet';
    const out = {};
    round.players.forEach(pid => {
      const st = { putts: 0, fairwaysHit: 0, greensInReg: 0, grossBirdies: 0, netBirdies: 0, pars: 0, sandSaves: 0, holesEntered: 0 };
      for (let hole = 1; hole <= 18; hole++) {
        const s = scores?.[pid]?.[hole];
        if (!s || s.gross == null) continue;
        st.holesEntered++;
        const par = parOf(course, hole);
        if (typeof s.putts === 'number') st.putts += s.putts;
        if (s.fir) st.fairwaysHit++;
        if (s.gir) st.greensInReg++;
        if (s.sand) st.sandSaves++;
        if (par != null) {
          if (s.gross - par === -1) st.grossBirdies++;
          else if (s.gross - par <= -2) st.grossBirdies++; // eagles count as birdies-or-better here
          if (s.gross === par) st.pars++;
          const popsOn = H.popsOnHole(alloc[pid]?.games?.[netGame]?.holes || [], hole);
          if (s.gross - popsOn - par <= -1) st.netBirdies++;
        }
      }
      out[pid] = st;
    });
    return out;
  }

  // Season-wide stat rollup across every finalized round (for season awards).
  function seasonStats(model, allRoundScores, opts) {
    const totals = {};
    model.players.forEach(p => { totals[p.id] = { putts: 0, fairwaysHit: 0, greensInReg: 0, grossBirdies: 0, netBirdies: 0, pars: 0, sandSaves: 0, rounds: 0 }; });
    model.rounds.forEach(round => {
      const scores = allRoundScores?.[round.id];
      if (!scores) return;
      const st = trackedStats(model, round.id, scores, opts);
      Object.entries(st).forEach(([pid, s]) => {
        if (!totals[pid]) return;
        if (s.holesEntered > 0) totals[pid].rounds++;
        ['putts', 'fairwaysHit', 'greensInReg', 'grossBirdies', 'netBirdies', 'pars', 'sandSaves'].forEach(k => { totals[pid][k] += s[k]; });
      });
    });
    return totals;
  }

  return { passTheMoney, closestToPin, longDrive, trackedStats, seasonStats };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtSideGames });
}
