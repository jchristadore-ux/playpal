// historyImport.js — loads the group's stored EGT 2026 scorecards into each
// roster player's profile, stats and round history, and posts every future
// EGT tournament round to the PlayPal Index the same way a normal round posts.
//
// The six rounds below are every gross score the app synced on the trip
// (fixtures/egt-2026-results.json), with each course's played-tee rating/slope
// and hole par/SI (fixtures/egt-2026-seed.json). EGT rounds are scored under
// tournament ids (john/brian/tj/mike), so they are matched to roster profiles
// by name — the real first name or the tournament display name.
//
//   matchRoster(players, egtPlayers?) → { egtId: rosterId } (unique matches only)
//   importRounds(map)                 → snapshots in the saved-round shape
//   apply(players, ls)                → { players, changed, complete, matched, posted }
//   postEgtRound(players, round, scores, savedAt)
//                                     → { players, changed, snapshot, updates }
//
// Everything is idempotent: snapshots are written only when missing and
// IndexService dedupes by round id / sync code, so running on every launch,
// on every device, never double-counts a round.

const HistoryImport = (function () {

  const TRIP_ID = 'egt-2026';
  const TRIP_NAME = 'EGT 2026 CUP';
  const DONE_KEY = 'pp_import_egt2026';
  const PALETTE = ['#15803D', '#C8A15A', '#2563EB', '#DC2626', '#7C3AED', '#0891B2'];

  // Tournament id → names a roster profile may use, plus the Handicap Index
  // each player carried into the trip (the index at play for every round).
  const PLAYERS = {
    john:  { name: 'John',  aliases: ['john', 'johnny', 'jake'],        indexAtPlay: 18.0 },
    brian: { name: 'Brian', aliases: ['brian', 'blake'],                indexAtPlay: 23.0 },
    tj:    { name: 'TJ',    aliases: ['tj', 'troy'],                    indexAtPlay: 28.0 },
    mike:  { name: 'Mike',  aliases: ['mike', 'michael', 'miles'],      indexAtPlay: 28.0 },
  };

  // Round ids / sync codes match what EgtBridge gives the live EGT rounds, so
  // a round posted here and the same round finalized in the scorer dedupe.
  const ROUNDS = [
    { id: "R1", playedAt: "2026-07-21T10:00:00-04:00", syncCode: "W4K336",
      course: { id: "minerals", name: "Minerals Golf Club", location: "Vernon, NJ", tee: "White", rating: 60.2, slope: 99,
        par: [4, 3, 4, 3, 4, 3, 4, 3, 3, 4, 3, 4, 3, 4, 3, 4, 3, 3],
        si:  [9, 11, 7, 3, 13, 5, 1, 17, 15, 10, 12, 8, 4, 14, 6, 2, 18, 16] },
      scores: {
        mike : [8, 5, 5, 5, 6, 3, 7, 5, 5, 5, 8, 9, 4, 8, 4, 8, 5, 4],
        tj   : [8, 4, 8, 4, 7, 7, 8, 3, 3, 6, 5, 7, 8, 7, 5, 7, 9, 5],
        john : [5, 4, 5, 3, 4, 4, 7, 4, 5, 5, 3, 7, 6, 5, 5, 9, 5, 4],
      } },
    { id: "R2", playedAt: "2026-07-22T07:30:00-04:00", syncCode: "X4K336",
      course: { id: "ballyowen", name: "Ballyowen", location: "Hamburg, NJ", tee: "White", rating: 66.9, slope: 114,
        par: [4, 4, 5, 3, 5, 3, 4, 4, 4, 5, 3, 4, 4, 4, 3, 4, 5, 4],
        si:  [13, 11, 3, 17, 5, 15, 1, 7, 9, 12, 18, 14, 8, 4, 16, 2, 10, 6] },
      scores: {
        tj   : [5, 5, 7, 4, 8, 5, 5, 9, 4, 6, 2, 6, 6, 6, 7, 5, 6, 4],
        john : [5, 4, 9, 3, 6, 4, 5, 4, 5, 5, 3, 6, 4, 5, 6, 6, 6, 7],
        mike : [5, 6, 6, 4, 8, 3, 8, 7, 6, 7, 6, 5, 7, 5, 4, 6, 8, 7],
        brian: [7, 7, 6, 5, 8, 4, 6, 5, 7, 7, 3, 7, 7, 6, 5, 6, 6, 5],
      } },
    { id: "R3", playedAt: "2026-07-22T13:45:00-04:00", syncCode: "Y4K336",
      course: { id: "wildturkey", name: "Wild Turkey", location: "Hamburg, NJ", tee: "White", rating: 69, slope: 129,
        par: [4, 3, 5, 4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 3, 4, 3, 5, 4],
        si:  [11, 17, 5, 1, 3, 13, 7, 15, 9, 10, 2, 14, 16, 12, 4, 18, 8, 6] },
      scores: {
        mike : [7, 7, 8, 5, 4, 7, 3, 9, 5, 3, 9, 6, 7, 3, 7, 4, 6, 5],
        brian: [7, 7, 7, 7, 7, 6, 7, 9, 7, 5, 6, 6, 7, 4, 7, 5, 9, 5],
        john : [6, 4, 7, 7, 7, 6, 7, 5, 5, 9, 7, 4, 5, 5, 5, 5, 9, 5],
        tj   : [5, 4, 7, 7, 7, 6, 5, 5, 6, 5, 9, 5, 4, 5, 9, 6, 8, 6],
      } },
    { id: "R4", playedAt: "2026-07-23T07:50:00-04:00", syncCode: "Z4K336",
      course: { id: "crystalsprings", name: "Crystal Springs Golf Club", location: "Hardyston, NJ", tee: "White", rating: 69.1, slope: 123,
        par: [5, 4, 4, 5, 3, 4, 4, 5, 3, 4, 3, 5, 3, 5, 3, 4, 4, 4],
        si:  [7, 3, 1, 11, 17, 9, 13, 5, 15, 10, 14, 6, 16, 2, 18, 4, 8, 12] },
      scores: {
        brian: [8, 7, 5, 8, 6, 8, 8, 6, 7, 7, 4, 7, 3, 7, 3, 7, 8, 7],
        mike : [7, 6, 6, 4, 6, 7, 5, 6, 7, 5, 4, 9, 5, 6, 7, 6, 8, 8],
        john : [8, 6, 5, 8, 6, 6, 6, 7, 5, 6, 4, 7, 4, 5, 4, 5, 6, 6],
        tj   : [6, 5, 8, 8, 6, 9, 6, 7, 4, 7, 6, 8, 4, 8, 4, 6, 5, 7],
      } },
    { id: "R5", playedAt: "2026-07-23T14:02:00-04:00", syncCode: "24K336",
      course: { id: "cascades", name: "Cascades Golf Club", location: "Hamburg, NJ", tee: "White", rating: 69, slope: 124,
        par: [4, 4, 4, 3, 4, 5, 4, 3, 5, 4, 4, 4, 3, 4, 5, 4, 3, 5],
        si:  [7, 5, 13, 17, 9, 1, 3, 15, 11, 8, 6, 14, 18, 10, 2, 4, 16, 12] },
      scores: {
        brian: [7, 7, 5, 6, 6, 6, 6, 4, 6, 4, 9, 6, 2, 6, 6, 6, 6, 6],
        mike : [6, 8, 5, 4, 6, 7, 6, 5, 8, 7, 8, 5, 6, 7, 7, 7, 6, 6],
        john : [8, 8, 6, 5, 5, 8, 5, 2, 5, 6, 5, 4, 3, 5, 6, 6, 4, 6],
        tj   : [7, 5, 7, 5, 4, 7, 5, 4, 7, 5, 7, 4, 7, 6, 7, 7, 7, 6],
      } },
    { id: "R6", playedAt: "2026-07-24T08:36:00-04:00", syncCode: "34K336",
      course: { id: "blackbear", name: "Black Bear Golf Club", location: "Franklin, NJ", tee: "White", rating: 68.6, slope: 123,
        par: [4, 5, 4, 4, 3, 5, 3, 4, 4, 4, 3, 4, 5, 3, 4, 5, 4, 4],
        si:  [9, 11, 1, 5, 17, 13, 7, 15, 3, 8, 18, 4, 2, 16, 14, 12, 6, 10] },
      scores: {
        brian: [5, 9, 8, 7, 5, 8, 5, 4, 6, 6, 5, 5, 7, 4, 6, 5, 5, 6],
        mike : [5, 6, 9, 6, 3, 6, 5, 8, 5, 5, 6, 7, 9, 7, 6, 9, 5, 6],
        john : [7, 7, 6, 6, 4, 7, 3, 6, 5, 5, 5, 4, 6, 5, 3, 6, 7, 7],
        tj   : [7, 7, 5, 6, 4, 7, 6, 5, 8, 7, 4, 9, 9, 4, 5, 5, 6, 5],
      } },
  ];

  function _IS() { return (typeof window !== 'undefined' && window.IndexService) || IndexService; }
  function _SS() { return (typeof window !== 'undefined' && window.StatsService) || StatsService; }

  function _norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(); }

  function _initials(name) {
    const parts = String(name || '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name || '?').slice(0, 2).toUpperCase();
  }

  // Roster player for a tournament id: an explicit egtId link wins; otherwise
  // the full name or first name must match one alias (or the name the round
  // was scored under). Ambiguous (two roster Mikes) → no match, never a guess.
  function matchRoster(players, egtPlayers) {
    const roster = (players || []).filter(p => p && p.id != null);
    const extra = {};
    (egtPlayers || []).forEach(ep => { if (ep && ep.id) extra[ep.id] = _norm(ep.name); });
    const ids = Object.keys(PLAYERS).concat(Object.keys(extra).filter(id => !PLAYERS[id]));
    const map = {};
    const taken = new Set();
    ids.forEach(egtId => {
      const linked = roster.filter(p => p.egtId === egtId);
      if (linked.length === 1) { map[egtId] = linked[0].id; taken.add(linked[0].id); return; }
      const aliases = new Set(((PLAYERS[egtId] && PLAYERS[egtId].aliases) || []).concat(extra[egtId] ? [extra[egtId]] : []));
      const hits = roster.filter(p => {
        if (taken.has(p.id)) return false;
        const full = _norm(p.name);
        return aliases.has(full) || aliases.has(full.split(' ')[0]);
      });
      if (hits.length === 1) { map[egtId] = hits[0].id; taken.add(hits[0].id); }
    });
    return map;
  }

  function _course(c) {
    return {
      id: 'egt_' + c.id,
      name: c.name,
      location: c.location,
      rating: c.rating,
      slope: c.slope,
      tees: [{ id: c.tee, name: c.tee, rating: c.rating, slope: c.slope, yds: null, rated: true }],
      holes: c.par.map((par, i) => ({ num: i + 1, par, hdcp: c.si[i] })),
    };
  }

  function _roundId(r) { return 'egt-' + TRIP_ID + '-' + r.id; }

  // Saved-round snapshots (pp_round_snap_<code> shape) keyed by roster ids.
  function importRounds(map, rosterById) {
    const byId = rosterById || {};
    return ROUNDS.map(r => {
      const pids = Object.keys(r.scores).filter(pid => map[pid] != null);
      if (!pids.length) return null;
      const savedAt = Date.parse(r.playedAt);
      const players = pids.map((pid, i) => {
        const rp = byId[map[pid]] || {};
        const name = rp.name || PLAYERS[pid].name;
        return {
          id: map[pid], name,
          handicap: PLAYERS[pid].indexAtPlay,
          initials: rp.initials || _initials(name),
          color: rp.color || PALETTE[i % PALETTE.length],
        };
      });
      const scores = {};
      pids.forEach(pid => { scores[map[pid]] = r.scores[pid].slice(); });
      return {
        round: {
          id: _roundId(r),
          name: r.id + ' · ' + r.course.name,
          syncCode: r.syncCode,
          tripId: TRIP_ID,
          tripName: TRIP_NAME,
          course: _course(r.course),
          teeId: r.course.tee,
          startingTee: 1,
          players,
          formats: [],
          games: [],
          imported: 'egt-2026',
          date: new Date(savedAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        },
        scores,
        putts: {}, firData: {}, girData: {}, extraStats: {}, dropouts: {},
        savedAt,
      };
    }).filter(Boolean);
  }

  function _meta(snap) {
    const r = snap.round;
    return {
      courseName: r.course.name,
      date: new Date(snap.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      players: r.players.length,
      formats: 'EGT 2026 Cup',
      syncCode: r.syncCode,
      tripId: TRIP_ID,
      tripName: TRIP_NAME,
      savedAt: snap.savedAt,
    };
  }

  function _read(ls, key, fallback) {
    try { const raw = ls && ls.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }

  // Load the six rounds for every roster player that matches. Writes missing
  // snapshots + recent-round entries, then posts each player's rounds to the
  // PlayPal Index (oldest first). `complete` is true once all four tournament
  // players are matched, after which callers can stop re-running it.
  function apply(players, ls) {
    const roster = Array.isArray(players) ? players : [];
    const map = matchRoster(roster);
    const matched = Object.keys(map);
    const rosterById = {};
    roster.forEach(p => { rosterById[p.id] = p; });
    const snaps = importRounds(map, rosterById);

    if (ls) {
      snaps.forEach(s => {
        const key = 'pp_round_snap_' + s.round.syncCode;
        try { if (!ls.getItem(key)) ls.setItem(key, JSON.stringify(s)); } catch (e) { /* storage full — index still posts */ }
      });
      if (snaps.length) {
        const recent = _read(ls, 'pp_recent', []);
        const have = new Set(recent.map(r => r && r.syncCode));
        const add = snaps.filter(s => !have.has(s.round.syncCode)).map(_meta);
        if (add.length) {
          const next = recent.concat(add).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).slice(0, 20);
          try { ls.setItem('pp_recent', JSON.stringify(next)); } catch (e) { /* non-fatal */ }
        }
      }
    }

    const SS = _SS(), IS = _IS();
    const data = snaps.map(s => SS.roundDataFromSnapshot(s)).filter(Boolean);
    const posted = {};
    let changed = false;
    const next = roster.map(p => {
      const egtId = matched.find(k => map[k] === p.id);
      if (!egtId) return p;
      const before = (p.ppDifferentials || []).length;
      let q = IS.rebuildFromHistory(p, data);
      if (!q.egtId) q = { ...q, egtId };
      const after = (q.ppDifferentials || []).length;
      posted[p.id] = after - before;
      if (after !== before || q.egtId !== p.egtId || q.ppIndex !== p.ppIndex || q.handicap !== p.handicap) changed = true;
      return q;
    });
    return { players: next, changed, complete: matched.length === Object.keys(PLAYERS).length, matched: map, posted };
  }

  // A finished live EGT round: post it to each matched roster player's index
  // and build a history snapshot under roster ids. `round` is the native round
  // EgtBridge built (players carry tournament ids + the index at play).
  //   payload — what ScoreEntry hands onSaveRound: { scores, putts, firData,
  //             girData, extraStats } keyed by tournament id.
  function postEgtRound(players, round, payload, savedAt) {
    const roster = Array.isArray(players) ? players : [];
    const out = { players: roster, changed: false, snapshot: null, updates: {} };
    const p0 = payload || {};
    const scores = p0.scores || {};
    if (!round || !round.course || !Array.isArray(round.players)) return out;
    const map = matchRoster(roster, round.players);
    const rosterById = {};
    roster.forEach(p => { rosterById[p.id] = p; });
    const pids = round.players.map(p => p.id).filter(pid => map[pid] != null && Array.isArray(scores[pid]));
    if (!pids.length) return out;

    const remap = (obj) => {
      const o = {};
      pids.forEach(pid => { if (obj && obj[pid] !== undefined) o[map[pid]] = obj[pid]; });
      return o;
    };
    const mapped = remap(scores);
    const snapshot = {
      round: {
        ...round,
        players: round.players.filter(p => pids.includes(p.id)).map(p => {
          const rp = rosterById[map[p.id]] || {};
          return { ...p, id: map[p.id], name: rp.name || p.name, initials: rp.initials || p.initials, color: rp.color || p.color };
        }),
        // Tournament games key on tournament ids and settle in the Cup, not
        // here — the history copy is the scorecard only.
        formats: [],
        games: [],
        date: new Date(savedAt || Date.now()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      },
      scores: mapped,
      putts: remap(p0.putts), firData: remap(p0.firData), girData: remap(p0.girData),
      extraStats: remap(p0.extraStats), dropouts: {},
      savedAt: savedAt || Date.now(),
    };
    out.snapshot = snapshot;

    const IS = _IS();
    const data = _SS().roundDataFromSnapshot(snapshot);
    out.players = roster.map(p => {
      if (!(p.id in mapped)) return p;
      const rep = IS.postRoundReport(p, data);
      out.updates[p.id] = IS.summarize(rep);
      if (!rep.posted) return p;
      out.changed = true;
      const egtId = pids.find(pid => map[pid] === p.id);
      return rep.player.egtId ? rep.player : { ...rep.player, egtId };
    });
    return out;
  }

  function isDone(ls) {
    try { return !!ls && ls.getItem(DONE_KEY) === '1'; } catch (e) { return false; }
  }
  function markDone(ls) {
    try { if (ls) ls.setItem(DONE_KEY, '1'); } catch (e) { /* non-fatal */ }
  }

  return {
    TRIP_ID, DONE_KEY, PLAYERS, ROUNDS,
    matchRoster, importRounds, apply, postEgtRound, isDone, markDone,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { HistoryImport });
}
