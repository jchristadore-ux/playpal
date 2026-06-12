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

  return {
    SNAP_PREFIX,
    getSnapshot,
    listRoundData,
    unfinishedRound,
    deleteSnapshot,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { RoundHistoryService });
}
