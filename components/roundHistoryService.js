// roundHistoryService.js — saved-round access, resume detection, comparisons.
//
// Completed rounds already persist as local snapshots (pp_round_snap_<CODE>)
// and as metas in pp_recent; this service is the single read path over both
// so screens stop poking localStorage directly.

const RoundHistoryService = (function () {

  const SNAP_PREFIX = 'pp_round_snap_';

  function _ls() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }

  function getSnapshot(syncCode) {
    const ls = _ls();
    if (!ls || !syncCode) return null;
    try {
      const raw = ls.getItem(SNAP_PREFIX + syncCode);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // Every locally saved completed round, newest first, as normalized
  // round-data records ready for StatsService.
  function listRoundData() {
    const ls = _ls();
    if (!ls) return [];
    const SS = (typeof window !== 'undefined' && window.StatsService) || StatsService;
    const out = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key || key.indexOf(SNAP_PREFIX) !== 0) continue;
      try {
        const snap = JSON.parse(ls.getItem(key));
        const data = SS.roundDataFromSnapshot(snap);
        if (data) out.push(data);
      } catch (e) { /* corrupt snapshot — skip */ }
    }
    out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return out;
  }

  // An in-progress round the user can pick back up: pp_round exists and no
  // completed snapshot has been written for its sync code yet.
  function unfinishedRound() {
    const ls = _ls();
    if (!ls) return null;
    try {
      const raw = ls.getItem('pp_round');
      if (!raw) return null;
      const round = JSON.parse(raw);
      if (!round || !round.course) return null;
      if (round.syncCode && ls.getItem(SNAP_PREFIX + round.syncCode)) return null; // finished
      const scoresRaw = round.id ? ls.getItem('pp_scores_' + round.id) : null;
      let holesScored = 0;
      if (scoresRaw) {
        const scores = JSON.parse(scoresRaw);
        const holeCount = (round.course.holes || []).length || 18;
        for (let i = 0; i < holeCount; i++) {
          if (round.players.some(p => scores[p.id] && scores[p.id][i])) holesScored++;
        }
      }
      return { round, holesScored };
    } catch (e) { return null; }
  }

  function deleteSnapshot(syncCode) {
    const ls = _ls();
    if (!ls || !syncCode) return;
    try { ls.removeItem(SNAP_PREFIX + syncCode); } catch (e) { /* non-fatal */ }
  }

  // ── Cloud history ─────────────────────────────────────────────────────────
  // Snapshots are written on the device that scored the round. Another device
  // in the same group (a new phone, the home-screen app vs. Safari, a fresh
  // sign-in) only receives the round's saved_rounds meta, so Stats and round
  // history were empty there. The finished round itself is in the group's
  // round doc ({ round: completedRound, liveScores }), so rebuild the local
  // snapshot from it.
  function _obj(v) { return v && typeof v === 'object' ? v : {}; }

  function snapshotFromCloudDoc(doc, meta) {
    if (!doc || !doc.round || !doc.round.course || !Array.isArray(doc.round.players)) return null;
    const r = doc.round;
    const live = _obj(doc.liveScores);
    let scores = live.scores && typeof live.scores === 'object' && Object.keys(live.scores).length ? live.scores : null;
    if (!scores && r.holeScores && typeof r.holeScores === 'object') {
      scores = {};
      Object.keys(r.holeScores).forEach(pid => {
        const arr = r.holeScores[pid];
        if (Array.isArray(arr)) scores[pid] = arr.map(h => (h && typeof h.strokes === 'number') ? h.strokes : 0);
      });
    }
    if (!scores || !Object.keys(scores).length) return null;
    return {
      round:         r,
      scores,
      wolfData:      _obj(live.wolfData),
      putts:         Object.keys(_obj(live.putts)).length ? live.putts : _obj(r.putts),
      nassauPresses: [],
      popFlags:      _obj(live.popFlags),
      bbbData:       _obj(live.bbbData),
      teeBallData:   _obj(live.teeBallData),
      firData:       Object.keys(_obj(live.firData)).length ? live.firData : _obj(r.firData),
      girData:       Object.keys(_obj(live.girData)).length ? live.girData : _obj(r.girData),
      extraStats:    Object.keys(_obj(live.extraStats)).length ? live.extraStats : _obj(r.extraStats),
      dropouts:      _obj(r.dropouts),
      savedAt:       (meta && meta.savedAt) || doc.savedAt || Date.now(),
      fromCloud:     true,
    };
  }

  // Saved-round metas whose snapshot this device does not have.
  function missingSnapshotCodes(metas) {
    const ls = _ls();
    if (!ls) return [];
    const out = [];
    (metas || []).forEach(m => {
      const code = m && m.syncCode;
      if (!code || !/^[A-Z0-9]{4,12}$/.test(String(code))) return;
      if (ls.getItem(SNAP_PREFIX + code)) return;
      if (out.indexOf(code) === -1) out.push(code);
    });
    return out;
  }

  // fetchDocs(codes, cb(docs)) — RoundSyncService.fetchDocs. cb(n) receives how
  // many snapshots were written. Never overwrites a snapshot that exists.
  function hydrateFromCloud(metas, fetchDocs, cb) {
    const done = (n) => { try { cb && cb(n); } catch (e) { /* non-fatal */ } };
    const codes = missingSnapshotCodes(metas);
    if (!codes.length || typeof fetchDocs !== 'function') { done(0); return; }
    const byCode = {};
    (metas || []).forEach(m => { if (m && m.syncCode) byCode[m.syncCode] = m; });
    fetchDocs(codes, function (docs) {
      const ls = _ls();
      let n = 0;
      (docs || []).forEach(d => {
        const code = d && (d.syncCode || (d.round && d.round.syncCode));
        if (!code || !ls || ls.getItem(SNAP_PREFIX + code)) return;
        const snap = snapshotFromCloudDoc(d, byCode[code]);
        if (!snap) return;
        try { ls.setItem(SNAP_PREFIX + code, JSON.stringify(snap)); n++; } catch (e) { /* storage full */ }
      });
      done(n);
    });
  }

  return {
    SNAP_PREFIX,
    getSnapshot,
    listRoundData,
    unfinishedRound,
    deleteSnapshot,
    snapshotFromCloudDoc,
    missingSnapshotCodes,
    hydrateFromCloud,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { RoundHistoryService });
}
