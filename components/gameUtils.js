// gameUtils.js v5 — Stroke-only scoring. Tiebreaker: strokes → birdies → fewest bogeys.

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

// ─── TIEBREAKER ──────────────────────────────────────────────────────────────
/*
  Given a list of tied players, returns the subset that wins after applying:
    1. Fewest total strokes
    2. Most birdies (score === par - 1)
    3. Fewest bogeys (score === par + 1)
  If still tied after all three, all remaining players share the win.
*/
function resolveTiebreaker(tiedPlayers, scores, course) {
  if (tiedPlayers.length <= 1) return tiedPlayers;

  // 1. Fewest total strokes
  const strokeTotals = tiedPlayers.map(p => ({
    p,
    strokes: (scores[p.id]||[]).reduce((a,b) => a+(b||0), 0),
  }));
  const minStrokes = Math.min(...strokeTotals.map(x => x.strokes));
  let survivors = strokeTotals.filter(x => x.strokes === minStrokes).map(x => x.p);
  if (survivors.length === 1) return survivors;

  // 2. Most birdies
  const birdieCounts = survivors.map(p => ({
    p,
    birdies: course.holes.reduce((acc, h, i) => {
      const s = scores[p.id]?.[i];
      return acc + (s && s === h.par - 1 ? 1 : 0);
    }, 0),
  }));
  const maxBirdies = Math.max(...birdieCounts.map(x => x.birdies));
  survivors = birdieCounts.filter(x => x.birdies === maxBirdies).map(x => x.p);
  if (survivors.length === 1) return survivors;

  // 3. Fewest bogeys
  const bogeyCounts = survivors.map(p => ({
    p,
    bogeys: course.holes.reduce((acc, h, i) => {
      const s = scores[p.id]?.[i];
      return acc + (s && s === h.par + 1 ? 1 : 0);
    }, 0),
  }));
  const minBogeys = Math.min(...bogeyCounts.map(x => x.bogeys));
  survivors = bogeyCounts.filter(x => x.bogeys === minBogeys).map(x => x.p);

  // Still tied — share the win
  return survivors;
}

// ─── WOLF ────────────────────────────────────────────────────────────────────

function getWolfForHole(players, holeIdx) {
  return players[holeIdx % players.length];
}

/*
  WOLF RULES (stroke-only):
  Team Wolf: combined raw strokes, lower wins. Tie = no points.
  Lone Wolf: (wolf strokes × 2) vs sum of 2 lowest others. Lone Wolf wins → +2. Others win → +1 each.
*/
function resolveWolfHole(scores, holeIdx, wolfId, partnerId, isLone, players) {
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
    const otherScore = otherStrokes[0] + otherStrokes[1];
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
    const wolfScore  = wolfTeam.reduce((s, id) => s + (strokes[id] ?? 99), 0);
    const otherScore = others.reduce((s, id)   => s + (strokes[id] ?? 99), 0);
    const wolfWins   = wolfScore < otherScore;
    const otherWins  = otherScore < wolfScore;
    if (wolfWins)       wolfTeam.forEach(id => { deltas[id] = 1; });
    else if (otherWins) others.forEach(id   => { deltas[id] = 1; });
    return { wolfWins, otherWins, tied: (!wolfWins && !otherWins), deltas };
  }
}

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

// Wolf payout with tiebreaker
function calcWolfPayouts(wolfPts, players, stake, scores, course) {
  const pay = Object.fromEntries(players.map(p => [p.id, 0]));
  if (!players.length) return pay;

  const maxPts  = Math.max(...players.map(p => wolfPts[p.id] || 0));
  const tied    = players.filter(p => (wolfPts[p.id] || 0) === maxPts);
  const losers  = players.filter(p => (wolfPts[p.id] || 0) < maxPts);

  // Apply tiebreaker if multiple players share the lead
  const winners = (tied.length > 1 && scores && course)
    ? resolveTiebreaker(tied, scores, course)
    : tied;

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
      // Pass scores + course so tiebreaker can evaluate strokes/birdies/bogeys
      pay = calcWolfPayouts(pts, players, f.stakes, scores, course);
    } else if (f.type === 'nassau') {
      pay = calcNassauPayouts(scores, players, course, f.stakes, nassauPresses);
    } else if (f.type === 'passmoney') {
      const holder = ptmHolderId || players[0].id;
      pay = calcPTMPayouts(holder, players, f.stakes);
    } else if (f.type === 'skins') {
      pay = calcSkins(scores, players, course, f.stakes).payouts;
    } else if (f.type === 'stableford') {
      // Find highest point total
      const playerPts = players.map(p => ({
        p,
        pts: course.holes.reduce((a,h,i) => a + calcStablefordPoints(scores[p.id]?.[i]||0, h.par), 0),
      }));
      const maxPts = Math.max(...playerPts.map(x => x.pts));
      const tiedPlayers = playerPts.filter(x => x.pts === maxPts).map(x => x.p);

      // Apply tiebreaker
      const winners = tiedPlayers.length > 1
        ? resolveTiebreaker(tiedPlayers, scores, course)
        : tiedPlayers;

      players.forEach(p => {
        const isWinner = winners.some(w => w.id === p.id);
        pay[p.id] = isWinner
          ? (f.stakes * (players.length - winners.length)) / winners.length
          : -f.stakes;
      });
    }
    players.forEach(p => { totals[p.id] += (pay[p.id]||0); });
  });
  return totals;
}

// expose on window
if (typeof window !== 'undefined') {
  Object.assign(window, {
    scoreName, calcStablefordPoints, resolveTiebreaker,
    getWolfForHole, resolveWolfHole, calcWolfStandings, calcWolfPayouts,
    checkPTMPass, checkPTMWin18, ptmNextPlayer, computePTMState, calcPTMPayouts,
    calcNassauUnits, nassauSegmentStatus, calcNassauPayouts,
    calcSkins, totalScore, totalVsPar, calcAllPayouts,
  });
}
