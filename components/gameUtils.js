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

// Pop flags carry a stroke COUNT per hole. `true` still means one stroke so
// rounds saved before multi-stroke pops keep scoring exactly as they did, and a
// negative value hands a stroke back (plus handicaps).
function popStrokesAt(popFlags, playerId, holeIdx) {
  const v = popFlags?.[playerId]?.[holeIdx];
  if (v === true) return 1;
  if (v === false || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getAdjustedHoleScore(scores, popFlags, playerId, holeIdx) {
  const gross = scores[playerId]?.[holeIdx];
  if (!gross) return 0;
  return Math.max(1, gross - popStrokesAt(popFlags, playerId, holeIdx));
}

// Strokes each player gets on each hole, off the low ball, from their course
// handicap (so slope, rating and the chosen tee all count). This is what the
// app seeds pops with at the start of a round.
//   opts: { allowancePct = 100, relative = true, overrides }
function autoPopStrokes(players, course, teeId, opts) {
  const o = opts || {};
  const holes = course?.holes || [];
  if (!players?.length || !holes.length) return {};
  const HS = (typeof window !== 'undefined' && window.HandicapService) || null;
  if (!HS) {
    const low = Math.min(...players.map(p => p.handicap || 0));
    return Object.fromEntries(players.map(p =>
      [p.id, holes.map(h => getHoleStrokes(Math.max(0, (p.handicap || 0) - low), h.hdcp, holes.length))]));
  }
  const tee = (typeof window !== 'undefined' && window.CourseService)
    ? window.CourseService.getTee(course, teeId)
    : { rating: course.rating, slope: course.slope };
  const hcp = HS.playingHandicaps(players, holes, tee, {
    allowancePct: o.allowancePct !== undefined ? o.allowancePct : 100,
    relative:     o.relative     !== undefined ? o.relative     : true,
    overrides:    o.overrides || {},
  });
  return Object.fromEntries(players.map(p =>
    [p.id, (hcp[p.id] && hcp[p.id].strokes) || holes.map(() => 0)]));
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

  // Wolf needs a field to play against: partnered play needs someone on the
  // other side, lone wolf needs two. Anything less is a push, not a walkover.
  if (!others.length) return { wolfWins:false, otherWins:false, tied:true, deltas };

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
  const holeCount = course?.holes?.length || 18;
  for (let i = 0; i < holeCount; i++) {
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
  const log          = [];
  const holderAtStart = []; // who held the money at the START of each hole, before any pass
  // Size off the actual course (9- or 18-hole); the last hole gets the carry-back rules.
  const holeCount = course.holes.length;
  const lastHole  = holeCount - 1;
  for (let i = 0; i < holeCount; i++) {
    holderAtStart[i] = holderId;
    const par = course.holes[i].par;
    if (i < lastHole) {
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
  return { holderId, log, holderAtStart };
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

// 2v2 teams (best ball). Returns { team1:[ids], team2:[ids] } or null when not a valid 2v2 config.
function _nassauTeams(nassauConfig) {
  if (nassauConfig?.matchType !== '2v2') return null;
  const t1 = nassauConfig.teams?.team1 || [];
  const t2 = nassauConfig.teams?.team2 || [];
  if (t1.length < 1 || t2.length < 1) return null;
  return { team1: t1, team2: t2 };
}

// Best adjusted ball for a team on a hole; 0 = no team member has scored yet
function _nassauTeamBest(scores, nassauPopFlags, ids, holeIdx) {
  const vals = ids
    .map(id => getAdjustedHoleScore(scores, nassauPopFlags, id, holeIdx))
    .filter(v => v > 0);
  return vals.length ? Math.min(...vals) : 0;
}

// +1 = team1 wins hole, -1 = team2 wins hole, 0 = tie or unscored
function _nassauTeamHoleWinner(scores, nassauPopFlags, teams, holeIdx) {
  const s1 = _nassauTeamBest(scores, nassauPopFlags, teams.team1, holeIdx);
  const s2 = _nassauTeamBest(scores, nassauPopFlags, teams.team2, holeIdx);
  if (!s1 || !s2) return 0;
  if (s1 < s2) return 1;
  if (s2 < s1) return -1;
  return 0;
}

// nassauSegmentStatus: live display string for tracker UI
// "EVEN", "John +3", "TJ +1"
function nassauSegmentStatus(scores, players, course, holesRange, currentHole, popFlags, nassauConfig) {
  const nassauPopFlags = nassauConfig?.popHoles
    ? _buildNassauPopFlags(nassauConfig)
    : (popFlags || {});

  const played = holesRange.filter(i => i <= currentHole);

  // 2v2 best-ball path
  const teams = _nassauTeams(nassauConfig);
  if (teams) {
    let t1Holes = 0;
    let t2Holes = 0;
    played.forEach(i => {
      const r = _nassauTeamHoleWinner(scores, nassauPopFlags, teams, i);
      if (r > 0) t1Holes++;
      else if (r < 0) t2Holes++;
    });
    if (t1Holes === t2Holes) return 'EVEN';
    if (t1Holes > t2Holes) return `Team 1 +${t1Holes - t2Holes}`;
    return `Team 2 +${t2Holes - t1Holes}`;
  }

  const nassauPlayers = _resolveNassauPlayers(players, nassauConfig);
  if (nassauPlayers.length < 2) return 'EVEN';

  const p1 = nassauPlayers[0];
  const p2 = nassauPlayers[1];

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

// The three Nassau bets for an 18-hole layout — front nine, back nine, and the
// overall (traditionally double). Nine-hole layouts play a single bet.
function nassauSegments(course, baseStake) {
  const holeCount = course?.holes?.length || 18;
  if (holeCount < 18) {
    return [{ key:'Match', holes: Array.from({length:holeCount}, (_, i) => i), stake: baseStake }];
  }
  const half = Math.floor(holeCount / 2);
  return [
    { key:'Front', holes: Array.from({length:half},              (_, i) => i),        stake: baseStake     },
    { key:'Back',  holes: Array.from({length:holeCount - half},  (_, i) => i + half), stake: baseStake     },
    { key:'Total', holes: Array.from({length:holeCount},         (_, i) => i),        stake: baseStake * 2 },
  ];
}

// calcNassauPayouts: fixed segments, no presses
function calcNassauPayouts(scores, players, course, baseStake, _ignoredPresses, popFlags, nassauConfig) {
  const payouts = Object.fromEntries(players.map(p => [p.id, 0]));

  const nassauPopFlags = nassauConfig?.popHoles
    ? _buildNassauPopFlags(nassauConfig)
    : (popFlags || {});

  // A nine-hole layout is one bet, not three: front/back/overall would settle
  // the same nine holes three times over.
  const segments = nassauSegments(course, baseStake);

  // 2v2 best-ball path: each segment moves the full stake per side,
  // split evenly across the two team members (zero-sum).
  const teams = _nassauTeams(nassauConfig);
  if (teams) {
    segments.forEach(seg => {
      let t1Holes = 0;
      let t2Holes = 0;
      seg.holes.forEach(i => {
        const r = _nassauTeamHoleWinner(scores, nassauPopFlags, teams, i);
        if (r > 0) t1Holes++;
        else if (r < 0) t2Holes++;
      });
      if (t1Holes === t2Holes) return; // tied: no exchange
      const winners = t1Holes > t2Holes ? teams.team1 : teams.team2;
      const losers  = t1Holes > t2Holes ? teams.team2 : teams.team1;
      winners.forEach(id => { payouts[id] = (payouts[id] || 0) + seg.stake / winners.length; });
      losers.forEach(id  => { payouts[id] = (payouts[id] || 0) - seg.stake / losers.length;  });
    });
    return payouts;
  }

  const nassauPlayers = _resolveNassauPlayers(players, nassauConfig);
  if (nassauPlayers.length < 2) return payouts;

  const p1 = nassauPlayers[0];
  const p2 = nassauPlayers[1];

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
  const holeCount = course?.holes?.length || 18;
  let carryover = 0;
  for (let i = 0; i < holeCount; i++) {
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
  const pay   = Object.fromEntries(players.map(p => [p.id, total > 0 ? stakes * (skins[p.id] * players.length - total) : 0]));
  return { skins, payouts: pay };
}

// ─── BINGO BANGO BONGO ───────────────────────────────────────────────────────
// Rules: Three independent points awarded per hole (all manual input).
//   Bingo = first player on the green (order of play by distance from hole)
//   Bango = closest to the pin once all balls are on the green
//   Bongo = first player to hole out
// Ties within a category → null winner → no point awarded.
// Most total points across 18 holes wins stake from each other player.

function calcBBBStandings(bbbData, players) {
  const pts = Object.fromEntries(players.map(p => [p.id, { bingo:0, bango:0, bongo:0, total:0 }]));
  // Keyed by hole index — walk the entries that exist so 9- and 18-hole
  // layouts both count every awarded hole and nothing else.
  for (const key of Object.keys(bbbData || {})) {
    const hole = bbbData[key];
    if (!hole?.confirmed) continue;
    ['bingo','bango','bongo'].forEach(cat => {
      const winner = hole[cat];
      if (winner && pts[winner]) { pts[winner][cat]++; pts[winner].total++; }
    });
  }
  return pts;
}

function calcBBBPayouts(bbbStandings, players, stake) {
  const pay = Object.fromEntries(players.map(p => [p.id, 0]));
  if (!players.length) return pay;
  const maxTotal = Math.max(...players.map(p => bbbStandings[p.id]?.total || 0));
  const winners  = players.filter(p => (bbbStandings[p.id]?.total || 0) === maxTotal);
  const losers   = players.filter(p => (bbbStandings[p.id]?.total || 0) < maxTotal);
  losers.forEach(l => {
    pay[l.id] -= stake;
    winners.forEach(w => { pay[w.id] += stake / winners.length; });
  });
  return pay;
}

// ─── TEE BALL ────────────────────────────────────────────────────────────────
// Rules: One point per hole to the player with the longest tee shot that stays in bounds/in play.
// OB or hazard drives are disqualified; next longest in-bounds drive wins instead.
// Tied longest in-bounds drives → null winner → no point awarded.
// Works on par 3, 4, and 5. All input is manual — distance/OB can't be derived from scores.

function calcTeeBallStandings(teeBallData, players) {
  const pts = Object.fromEntries(players.map(p => [p.id, 0]));
  for (const key of Object.keys(teeBallData || {})) {
    const hole = teeBallData[key];
    if (!hole?.confirmed || !hole.winner) continue;
    if (pts[hole.winner] !== undefined) pts[hole.winner]++;
  }
  return pts;
}

function calcTeeBallPayouts(teeBallPts, players, stake) {
  const pay = Object.fromEntries(players.map(p => [p.id, 0]));
  if (!players.length) return pay;
  const maxPts  = Math.max(...players.map(p => teeBallPts[p.id] || 0));
  const winners = players.filter(p => (teeBallPts[p.id] || 0) === maxPts);
  const losers  = players.filter(p => (teeBallPts[p.id] || 0) < maxPts);
  losers.forEach(l => {
    pay[l.id] -= stake;
    winners.forEach(w => { pay[w.id] += stake / winners.length; });
  });
  return pay;
}

// ─── TOTALS ──────────────────────────────────────────────────────────────────
function totalScore(scores, pid) {
  return (scores[pid] || []).reduce((a, b) => a + (b || 0), 0);
}

function totalVsPar(scores, pid, holes) {
  return (scores[pid] || []).reduce((acc, s, i) => acc + (s && holes[i] ? s - holes[i].par : 0), 0);
}

// ─── MARKEY MATCH ─────────────────────────────────────────────────────────────

// Order holes are played in. Starting on the 10th tee plays 10→18 then 1→9.
// Returned values are actual hole indices (0–17); position in the array is the
// play-order position. Data arrays stay indexed by actual hole index throughout.
function getPlayOrder(startingTee, holeCount) {
  const n = holeCount || 18;
  if (startingTee === 10 && n === 18) {
    return [9, 10, 11, 12, 13, 14, 15, 16, 17, 0, 1, 2, 3, 4, 5, 6, 7, 8];
  }
  return Array.from({ length: n }, (_, i) => i);
}

function getMarkeyAdjustedScore(scores, markeyPopStrokes, playerId, holeIdx) {
  const gross = scores[playerId]?.[holeIdx];
  if (!gross) return 0;
  const strokes = markeyPopStrokes?.[playerId]?.[holeIdx] || 0;
  return Math.max(1, gross - strokes);
}

// Returns { [playerId]: number[18] } — stroke counts per hole for each player,
// based on each player's handicap relative to the lowest in the foursome.
function calcMarkeyMatchPops(players, course, teeId) {
  const holes = course?.holes || [];
  if (!players.length || !holes.length) return {};
  const HS = (typeof window !== 'undefined' && window.HandicapService) || null;
  if (HS) {
    // Course handicap off the low ball, so slope/rating and the chosen tee count
    // and a 20-handicap gets a second stroke on the hardest holes.
    const tee = (typeof window !== 'undefined' && window.CourseService)
      ? window.CourseService.getTee(course, teeId)
      : { rating: course.rating, slope: course.slope };
    const hcp = HS.playingHandicaps(players, holes, tee, { allowancePct: 100, relative: true });
    const out = {};
    players.forEach(p => { out[p.id] = (hcp[p.id] && hcp[p.id].strokes) || holes.map(() => 0); });
    return out;
  }
  const lowestHdcp = Math.min(...players.map(p => p.handicap || 0));
  const result = {};
  players.forEach(p => {
    const effectiveHdcp = Math.max(0, (p.handicap || 0) - lowestHdcp);
    result[p.id] = holes.map(h => getHoleStrokes(effectiveHdcp, h.hdcp, holes.length));
  });
  return result;
}

// Derives the full match state array from scores alone. New matches spawn
// automatically when a team goes 2 down. A fresh press also begins at the turn
// (the 10th hole played) while the overall match score continues across all 18.
// Holes are walked in play order so the press timing respects the starting tee.
function calcMarkeyMatchState(scores, markeyPopStrokes, players, format, holeCount) {
  const cfg = format.markeyMatchConfig;
  if (!cfg) return [];
  const { team1, team2 } = cfg;
  const pops = markeyPopStrokes || cfg.markeyPopStrokes || {};

  // Sized off the layout being played: a nine-hole round has no turn press.
  const n = holeCount || cfg.holeCount || format.holeCount
    || (pops && Object.keys(pops).length ? (pops[Object.keys(pops)[0]] || []).length : 0) || 18;
  const turnSeq = Math.floor(n / 2);

  // Play order: starting on the 10th tee plays holes 10→18 then 1→9.
  const startingTee = (cfg.startingTee || format.startingTee) === 10 ? 10 : 1;
  const playOrder = getPlayOrder(startingTee, n);
  const lastHole = playOrder[n - 1]; // actual hole index played last in the round

  const allMatches = [];
  const activeMatches = [];

  // startHole = actual hole index where the match begins; startSeq = its position
  // in the play order (0–17). endHole is the final hole index of the round.
  const makeMatch = (startSeq, isTurnPress) => ({
    matchId: allMatches.length + 1,
    startHole: playOrder[startSeq],
    startSeq,
    endHole: lastHole,
    isTurnPress: !!isTurnPress,
    holeResults: Array(n).fill(null),
    team1Holes: 0,
    team2Holes: 0,
    status: 'active',
  });

  const firstMatch = makeMatch(0);
  allMatches.push(firstMatch);
  activeMatches.push(firstMatch);

  let turnPressSpawned = false;

  for (let seq = 0; seq < n; seq++) {
    const holeIdx = playOrder[seq];

    // Best net score per team (lower is better; 0 = unscored)
    const t1Scores = team1.map(id => getMarkeyAdjustedScore(scores, pops, id, holeIdx)).filter(s => s > 0);
    const t2Scores = team2.map(id => getMarkeyAdjustedScore(scores, pops, id, holeIdx)).filter(s => s > 0);

    if (t1Scores.length === 0 || t2Scores.length === 0) continue;

    // Turn press: once the back nine of the round (10th hole played) begins, a fresh
    // even match kicks off. The overall match (Match 1) keeps running underneath it.
    if (!turnPressSpawned && n >= 18 && seq >= turnSeq) {
      const turnMatch = makeMatch(turnSeq, true);
      allMatches.push(turnMatch);
      activeMatches.push(turnMatch);
      turnPressSpawned = true;
    }

    const t1Best = Math.min(...t1Scores);
    const t2Best = Math.min(...t2Scores);
    const holeResult = t1Best < t2Best ? 'team1' : t2Best < t1Best ? 'team2' : 'tie';

    const toSpawn = [];

    activeMatches.forEach(match => {
      if (seq < match.startSeq) return;
      match.holeResults[holeIdx] = holeResult;
      if (holeResult === 'team1') match.team1Holes++;
      else if (holeResult === 'team2') match.team2Holes++;

      // Press check: if a team just went 2 down, spawn a new match next hole
      const deficit = match.team2Holes - match.team1Holes;
      if ((deficit === 2 || deficit === -2) && seq < n - 1) {
        // Only spawn once per deficit of exactly 2 (check it wasn't already 2 before this hole)
        const prevT1 = match.team1Holes - (holeResult === 'team1' ? 1 : 0);
        const prevT2 = match.team2Holes - (holeResult === 'team2' ? 1 : 0);
        const prevDeficit = prevT2 - prevT1;
        if (Math.abs(prevDeficit) < 2) {
          toSpawn.push(seq + 1);
        }
      }
    });

    toSpawn.forEach(startSeq => {
      const newMatch = makeMatch(startSeq);
      allMatches.push(newMatch);
      activeMatches.push(newMatch);
    });
  }

  return allMatches;
}

// Returns { [playerId]: net amount won/lost } across all matches.
// Each match: winning team members split the stake (stake/2 each), losing team pays stake/2 each.
function calcMarkeyMatchPayouts(matchStates, stake, team1, team2) {
  const pay = {};
  [...team1, ...team2].forEach(id => { pay[id] = 0; });

  matchStates.forEach(match => {
    const { team1Holes, team2Holes } = match;
    const half = stake / 2;
    if (team1Holes > team2Holes) {
      team1.forEach(id => { pay[id] = (pay[id] || 0) + half; });
      team2.forEach(id => { pay[id] = (pay[id] || 0) - half; });
    } else if (team2Holes > team1Holes) {
      team2.forEach(id => { pay[id] = (pay[id] || 0) + half; });
      team1.forEach(id => { pay[id] = (pay[id] || 0) - half; });
    }
  });

  return pay;
}

// ─── calcAllPayouts ───────────────────────────────────────────────────────────
// Handles both single nassauConfig (legacy) and nassauMatches[] (new multi-match).
// nassauConfig param is kept for backward compat but ignored when nassauMatches[] is present on the format object.
// opts: { games, startingTee, teeId } — MatchEngine games settle alongside the
// built-in money games so a round's total is every wager, not just some of them.
function calcAllPayouts(scores, wolfData, players, course, formats, _ignoredPresses, ptmHolderId, popFlags, nassauConfig, bbbData, teeBallData, opts) {
  popFlags   = popFlags   || {};
  bbbData    = bbbData    || {};
  teeBallData = teeBallData || {};
  const o = opts || {};
  const totals = Object.fromEntries(players.map(p => [p.id, 0]));
  (formats || []).forEach(f => {
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
    } else if (f.type === 'bingobangobongo') {
      const standings = calcBBBStandings(bbbData, players);
      pay = calcBBBPayouts(standings, players, f.stakes);
    } else if (f.type === 'teeball') {
      const standings = calcTeeBallStandings(teeBallData, players);
      pay = calcTeeBallPayouts(standings, players, f.stakes);
    } else if (f.type === 'markeymatch') {
      const cfg = f.markeyMatchConfig;
      if (cfg && cfg.team1 && cfg.team2) {
        const matchStates = calcMarkeyMatchState(scores, cfg.markeyPopStrokes, players, f, course?.holes?.length);
        pay = calcMarkeyMatchPayouts(matchStates, cfg.stake || f.stakes || 0, cfg.team1, cfg.team2);
      }
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

  // MatchEngine games (stroke play, match play, scrambles, quota, …) settle
  // through the engine's own per-format rules.
  const ME = (typeof window !== 'undefined' && window.MatchEngine) || null;
  (o.games || []).forEach(g => {
    if (!ME || !g) return;
    if (!(Number(g.config && g.config.stake) > 0)) return;
    let pay = {};
    try {
      pay = ME.payouts(g, {
        course, players, scores,
        startingTee: o.startingTee,
        gameState: { wolf: wolfData || {}, bbb: bbbData },
      });
    } catch (e) { pay = {}; }
    players.forEach(p => { totals[p.id] += (pay[p.id] || 0); });
  });

  return totals;
}

// Money as people expect to read it: whole dollars stay whole, anything with
// cents shows them. Never round a half-dollar away — that is the difference
// between the figure on screen and the figure in the Venmo request.
function fmtMoney(amount, opts) {
  const o = opts || {};
  const v = Math.round((Number(amount) || 0) * 100) / 100;
  const abs = Math.abs(v);
  const body = '$' + (Number.isInteger(abs) ? String(abs) : abs.toFixed(2));
  if (!o.signed) return (v < 0 ? '−' : '') + body;
  if (v > 0) return '+' + body;
  if (v < 0) return '−' + body;
  return o.zero || '—';
}

// Rounds a money map to whole cents while keeping it zero-sum: the largest
// creditor absorbs the rounding residue so a settlement never invents a cent.
function roundMoneyMap(map) {
  const ids = Object.keys(map || {});
  if (!ids.length) return {};
  const out = {};
  ids.forEach(id => { out[id] = Math.round((map[id] || 0) * 100) / 100; });
  const residue = Math.round(ids.reduce((a, id) => a + out[id], 0) * 100) / 100;
  if (residue !== 0) {
    const anchor = ids.reduce((best, id) => (out[id] > out[best] ? id : best), ids[0]);
    out[anchor] = Math.round((out[anchor] - residue) * 100) / 100;
  }
  return out;
}

// One call that settles an entire round — every money game and every engine
// game — so the summary, the trip dashboard and the email can't disagree.
//   round: { players, course, formats, games, startingTee, teeId }
//   data:  { scores, wolfData, putts, popFlags, bbbData, teeBallData }
function calcRoundPayouts(round, data) {
  const d = data || {};
  const players = round.players || [];
  const course  = round.course;
  const scores  = d.scores || {};
  const ptm = (round.formats || []).some(f => f.type === 'passmoney') && players.length
    ? computePTMState(scores, d.putts || {}, players, course, players[0].id)
    : { holderId: null };
  const raw = calcAllPayouts(
    scores, d.wolfData || {}, players, course, round.formats || [], [],
    ptm.holderId, d.popFlags || {}, null, d.bbbData || {}, d.teeBallData || {},
    { games: round.games || [], startingTee: round.startingTee, teeId: round.teeId }
  );
  return roundMoneyMap(raw);
}

// ─── DEVTOOLS TEST SUITE ─────────────────────────────────────────────────────
// Run window.runPlayPalTests() in browser console to verify BBB and Tee Ball logic.
function runPlayPalTests() {
  const players = [{id:'p1',name:'Alice'},{id:'p2',name:'Bob'},{id:'p3',name:'Charlie'}];
  let pass = 0; let fail = 0;
  const ok = (label, cond) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', label); } };

  // BBB: basic accumulation
  const bbbData = {
    0: { bingo:'p1', bango:'p2', bongo:'p1', confirmed:true },
    1: { bingo:'p2', bango:'p2', bongo:'p3', confirmed:true },
  };
  const bst = calcBBBStandings(bbbData, players);
  ok('BBB p1 total=2', bst.p1.total === 2);
  ok('BBB p2 total=3', bst.p2.total === 3);
  ok('BBB p3 total=1', bst.p3.total === 1);
  ok('BBB p1 bingo=1', bst.p1.bingo === 1);
  ok('BBB p2 bango=2', bst.p2.bango === 2);

  // BBB: null winner (tie) awards no point
  const bbbTie = { 0: { bingo:null, bango:null, bongo:null, confirmed:true } };
  const tieSt = calcBBBStandings(bbbTie, players);
  ok('BBB tie→0pts p1', tieSt.p1.total === 0);
  ok('BBB tie→0pts p2', tieSt.p2.total === 0);

  // BBB: unconfirmed hole ignored
  const bbbUnconf = { 0: { bingo:'p1', bango:'p1', bongo:'p1', confirmed:false } };
  const unconfSt = calcBBBStandings(bbbUnconf, players);
  ok('BBB unconfirmed→0', unconfSt.p1.total === 0);

  // BBB: payouts — p2 wins (3 pts), p1 and p3 owe
  const bbbPay = calcBBBPayouts(bst, players, 5);
  ok('BBB p2 wins +10', bbbPay.p2 === 10);
  ok('BBB p1 loses -5', bbbPay.p1 === -5);
  ok('BBB p3 loses -5', bbbPay.p3 === -5);

  // TeeBall: basic
  const tbData = {
    0: { winner:'p1', confirmed:true },
    1: { winner:'p1', confirmed:true },
    2: { winner:null, confirmed:true },
    3: { winner:'p2', confirmed:true },
  };
  const tbSt = calcTeeBallStandings(tbData, players);
  ok('TB p1=2', tbSt.p1 === 2);
  ok('TB p2=1', tbSt.p2 === 1);
  ok('TB p3=0', tbSt.p3 === 0);

  // TeeBall: null winner → no point
  const tbTie = { 0: { winner:null, confirmed:true } };
  const tieStTB = calcTeeBallStandings(tbTie, players);
  ok('TB null→no pts', Object.values(tieStTB).every(v => v === 0));

  // TeeBall: payouts
  const tbPay = calcTeeBallPayouts(tbSt, players, 3);
  ok('TB p1 wins +6', tbPay.p1 === 6);
  ok('TB p2 loses -3', tbPay.p2 === -3);
  ok('TB p3 loses -3', tbPay.p3 === -3);

  // TeeBall: all tied = no exchange
  const allTied = calcTeeBallStandings({}, players);
  const tiedPay = calcTeeBallPayouts(allTied, players, 5);
  ok('TB all tied→0', Object.values(tiedPay).every(v => v === 0));

  // Nassau 2v2: team 1 best ball wins every hole → all three segments
  const np = [{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'},{id:'d',name:'D'}];
  const courseStub = { holes: Array.from({length:18}, (_,i)=>({num:i+1, par:4, hdcp:i+1})) };
  const sc2 = { a:Array(18).fill(3), b:Array(18).fill(5), c:Array(18).fill(4), d:Array(18).fill(5) };
  const cfg2 = { matchType:'2v2', playersInMatch:['a','b','c','d'], teams:{team1:['a','b'],team2:['c','d']}, popHoles:{} };
  const pay2 = calcNassauPayouts(sc2, np, courseStub, 5, [], {}, cfg2);
  ok('Nassau2v2 winner +10 each', pay2.a === 10 && pay2.b === 10);
  ok('Nassau2v2 loser -10 each',  pay2.c === -10 && pay2.d === -10);
  ok('Nassau2v2 zero-sum', Math.abs(pay2.a + pay2.b + pay2.c + pay2.d) < 1e-9);
  const st2 = nassauSegmentStatus(sc2, np, courseStub, Array.from({length:9},(_,i)=>i), 17, {}, cfg2);
  ok('Nassau2v2 status label', st2 === 'Team 1 +9');

  // Nassau 2v2 tie: best balls equal on every hole → no exchange
  const scTie = { a:Array(18).fill(4), b:Array(18).fill(5), c:Array(18).fill(4), d:Array(18).fill(5) };
  const payTie = calcNassauPayouts(scTie, np, courseStub, 5, [], {}, cfg2);
  ok('Nassau2v2 tie→0', Object.values(payTie).every(v => v === 0));

  // Nassau 1v1 still works
  const cfg1 = { matchType:'1v1', playersInMatch:['a','c'], popHoles:{} };
  const pay1 = calcNassauPayouts(sc2, np, courseStub, 5, [], {}, cfg1);
  ok('Nassau1v1 winner +20', pay1.a === 20 && pay1.c === -20);

  console.log(`PlayPal tests: ${pass} passed, ${fail} failed`);
  return { pass, fail };
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    scoreName, calcStablefordPoints, resolveTiebreaker,
    getWolfForHole, resolveWolfHole, calcWolfStandings, calcWolfPayouts,
    checkPTMPass, checkPTMWin18, ptmNextPlayer, computePTMState, calcPTMPayouts,
    calcNassauUnits, nassauSegmentStatus, calcNassauPayouts, calcMultiNassauPayouts,
    getAdjustedHoleScore, calcSkins, totalScore, totalVsPar, calcAllPayouts,
    nassauSegments, calcRoundPayouts, roundMoneyMap, fmtMoney,
    popStrokesAt, autoPopStrokes,
    calcBBBStandings, calcBBBPayouts, calcTeeBallStandings, calcTeeBallPayouts,
    getPlayOrder, getMarkeyAdjustedScore, calcMarkeyMatchPops, calcMarkeyMatchState, calcMarkeyMatchPayouts,
    runPlayPalTests,
  });
}
