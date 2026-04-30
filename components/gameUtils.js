// gameUtils.js v9 — Nassau rebuilt: pure hole-by-hole, no presses, no carryovers
//                   Extended: nassauMatches[] array support (multi-match per round)

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

function getAdjustedHoleScore(scores, popFlags, playerId, holeIdx) {
  const gross = scores[playerId]?.[holeIdx];
  if (!gross) return 0;
  const pop = !!(popFlags?.[playerId]?.[holeIdx]);
  return Math.max(1, gross - (pop ? 1 : 0));
}

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
function resolveTiebreaker(tiedPlayers, scores, course) {
  if (tiedPlayers.length <= 1) return tiedPlayers;
  const strokeTotals = tiedPlayers.map(p => ({
    p, strokes: (scores[p.id]||[]).reduce((a,b) => a+(b||0), 0),
  }));
  const minStrokes = Math.min(...strokeTotals.map(x => x.strokes));
  let survivors = strokeTotals.filter(x => x.strokes === minStrokes).map(x => x.p);
  if (survivors.length === 1) return survivors;
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
  const bogeyCounts = survivors.map(p => ({
    p,
    bogeys: course.holes.reduce((acc, h, i) => {
      const s = scores[p.id]?.[i];
      return acc + (s && s === h.par + 1 ? 1 : 0);
    }, 0),
  }));
  const minBogeys = Math.min(...bogeyCounts.map(x => x.bogeys));
  survivors = bogeyCounts.filter(x => x.bogeys === minBogeys).map(x => x.p);
  return survivors;
}

// ─── WOLF ────────────────────────────────────────────────────────────────────
function getWolfForHole(players, holeIdx) {
  return players[holeIdx % players.length];
}

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
    const otherStrokes = others.map(id => strokes[id]).filter(s => s !== null).sort((a, b) => a - b);
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

function calcWolfPayouts(wolfPts, players, stake, scores, course) {
  const pay = Object.fromEntries(players.map(p => [p.id, 0]));
  if (!players.length) return pay;
  const maxPts  = Math.max(...players.map(p => wolfPts[p.id] || 0));
  const tied    = players.filter(p => (wolfPts[p.id] || 0) === maxPts);
  const losers  = players.filter(p => (wolfPts[p.id] || 0) < maxPts);
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

// ─── NASSAU — pure hole-by-hole, no presses, no carryovers ───────────────────
//
// nassauConfig shape (single match — legacy):
//   { playersInMatch:[id,id], matchType:'1v1', teams:null, popHoles:{[pid]:bool[18]} }
//
// nassauMatches shape (multi-match — new):
//   [ { id, stakes, matchType, playersInMatch, teams, popHoles }, ... ]
//
// Rules:
//   • Each hole worth exactly 1 point
//   • Winner = lower adjusted score (gross − 1 if pop). Tie = no point.
//   • Three fixed bets: Front 9 (baseStake), Back 9 (baseStake), Overall (baseStake × 2)
//   • Tied segment = no money exchanged

function _buildNassauPopFlags(nassauConfig) {
  if (!nassauConfig?.popHoles) return {};
  const flags = {};
  Object.entries(nassauConfig.popHoles).forEach(([pid, arr]) => {
    flags[pid] = Array.isArray(arr) ? arr : Array(18).fill(false);
  });
  return flags;
}

function _resolveNassauPlayers(allPlayers, nassauConfig) {
  if (!nassauConfig || !nassauConfig.playersInMatch || nassauConfig.playersInMatch.length === 0) {
    return allPlayers.slice(0, 2);
  }
  return nassauConfig.playersInMatch
    .map(id => allPlayers.find(p => p.id === id))
    .filter(Boolean);
}

// +1 = p1 wins hole, -1 = p2 wins hole, 0 = tie or unscored
function _nassauHoleWinner(scores, nassauPopFlags, p1id, p2id, holeIdx) {
  const s1 = getAdjustedHoleScore(scores, nassauPopFlags, p1id, holeIdx);
  const s2 = getAdjustedHoleScore(scores, nassauPopFlags, p2id, holeIdx);
  if (!s1 || !s2) return 0;
  if (s1 < s2) return 1;
  if (s2 < s1) return -1;
  return 0;
}

// nassauSegmentStatus: live display string for tracker UI
// "EVEN", "John +3", "TJ +1"
function nassauSegmentStatus(scores, players, course, holesRange, currentHole, popFlags, nassauConfig) {
  const nassauPlayers = _resolveNassauPlayers(players, nassauConfig);
  if (nassauPlayers.length < 2) return 'EVEN';

  const nassauPopFlags = nassauConfig?.popHoles
    ? _buildNassauPopFlags(nassauConfig)
    : (popFlags || {});

  const p1 = nassauPlayers[0];
  const p2 = nassauPlayers[1];
  const played = holesRange.filter(i => i <= currentHole);

  let p1Holes = 0;
  let p2Holes = 0;
  played.forEach(i => {
    const r = _nassauHoleWinner(scores, nassauPopFlags, p1.id, p2.id, i);
    if (r > 0) p1Holes++;
    else if (r < 0) p2Holes++;
  });

  if (p1Holes === p2Holes) return 'EVEN';
  if (p1Holes > p2Holes) return `${p1.name.split(' ')[0]} +${p1Holes - p2Holes}`;
  return `${p2.name.split(' ')[0]} +${p2Holes - p1Holes}`;
}

// calcNassauPayouts: three fixed segments, no presses
// Front 9: baseStake, Back 9: baseStake, Overall: baseStake * 2
function calcNassauPayouts(scores, players, course, baseStake, _ignoredPresses, popFlags, nassauConfig) {
  const payouts = Object.fromEntries(players.map(p => [p.id, 0]));
  const nassauPlayers = _resolveNassauPlayers(players, nassauConfig);
  if (nassauPlayers.length < 2) return payouts;

  const nassauPopFlags = nassauConfig?.popHoles
    ? _buildNassauPopFlags(nassauConfig)
    : (popFlags || {});

  const p1 = nassauPlayers[0];
  const p2 = nassauPlayers[1];

  const segments = [
    { holes: Array.from({length:9},  (_, i) => i),    stake: baseStake     },
    { holes: Array.from({length:9},  (_, i) => i + 9), stake: baseStake    },
    { holes: Array.from({length:18}, (_, i) => i),    stake: baseStake * 2 },
  ];

  segments.forEach(seg => {
    let p1Holes = 0;
    let p2Holes = 0;
    seg.holes.forEach(i => {
      const r = _nassauHoleWinner(scores, nassauPopFlags, p1.id, p2.id, i);
      if (r > 0) p1Holes++;
      else if (r < 0) p2Holes++;
    });
    if (p1Holes > p2Holes) {
      payouts[p1.id] = (payouts[p1.id] || 0) + seg.stake;
      payouts[p2.id] = (payouts[p2.id] || 0) - seg.stake;
    } else if (p2Holes > p1Holes) {
      payouts[p2.id] = (payouts[p2.id] || 0) + seg.stake;
      payouts[p1.id] = (payouts[p1.id] || 0) - seg.stake;
    }
    // tied: no exchange
  });

  return payouts;
}

// ─── MULTI-NASSAU: sum payouts across all matches ────────────────────────────
// nassauMatches: array of { id, stakes, matchType, playersInMatch, popHoles, ... }
// Returns { [playerId]: totalPayout } summed across all matches
function calcMultiNassauPayouts(scores, players, course, nassauMatches, popFlags) {
  const totals = Object.fromEntries(players.map(p => [p.id, 0]));
  if (!nassauMatches || nassauMatches.length === 0) return totals;

  nassauMatches.forEach(match => {
    const matchCfg = {
      playersInMatch: match.playersInMatch,
      matchType:      match.matchType,
      teams:          match.teams || null,
      popHoles:       match.popHoles || {},
    };
    const matchPay = calcNassauPayouts(
      scores, players, course,
      match.stakes, [], popFlags || {}, matchCfg
    );
    players.forEach(p => {
      totals[p.id] += (matchPay[p.id] || 0);
    });
  });

  return totals;
}

// Legacy stub — kept so existing callers don't break
function calcNassauUnits(scores, p1, p2, course, holesRange, popFlags) {
  let units = 0;
  for (const i of holesRange) {
    const s1 = getAdjustedHoleScore(scores, popFlags || {}, p1.id, i);
    const s2 = getAdjustedHoleScore(scores, popFlags || {}, p2.id, i);
    if (!s1 || !s2) continue;
    if (s1 < s2) units++;
    else if (s2 < s1) units--;
  }
  return units;
}

// ─── SKINS (pop-aware) ───────────────────────────────────────────────────────
function calcSkins(scores, players, course, stakes, popFlags) {
  const skins = Object.fromEntries(players.map(p => [p.id, 0]));
  let carryover = 0;
  for (let i = 0; i < 18; i++) {
    const raw = players.map(p => {
      const g = getAdjustedHoleScore(scores, popFlags, p.id, i);
      return g ? { id: p.id, strokes: g } : null;
    }).filter(Boolean);
    if (raw.length < players.length) { carryover++; continue; }
    raw.sort((a, b) => a.strokes - b.strokes);
    const low     = raw[0].strokes;
    const winners = raw.filter(n => n.strokes === low);
    if (winners.length === 1) { skins[winners[0].id] += 1 + carryover; carryover = 0; }
    else carryover++;
  }
  const total = Object.values(skins).reduce((a, b) => a + b, 0);
  const pay   = Object.fromEntries(players.map(p => [p.id, skins[p.id] * stakes - (total > 0 ? stakes : 0)]));
  return { skins, payouts: pay };
}

// ─── TOTALS ──────────────────────────────────────────────────────────────────
function totalScore(scores, pid) {
  return (scores[pid] || []).reduce((a, b) => a + (b || 0), 0);
}

function totalVsPar(scores, pid, holes) {
  return (scores[pid] || []).reduce((acc, s, i) => acc + (s && holes[i] ? s - holes[i].par : 0), 0);
}

// ─── calcAllPayouts ───────────────────────────────────────────────────────────
// Handles both single nassauConfig (legacy) and nassauMatches[] (new multi-match).
// nassauConfig param is kept for backward compat but ignored when nassauMatches[] is present on the format object.
function calcAllPayouts(scores, wolfData, players, course, formats, _ignoredPresses, ptmHolderId, popFlags, nassauConfig) {
  popFlags = popFlags || {};
  const totals = Object.fromEntries(players.map(p => [p.id, 0]));
  formats.forEach(f => {
    let pay = {};
    if (f.type === 'wolf') {
      const pts = calcWolfStandings(scores, wolfData, players, course);
      pay = calcWolfPayouts(pts, players, f.stakes, scores, course);
    } else if (f.type === 'nassau') {
      // Multi-match path: nassauMatches array present on format object
      if (f.nassauMatches && f.nassauMatches.length > 0) {
        pay = calcMultiNassauPayouts(scores, players, course, f.nassauMatches, popFlags);
      } else {
        // Single-match legacy path
        const cfg = f.nassauConfig || nassauConfig || null;
        pay = calcNassauPayouts(scores, players, course, f.stakes, [], popFlags, cfg);
      }
    } else if (f.type === 'passmoney') {
      const holder = ptmHolderId || players[0].id;
      pay = calcPTMPayouts(holder, players, f.stakes);
    } else if (f.type === 'skins') {
      pay = calcSkins(scores, players, course, f.stakes, popFlags).payouts;
    } else if (f.type === 'stableford') {
      const playerPts = players.map(p => ({
        p,
        pts: course.holes.reduce((a, h, i) =>
          a + calcStablefordPoints(getAdjustedHoleScore(scores, popFlags, p.id, i), h.par), 0),
      }));
      const maxPts = Math.max(...playerPts.map(x => x.pts));
      const tiedPlayers = playerPts.filter(x => x.pts === maxPts).map(x => x.p);
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
    players.forEach(p => { totals[p.id] += (pay[p.id] || 0); });
  });
  return totals;
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    scoreName, calcStablefordPoints, resolveTiebreaker,
    getWolfForHole, resolveWolfHole, calcWolfStandings, calcWolfPayouts,
    checkPTMPass, checkPTMWin18, ptmNextPlayer, computePTMState, calcPTMPayouts,
    calcNassauUnits, nassauSegmentStatus, calcNassauPayouts, calcMultiNassauPayouts,
    getAdjustedHoleScore, calcSkins, totalScore, totalVsPar, calcAllPayouts,
  });
}
