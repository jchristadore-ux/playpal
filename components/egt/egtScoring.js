// egtScoring.js — the nine EGT scoring calculators. Every function is pure:
// it takes a round context (course, players, teams, live-derived allocations,
// entered hole scores, and any play-order events) and returns a structured
// result that the points/money/printable engines consume. Pops are always read
// from the live allocations (EgtImporter.recomputeAll), so a course whose SI is
// still pending yields net === gross and a `pending: true` flag — no calculator
// branches on SI verification.

const EgtScoring = (function () {
  const H = (typeof window !== 'undefined' && window.EgtHandicap) || EgtHandicap;

  // ── shared helpers ───────────────────────────────────────────────────────
  // Pops a player receives on a hole for a given game (0 when pending/none).
  function pops(alloc, pid, game, hole) {
    const g = alloc?.[pid]?.games?.[game];
    if (!g || g.holes == null) return 0;
    return H.popsOnHole(g.holes, hole);
  }
  function isPending(alloc, pid, game) {
    return !!alloc?.[pid]?.games?.[game]?.pending;
  }
  function gross(scores, pid, hole) {
    const s = scores?.[pid]?.[hole];
    return s && (s.gross || s.gross === 0) ? s.gross : null;
  }
  function net(scores, alloc, pid, hole, game) {
    const g = gross(scores, pid, hole);
    if (g == null) return null;
    return g - pops(alloc, pid, game, hole);
  }
  function parOf(course, hole) {
    const h = (course.holes || []).find(x => x.hole === hole);
    return h ? h.par : null;
  }
  function holesRange(a, b) {
    const out = []; for (let h = a; h <= b; h++) out.push(h); return out;
  }

  // ── 1. Bingo Bango Bongo (R1 loop 1, gross) ──────────────────────────────
  // Three points a hole, one each: bingo (first on green), bango (closest once
  // all are on), bongo (first in the hole). Strict order of play — supplied as
  // events, since none of that is derivable from a gross number.
  //   events: [{ hole, bingo, bango, bongo }]  (each value a player id or null)
  function bingoBangoBongo(ctx) {
    const { players } = ctx;
    const events = ctx.events?.bbb || [];
    const totals = {}; players.forEach(p => { totals[p.id] = 0; });
    const perHole = [];
    events.forEach(e => {
      const awards = [];
      ['bingo', 'bango', 'bongo'].forEach(k => {
        if (e[k] && totals[e[k]] !== undefined) { totals[e[k]] += 1; awards.push({ type: k, player: e[k] }); }
      });
      perHole.push({ hole: e.hole, awards });
    });
    const ranked = players.map(p => ({ player: p.id, points: totals[p.id] }))
      .sort((a, b) => b.points - a.points);
    const top = ranked.length ? ranked[0].points : 0;
    const champions = ranked.filter(r => r.points === top).map(r => r.player);
    return { game: 'bingoBangoBongo', scoring: 'gross', totals, perHole, ranked, champions };
  }

  // ── 2. The Nines (R1 loop 2, net) ────────────────────────────────────────
  // 9 points per hole split among 3 players by net score: 5/3/1. Ties split the
  // shared pool evenly (so 4-4-1, 5-2-2, 3-3-3). Loop 2 = holes 10..18.
  function nines(ctx) {
    const { players, scores, alloc, course } = ctx;
    const cfg = ctx.config?.loop2 || { pointsPerHole: 9, split: [5, 3, 1] };
    const loopHoles = holesRange(10, 18);
    const totals = {}; players.forEach(p => { totals[p.id] = 0; });
    const perHole = [];
    let pending = false;
    loopHoles.forEach(hole => {
      const nets = players.map(p => {
        if (isPending(alloc, p.id, 'nines')) pending = true;
        return { player: p.id, net: net(scores, alloc, p.id, hole, 'nines') };
      });
      if (nets.some(n => n.net == null)) { perHole.push({ hole, points: {}, incomplete: true }); return; }
      // Distribute the pool by ties: group by net, share the summed slot points.
      const sorted = nets.slice().sort((a, b) => a.net - b.net);
      const slots = cfg.split.slice(); // [5,3,1]
      const points = {};
      let idx = 0;
      while (idx < sorted.length) {
        let j = idx; while (j + 1 < sorted.length && sorted[j + 1].net === sorted[idx].net) j++;
        const groupSize = j - idx + 1;
        const poolSlots = slots.slice(idx, idx + groupSize);
        const share = poolSlots.reduce((a, b) => a + b, 0) / groupSize;
        for (let k = idx; k <= j; k++) { points[sorted[k].player] = share; totals[sorted[k].player] += share; }
        idx = j + 1;
      }
      perHole.push({ hole, points });
    });
    const ranked = players.map(p => ({ player: p.id, points: totals[p.id] }))
      .sort((a, b) => b.points - a.points);
    const top = ranked.length ? ranked[0].points : 0;
    const champions = ranked.filter(r => r.points === top).map(r => r.player);
    return { game: 'nines', scoring: 'net', totals, perHole, ranked, champions, pending };
  }

  // ── match-play engine (shared by four-ball, wolf, singles, alt-shot) ──────
  // sideA/sideB: { name, ballNet(hole) -> number|null }. Returns status string
  // and winner from A's perspective.
  function playMatch(holes, sideA, sideB) {
    let up = 0; // + => A ahead
    const perHole = [];
    let decidedAt = null;
    holes.forEach((hole, i) => {
      const a = sideA.ballNet(hole), b = sideB.ballNet(hole);
      let res = 0;
      if (a != null && b != null) { if (a < b) res = 1; else if (b < a) res = -1; }
      up += res;
      perHole.push({ hole, a, b, winner: res > 0 ? 'A' : res < 0 ? 'B' : 'halve', up });
      const remaining = holes.length - (i + 1);
      if (decidedAt == null && Math.abs(up) > remaining) decidedAt = hole;
    });
    const winner = up > 0 ? 'A' : up < 0 ? 'B' : 'halve';
    const absUp = Math.abs(up);
    let label;
    if (winner === 'halve') label = 'AS';
    else {
      // closed-out margin like "3&2" if decided early, else "N up"
      const closeIdx = perHole.findIndex(p => p.hole === decidedAt);
      const holesLeft = decidedAt != null ? holes.length - 1 - closeIdx : 0;
      label = decidedAt != null && holesLeft > 0 ? `${absUp}&${holesLeft}` : `${absUp} up`;
    }
    return { winner, up, label, perHole, decidedAt };
  }

  // ── 3. Four-ball best-ball match play + Nassau (R2) ──────────────────────
  function fourBallMatch(ctx) {
    const { scores, alloc, teams } = ctx;
    const t1 = teams[0], t2 = teams[1];
    const game = 'fourBallMatch';
    const teamBall = team => hole => {
      const nets = team.players.map(pid => net(scores, alloc, pid, hole, game)).filter(n => n != null);
      return nets.length ? Math.min(...nets) : null;
    };
    const sideA = { name: t1.name, ballNet: teamBall(t1) };
    const sideB = { name: t2.name, ballNet: teamBall(t2) };
    const nassau = ctx.config?.nassau || { front: 1, back: 1, overall: 2 };
    const front = playMatch(holesRange(1, 9), sideA, sideB);
    const back = playMatch(holesRange(10, 18), sideA, sideB);
    const overall = playMatch(holesRange(1, 18), sideA, sideB);
    const segWinner = m => m.winner === 'A' ? t1.name : m.winner === 'B' ? t2.name : 'halve';
    return {
      game, teams: [t1, t2], nassau,
      segments: {
        front: { ...front, winnerTeam: segWinner(front) },
        back: { ...back, winnerTeam: segWinner(back) },
        overall: { ...overall, winnerTeam: segWinner(overall) },
      },
      pending: t1.players.concat(t2.players).some(pid => isPending(alloc, pid, game)),
    };
  }

  // ── 4. Wolf (R3) ─────────────────────────────────────────────────────────
  // Rotation drives who is Wolf each hole; the Wolf either partners the 1st
  // player who tees after (pack 2v2, ±1/opponent), goes it alone after seeing
  // tee shots (lone, ±2/opponent), or declares blind before anyone tees
  // (blind, ±3/opponent). Best net ball per side. Ties push. Holes 17-18 the
  // Wolf is assigned by units standing. Selections are events (a choice, not a
  // score): [{ hole, wolf, mode:'pair'|'lone'|'blind', partner }].
  function wolf(ctx) {
    const { players, scores, alloc, config } = ctx;
    const game = 'wolf';
    const units = config?.units || { pack2v2: 1, loneWolf: 2, blindWolf: 3 };
    const events = ctx.events?.wolf || [];
    const running = {}; players.forEach(p => { running[p.id] = 0; });
    const perHole = [];
    const ids = players.map(p => p.id);
    events.forEach(e => {
      const hole = e.hole;
      const wolfId = e.wolf;
      const partnerId = e.mode === 'pair' ? e.partner : null;
      const wolfSide = [wolfId, ...(partnerId ? [partnerId] : [])];
      const oppSide = ids.filter(id => !wolfSide.includes(id));
      const unit = e.mode === 'lone' ? units.loneWolf : e.mode === 'blind' ? units.blindWolf : units.pack2v2;
      const bestNet = side => {
        const nets = side.map(pid => net(scores, alloc, pid, hole, game)).filter(n => n != null);
        return nets.length ? Math.min(...nets) : null;
      };
      const wNet = bestNet(wolfSide), oNet = bestNet(oppSide);
      let outcome = 'push', delta = {};
      if (wNet != null && oNet != null && wNet !== oNet) {
        const wolfWins = wNet < oNet;
        // ±unit per opponent. Pack: 2 wolf players share the swing vs 2 opps;
        // lone/blind: 1 wolf player vs 3 opps.
        const nOpp = oppSide.length;
        players.forEach(p => { delta[p.id] = 0; });
        if (wolfWins) {
          wolfSide.forEach(pid => { delta[pid] += unit * nOpp / wolfSide.length; });
          oppSide.forEach(pid => { delta[pid] -= unit; });
          outcome = 'wolf';
        } else {
          wolfSide.forEach(pid => { delta[pid] -= unit * nOpp / wolfSide.length; });
          oppSide.forEach(pid => { delta[pid] += unit; });
          outcome = 'opponents';
        }
        players.forEach(p => { running[p.id] += (delta[p.id] || 0); });
      }
      perHole.push({ hole, wolf: wolfId, mode: e.mode, partner: partnerId, wNet, oNet, outcome, delta });
    });
    const ranked = players.map(p => ({ player: p.id, units: running[p.id] }))
      .sort((a, b) => b.units - a.units);
    return { game, units: running, perHole, ranked, pending: ids.some(id => isPending(alloc, id, game)) };
  }

  // Stableford points for a net score vs par (net-eagle 4 … net-double+ 0).
  function stablefordPoints(netToPar, tbl) {
    const t = tbl || { netEagle: 4, netBirdie: 3, netPar: 2, netBogey: 1, netDoubleOrWorse: 0 };
    if (netToPar <= -2) return t.netEagle;
    if (netToPar === -1) return t.netBirdie;
    if (netToPar === 0) return t.netPar;
    if (netToPar === 1) return t.netBogey;
    return t.netDoubleOrWorse;
  }

  // ── 5. Team (2v2) aggregate net Stableford (R4) ──────────────────────────
  // Both partners' net Stableford points count each hole. Segment matches on
  // 1-6 / 7-12 / 13-18 plus the 18-hole total. Pick up at net double bogey.
  function teamStableford(ctx) {
    const { scores, alloc, teams, course } = ctx;
    const game = 'teamStableford';
    const cfg = ctx.config || {};
    const segs = cfg.segments || [[1, 6], [7, 12], [13, 18]];
    const perHole = [];
    const teamTotals = { [teams[0].name]: 0, [teams[1].name]: 0 };
    const playerPoints = {}; teams.forEach(t => t.players.forEach(pid => { playerPoints[pid] = 0; }));
    let pending = false;
    holesRange(1, 18).forEach(hole => {
      const par = parOf(course, hole);
      const row = { hole, par, byPlayer: {}, byTeam: {} };
      teams.forEach(t => {
        let teamPts = 0;
        t.players.forEach(pid => {
          if (isPending(alloc, pid, game)) pending = true;
          const n = net(scores, alloc, pid, hole, game);
          const pts = n == null ? null : stablefordPoints(n - par, cfg.stablefordPoints);
          row.byPlayer[pid] = pts;
          if (pts != null) { teamPts += pts; playerPoints[pid] += pts; }
        });
        row.byTeam[t.name] = teamPts;
        teamTotals[t.name] += teamPts;
      });
      perHole.push(row);
    });
    const segmentResults = segs.map(([a, b]) => {
      const sum = name => perHole.filter(r => r.hole >= a && r.hole <= b)
        .reduce((acc, r) => acc + (r.byTeam[name] || 0), 0);
      const s1 = sum(teams[0].name), s2 = sum(teams[1].name);
      return { range: [a, b], [teams[0].name]: s1, [teams[1].name]: s2,
        winner: s1 > s2 ? teams[0].name : s2 > s1 ? teams[1].name : 'halve' };
    });
    const overallWinner = teamTotals[teams[0].name] > teamTotals[teams[1].name] ? teams[0].name
      : teamTotals[teams[1].name] > teamTotals[teams[0].name] ? teams[1].name : 'halve';
    return { game, teams, perHole, teamTotals, playerPoints, segments: segmentResults, overallWinner, pending };
  }

  // ── individual net Stableford (R6) ───────────────────────────────────────
  function individualStableford(ctx) {
    const { players, scores, alloc, course } = ctx;
    const game = 'stableford';
    const cfg = ctx.config?.stableford || {};
    const totals = {}; players.forEach(p => { totals[p.id] = 0; });
    const perHole = [];
    let pending = false;
    holesRange(1, 18).forEach(hole => {
      const par = parOf(course, hole);
      const row = { hole, par, points: {} };
      players.forEach(p => {
        if (isPending(alloc, p.id, game)) pending = true;
        const n = net(scores, alloc, p.id, hole, game);
        const pts = n == null ? null : stablefordPoints(n - par, cfg.stablefordPoints);
        row.points[p.id] = pts;
        if (pts != null) totals[p.id] += pts;
      });
      perHole.push(row);
    });
    const ranked = players.map(p => ({ player: p.id, points: totals[p.id] }))
      .sort((a, b) => b.points - a.points);
    return { game, totals, perHole, ranked, pending };
  }

  // ── 6. Configured match play (R5) ────────────────────────────────────────
  // The matches are chosen before the round (any mix of 1v1 and 2v2, any
  // players — set on the EGT Rounds tab via the Nassau match config). Each
  // match plays best net ball per side and settles Nassau-style (front 9 /
  // back 9 / overall). Pops per match come pre-resolved as popFlags
  // ({pid: bool[18]}, manual config or CH-difference off the low — see
  // EgtHandicap.matchPopFlags). Standings points go to the best overall
  // match record. No matches configured → no results, no champion.
  //   ctx.matches: [{ id, matchType, playersInMatch, teams, popFlags, stakes }]
  function matchPlay(ctx) {
    const { players, scores } = ctx;
    const configured = ctx.matches || [];
    const ids = players.map(p => p.id);
    const record = {}; ids.forEach(id => { record[id] = { w: 0, l: 0, h: 0 }; });
    const matches = [];
    configured.forEach(m => {
      const sides = m.matchType === '2v2' && m.teams
        ? [m.teams.team1 || [], m.teams.team2 || []]
        : [[m.playersInMatch?.[0]].filter(Boolean), [m.playersInMatch?.[1]].filter(Boolean)];
      if (!sides[0].length || !sides[1].length) return; // incomplete config
      const popFlags = m.popFlags || {};
      const netOf = (pid, hole) => {
        const g = gross(scores, pid, hole);
        if (g == null) return null;
        return g - (popFlags[pid]?.[hole - 1] ? 1 : 0);
      };
      const ballNet = side => hole => {
        const nets = side.map(pid => netOf(pid, hole)).filter(n => n != null);
        return nets.length ? Math.min(...nets) : null;
      };
      const label = side => side.join('+');
      const sideA = { name: label(sides[0]), ballNet: ballNet(sides[0]) };
      const sideB = { name: label(sides[1]), ballNet: ballNet(sides[1]) };
      const front = playMatch(holesRange(1, 9), sideA, sideB);
      const back = playMatch(holesRange(10, 18), sideA, sideB);
      const overall = playMatch(holesRange(1, 18), sideA, sideB);
      const winnerIds = overall.winner === 'A' ? sides[0] : overall.winner === 'B' ? sides[1] : [];
      const loserIds = overall.winner === 'A' ? sides[1] : overall.winner === 'B' ? sides[0] : [];
      winnerIds.forEach(pid => { if (record[pid]) record[pid].w++; });
      loserIds.forEach(pid => { if (record[pid]) record[pid].l++; });
      if (overall.winner === 'halve') sides.flat().forEach(pid => { if (record[pid]) record[pid].h++; });
      matches.push({ id: m.id, matchType: m.matchType || '1v1', sides, popFlags,
        stakes: m.stakes, front, back, overall,
        winner: overall.winner, winnerIds, loserIds });
    });
    // Best overall record (wins, halves as 0.5) → matchPlayChampion candidates.
    const score = id => record[id].w + record[id].h * 0.5;
    const ranked = ids.map(id => ({ player: id, wins: record[id].w, points: score(id) }))
      .sort((x, y) => y.points - x.points);
    const top = ranked.length ? ranked[0].points : 0;
    const champions = matches.length ? ranked.filter(r => r.points === top).map(r => r.player) : [];
    return { game: 'matchPlay', matches, record, ranked, champions };
  }

  // ── 8. Championship singles (R6) ─────────────────────────────────────────
  // Two pairwise matches seeded from live standings (1v2, 3v4). Higher-CH player
  // gets the CH difference on the lowest-SI holes; match play over 18.
  //   pairings: [{ a, b }] player ids; chById supplies course handicaps.
  function singles(ctx) {
    const { scores, course } = ctx;
    const pairings = ctx.pairings || [];
    const chById = ctx.singlesCourseHandicaps || {};
    const holes18 = course.holes.slice(0, 18).map(h => ({ hole: h.hole, si: h.si }));
    const results = pairings.map(pr => {
      const chA = chById[pr.a] ?? 0, chB = chById[pr.b] ?? 0;
      const diff = Math.abs(chA - chB);
      const higher = chA > chB ? pr.a : chB > chA ? pr.b : null; // higher CH receives
      const popsArr = higher ? H.allocatePops(diff, holes18) : [];
      const popAt = (pid, hole) => (pid === higher && popsArr ? H.popsOnHole(popsArr, hole) : 0);
      const ballNet = pid => hole => {
        const g = gross(scores, pid, hole);
        return g == null ? null : g - popAt(pid, hole);
      };
      const match = playMatch(holesRange(1, 18), { name: pr.a, ballNet: ballNet(pr.a) },
        { name: pr.b, ballNet: ballNet(pr.b) });
      const winner = match.winner === 'A' ? pr.a : match.winner === 'B' ? pr.b : 'halve';
      return { a: pr.a, b: pr.b, chA, chB, diff, receives: higher, tier: pr.tier || null,
        match, winner, pending: popsArr == null };
    });
    return { game: 'singles', results };
  }

  // ── 9. Skins — gross and net pots, carryovers (every round) ──────────────
  // Outright low ball wins the hole's skin; ties carry it forward. Two
  // independent pots. Net uses each round's skinsNet pops.
  function skins(ctx) {
    const { players, scores, alloc } = ctx;
    function run(kind) {
      const perHole = []; let carry = 0; const won = {}; players.forEach(p => { won[p.id] = 0; });
      holesRange(1, 18).forEach(hole => {
        const vals = players.map(p => {
          const g = gross(scores, p.id, hole);
          const v = g == null ? null : (kind === 'net' ? g - pops(alloc, p.id, 'skinsNet', hole) : g);
          return { player: p.id, v };
        });
        if (vals.some(x => x.v == null)) { perHole.push({ hole, incomplete: true, carry }); return; }
        const low = Math.min(...vals.map(x => x.v));
        const lowest = vals.filter(x => x.v === low);
        const value = 1 + carry;
        if (lowest.length === 1) {
          won[lowest[0].player] += value; carry = 0;
          perHole.push({ hole, winner: lowest[0].player, value, skinValue: low });
        } else {
          carry += 1;
          perHole.push({ hole, winner: null, carried: true, value: 0, carry });
        }
      });
      const ranked = players.map(p => ({ player: p.id, skins: won[p.id] }))
        .sort((a, b) => b.skins - a.skins);
      return { pot: kind, perHole, won, ranked, unclaimedCarry: carry };
    }
    return { game: 'skins', gross: run('gross'), net: run('net'),
      pending: players.some(p => isPending(alloc, p.id, 'skinsNet')) };
  }

  return {
    stablefordPoints,
    playMatch,
    bingoBangoBongo,
    nines,
    fourBallMatch,
    wolf,
    teamStableford,
    individualStableford,
    matchPlay,
    singles,
    skins,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtScoring });
}
