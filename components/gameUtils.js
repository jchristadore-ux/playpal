// gameUtils.js v4 — Stroke-only scoring. Net Score removed entirely.

function scoreName(gross, par) {
  const d = gross - par;
  if (d <= -3) return { label:'Albatross', short:'ALB', color:'#FFD700' };
  if (d === -2) return { label:'Eagle',    short:'EGL', color:'#FFD700' };
  if (d === -1) return { label:'Birdie',   short:'BRD', color:'#3DCB6C' };
  if (d === 0)  return { label:'Par',      short:'PAR', color:'#7A98BC' };
  if (d === 1)  return { label:'Bogey',    short:'BOG', color:'#E5534B' };
  if (d === 2)  return { label:'Double',   short:'DBL', color:'#C0392B' };
  return               { label:`+${d}`,   short:`+${d}`,color:'#8B0000' };
}

// Stableford uses raw stroke differential vs par (no handicap adjustment)
function calcStablefordPoints(gross, par) {
  if (!gross) return 0;
  const d = gross - par;
  if (d <= -2) return 5;
  if (d === -1) return 3;
  if (d === 0)  return 2;
  if (d === 1)  return 1;
  return 0;
}

// ─── WOLF ────────────────────────────────────────────────────────────────────

function getWolfForHole(players, holeIdx) {
  return players[holeIdx % players.length];
}

/*
  WOLF RULES (stroke-only):
  • Max 1 point per player per hole — EXCEPT the Lone Wolf who can earn 2.

  Team Wolf (wolf picks a partner):
    Team A = wolf + partner combined strokes
    Team B = other two players combined strokes
    Lower combined strokes wins → each teammate earns 1 point. Tie = no points.

  Lone Wolf (wolf plays solo):
    Compare: (wolf strokes × 2) vs (sum of 2 lowest stroke scores among other 3 players)
    • Lone Wolf wins  → wolf earns 2 points
    • Others win      → each non-wolf player whose strokes ≤ 2nd-lowest earns 1 point
    • Exact tie       → no points
*/
function resolveWolfHole(scores, holeIdx, wolfId, partnerId, isLone, players) {
  // Raw strokes only — null if score missing
  const strokes = {};
  players.forEach(p => {
    const g = scores[p.id]?.[holeIdx];
    strokes[p.id] = (g && g > 0) ? g : null;
  });

  const wolfTeam = isLone ? [wolfId] : [wolfId, partnerId].filter(Boolean);
  const others   = players.map(p => p.id).filter(id => !wolfTeam.includes(id));
  const deltas   = Object.fromEntries(players.map(p => [p.id, 0]));

  if (isLone) {
    const wolfStrokes = strokes[wolfId];
    if (wolfStrokes === null) return { wolfWins:false, otherWins:false, tied:true, deltas };

    const otherStrokes = others
      .map(id => strokes[id])
      .filter(s => s !== null)
      .sort((a, b) => a - b);
    if (otherStrokes.length < 2) return { wolfWins:false, otherWins:false, tied:true, deltas };

    const wolfScore  = wolfStrokes * 2;
    const otherScore = otherStrokes[0] + otherStrokes[1]; // two lowest raw strokes
    const wolfWins   = wolfScore < otherScore;
    const otherWins  = otherScore < wolfScore;

    if (wolfWins) {
      deltas[wolfId] = 2;
    } else if (otherWins) {
      const threshold = otherStrokes[1];
      others.forEach(id => {
        if (strokes[id] !== null && strokes[id] <= threshold) deltas[id] = 1;
      });
    }
    return { wolfWins, otherWins, tied: (!wolfWins && !otherWins), deltas };

  } else {
    // Team Wolf: combined raw strokes
    const wolfScore  = wolfTeam.reduce((s, id) => s + (strokes[id] ?? 99), 0);
    const otherScore = others.reduce((s, id)   => s + (strokes[id] ?? 99), 0);
    const wolfWins   = wolfScore < otherScore;
    const otherWins  = otherScore < wolfScore;
    if (wolfWins)       wolfTeam.forEach(id => { deltas[id] = 1; });
    else if (otherWins) others.forEach(id   => { deltas[id] = 1; });
    return { wolfWins, otherWins, tied: (!wolfWins && !otherWins), deltas };
  }
}

// Cumulative wolf point standings across all confirmed holes
function calcWolfStandings(scores, wolfData, players, course) {
  const pts = Object.fromEntries(players.map(p => [p.id, 0]));
  for (let i = 0; i < 18; i++) {
    const wd = wolfData?.[i];
    if (!wd?.confirmed) continue;
    const { deltas } = resolveWolfHole(scores, i, wd.wolfId, wd.partnerId, !!wd.lone, players);
    players.forEach(p => { pts[p.id] += deltas[p.id]; });
  }
  return pts;
}

// Wolf end-of-round payout: most points wins the pot from each other player
function calcWolfPayouts(wolfPts, players, stake) {
  const pay = Object.fromEntries(players.map(p => [p.id, 0]));
  if (!players.length) return pay;
  const maxPts  = Math.max(...players.map(p => wolfPts[p.id] || 0));
  const winners = players.filter(p => (wolfPts[p.id] || 0) === maxPts);
  const losers  = players.filter(p => (wolfPts[p.id] || 0) < maxPts);
  losers.forEach(l => {
    pay[l.id] -= stake;
    winners.forEach(w => { pay[w.id] += stake / winners.length; });
  });
  return pay;
}

// ─── PASS THE MONEY ──────────────────────────────────────────────────────────

function checkPTMPass(score, par, putts) {
  return score >= par + 2 || putts >= 3;
}

function checkPTMWin18(score, par, putts) {
  return score <= par + 1 && putts <= 2;
}

function ptmNextPlayer(players, currentId) {
  const idx = players.findIndex(p => p.id === currentId);
  return players[(idx + 1) % players.length];
}

function computePTMState(scores, putts, players, course, initialHolderId) {
  let holderId = initialHolderId || players[0].id;
  const log    = [];

  for (let i = 0; i < 18; i++) {
    const par = course.holes[i].par;

    if (i < 17) {
      const score = scores[holderId]?.[i];
      const putt  = (putts[holderId]?.[i]) || 0;
      if (!score) continue;
      if (checkPTMPass(score, par, putt)) {
        const next   = ptmNextPlayer(players, holderId);
        const reason = score >= par + 2 ? 'Double+' : '3-Putt';
        log.push({ holeIdx: i, fromId: holderId, toId: next.id, reason });
        holderId = next.id;
      }
    } else {
      const hole18StartHolder = holderId;
      let   passes            = 0;
      while (true) {
        const score = scores[holderId]?.[i];
        const putt  = (putts[holderId]?.[i]) || 0;
        if (!score) break;
        if (!checkPTMPass(score, par, putt)) break;
        if (passes >= 3) {
          const reason = score >= par + 2 ? 'Double+' : '3-Putt';
          log.push({ holeIdx: i, fromId: holderId, toId: hole18StartHolder, reason, final: true });
          holderId = hole18StartHolder;
          break;
        }
        const next   = ptmNextPlayer(players, holderId);
        const reason = score >= par + 2 ? 'Double+' : '3-Putt';
        log.push({ holeIdx: i, fromId: holderId, toId: next.id, reason });
        holderId = next.id;
        passes++;
      }
    }
  }

  return { holderId, log };
}

function calcPTMPayouts(holderId, players, stake) {
  const pay = Object.fromEntries(players.map(p => [p.id, 0]));
  players.forEach(p => {
    if (p.id === holderId) pay[p.id] = stake * (players.length - 1);
    else pay[p.id] = -stake;
  });
  return pay;
}

// ─── NASSAU WITH PRESSES (raw strokes) ───────────────────────────────────────

function calcNassauUnits(scores, p1, p2, course, holesRange) {
  let units = 0;
  for (const i of holesRange) {
    const g1 = scores[p1.id]?.[i];
    const g2 = scores[p2.id]?.[i];
    if (!g1 || !g2) continue;
    if (g1 < g2) units++;
    else if (g2 < g1) units--;
  }
  return units;
}

function nassauSegmentStatus(scores, players, course, holesRange, currentHole) {
  if (players.length < 2) return 'EVEN';
  const played = holesRange.filter(i => i <= currentHole);
  const units  = calcNassauUnits(scores, players[0], players[1], course, played);
  const n0     = players[0].name.split(' ')[0];
  const n1     = players[1].name.split(' ')[0];
  if (units === 0) return 'EVEN';
  return units > 0 ? `${n0} +${units}` : `${n1} +${Math.abs(units)}`;
}

function calcNassauPayouts(scores, players, course, baseStake, presses=[]) {
  const payouts = Object.fromEntries(players.map(p=>[p.id,0]));
  if (players.length < 2) return payouts;
  const p1=players[0], p2=players[1];
  const segs = [
    { holes:Array.from({length:9},(_,i)=>i),    stake:baseStake },
    { holes:Array.from({length:9},(_,i)=>i+9),  stake:baseStake },
    { holes:Array.from({length:18},(_,i)=>i),   stake:baseStake },
    ...presses.map(pr=>({
      holes:Array.from({length:18-pr.startHole},(_,i)=>i+pr.startHole),
      stake:pr.stake||baseStake,
    })),
  ];
  segs.forEach(seg=>{
    const u=calcNassauUnits(scores,p1,p2,course,seg.holes);
    if (u>0){ payouts[p1.id]+=seg.stake; payouts[p2.id]-=seg.stake; }
    else if (u<0){ payouts[p2.id]+=seg.stake; payouts[p1.id]-=seg.stake; }
  });
  return payouts;
}

// ─── SKINS (raw strokes) ─────────────────────────────────────────────────────

function calcSkins(scores, players, course, stakes) {
  const skins = Object.fromEntries(players.map(p=>[p.id,0]));
  let carryover = 0;
  for (let i = 0; i < 18; i++) {
    const raw = players.map(p => {
      const g = scores[p.id]?.[i];
      return g ? { id: p.id, strokes: g } : null;
    }).filter(Boolean);
    if (raw.length < players.length) { carryover++; continue; }
    raw.sort((a,b) => a.strokes - b.strokes);
    const low     = raw[0].strokes;
    const winners = raw.filter(n => n.strokes === low);
    if (winners.length === 1) { skins[winners[0].id] += 1 + carryover; carryover = 0; }
    else carryover++;
  }
  const total = Object.values(skins).reduce((a,b) => a+b, 0);
  const pay   = Object.fromEntries(players.map(p=>[p.id, skins[p.id]*stakes - (total>0?stakes:0)]));
  return { skins, payouts: pay };
}

// ─── TOTALS ──────────────────────────────────────────────────────────────────

function totalScore(scores, pid) {
  return (scores[pid]||[]).reduce((a,b) => a+(b||0), 0);
}

function totalVsPar(scores, pid, holes) {
  return (scores[pid]||[]).reduce((acc,s,i) => acc+(s&&holes[i] ? s-holes[i].par : 0), 0);
}

function calcAllPayouts(scores, wolfData, players, course, formats, nassauPresses=[], ptmHolderId=null) {
  const totals = Object.fromEntries(players.map(p=>[p.id,0]));
  formats.forEach(f => {
    let pay = {};
    if (f.type === 'wolf') {
      const pts = calcWolfStandings(scores, wolfData, players, course);
      pay = calcWolfPayouts(pts, players, f.stakes);
    } else if (f.type === 'nassau') {
      pay = calcNassauPayouts(scores, players, course, f.stakes, nassauPresses);
    } else if (f.type === 'passmoney') {
      const holder = ptmHolderId || players[0].id;
      pay = calcPTMPayouts(holder, players, f.stakes);
    } else if (f.type === 'skins') {
      pay = calcSkins(scores, players, course, f.stakes).payouts;
    } else if (f.type === 'stableford') {
      const top = Math.max(...players.map(p =>
        course.holes.reduce((a,h,i) => a + calcStablefordPoints(scores[p.id]?.[i]||0, h.par), 0)
      ));
      players.forEach(p => {
        const my = course.holes.reduce((a,h,i) => a + calcStablefordPoints(scores[p.id]?.[i]||0, h.par), 0);
        pay[p.id] = my === top ? f.stakes*(players.length-1) : -f.stakes;
      });
    }
    players.forEach(p => { totals[p.id] += (pay[p.id]||0); });
  });
  return totals;
}

// expose on window
if (typeof window !== 'undefined') {
  Object.assign(window, {
    scoreName, calcStablefordPoints,
    getWolfForHole, resolveWolfHole, calcWolfStandings, calcWolfPayouts,
    checkPTMPass, checkPTMWin18, ptmNextPlayer, computePTMState, calcPTMPayouts,
    calcNassauUnits, nassauSegmentStatus, calcNassauPayouts,
    calcSkins, totalScore, totalVsPar, calcAllPayouts,
  });
}
