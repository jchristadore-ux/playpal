// indexService.js — the PlayPal Index: an unofficial, WHS-style handicap
// computed entirely on-device from rounds the group scores in PlayPal.
//
// An unofficial index built from your PlayPal rounds — WHS-style math, but not
// a USGA Handicap Index and not valid for official competition.
//
// Pure functions only (no storage, no network) so everything is testable in
// Node. Course handicap and stroke allocation come from HandicapService — the
// math is never re-derived here.
//
//   roundDifferential(roundData, pid) → { postable, reason, differential, ags, … }
//   computeIndex(differentials)       → { index, used, count, adjustment, usedKeys }
//   applyCaps(index, lowIndex365)     → capped index (soft 3.0 / hard 5.0)
//   postRound(player, roundData)      → NEW player object (deduped, ≤20 kept)
//   postRoundReport(player, roundData)→ { player, before, after, result, posted }
//   rebuildFromHistory(player, list)  → player rebuilt from scratch (migration)

const IndexService = (function () {

  const MAX_DIFFS = 20;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const CAPS_ENABLED = true;           // flip off to disable soft/hard cap
  const SOFT_CAP = 3.0;
  const HARD_CAP = 5.0;
  const DISCLAIMER = 'An unofficial index built from your PlayPal rounds — WHS-style math, but not a USGA Handicap Index and not valid for official competition.';

  const INDEX_DEFAULTS = {
    ppIndex: null,
    ppIndexUpdatedAt: null,
    ppIndexMode: 'auto',
    ppLowIndex365: null,
    ppLowIndex365At: null,
    ppDifferentials: [],
  };

  function _HS() { return (typeof window !== 'undefined' && window.HandicapService) || HandicapService; }

  function _num(v) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  function round1(x) { return Math.round(x * 10) / 10; }
  // Truncate (toward zero) to one decimal. toFixed(6) first so float noise
  // like 118.99999999 doesn't truncate a real 11.9 down to 11.8.
  function trunc1(x) { return Math.trunc(Number((x * 10).toFixed(6))) / 10; }

  function _dropoutThru(dropouts, pid) {
    if (typeof window !== 'undefined' && typeof window.dropoutThru === 'function') return window.dropoutThru(dropouts, pid);
    const d = dropouts && dropouts[pid];
    if (d === null || d === undefined) return null;
    const n = typeof d === 'object' ? Number(d.thru) : Number(d);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  }

  // The tee actually played, with its REAL rating/slope or null. Never invents
  // numbers: CourseService.normalizeCourse fills 72/113 placeholders, so this
  // reads the raw course. Custom courses saved before tees carried a `rated`
  // flag stored 72.0/113 when the fields were left blank — that exact pair on a
  // custom course is treated as "no rating" (documented heuristic).
  function teeRating(course, teeId) {
    if (!course) return null;
    const tees = Array.isArray(course.tees) ? course.tees : [];
    const tee = tees.find(t => t && t.id === teeId) || tees[0] || null;
    if (tee && tee.rated === false) return null;
    const rating = _num(tee && tee.rating) || _num(course.rating);
    const slope = _num(tee && tee.slope) || _num(course.slope);
    if (!(rating > 0) || !(slope > 0)) return null;
    if (course.custom && !(tee && tee.rated === true) && rating === 72 && slope === 113) return null;
    return { rating, slope, teeName: (tee && tee.name) || 'Standard', teeId: (tee && tee.id) || null };
  }

  function _playOrder(n, startingTee) {
    if (n === 18 && startingTee === 10) return [9, 10, 11, 12, 13, 14, 15, 16, 17, 0, 1, 2, 3, 4, 5, 6, 7, 8];
    return Array.from({ length: n }, (_, i) => i);
  }

  function _playerIndexAtPlay(roundData, pid, fallback) {
    const p = (roundData.players || []).find(x => x && x.id === pid);
    const v = _num(p && p.handicap);
    if (v !== null) return v;
    return _num(fallback) || 0;
  }

  // Step 1 — Adjusted Gross Score (net double bogey): each hole capped at
  // par + 2 + strokes received (100% course handicap, NOT off the low ball).
  function adjustedGross(holes, grossArr, courseHcp) {
    const HS = _HS();
    const strokes = HS.allocateStrokes(HS.roundHandicap(courseHcp), holes);
    let gross = 0, ags = 0;
    const perHole = holes.map((h, i) => {
      const g = grossArr[i];
      const max = (h.par || 4) + 2 + (strokes[i] || 0);
      const capped = Math.min(g, max);
      gross += g; ags += capped;
      return { gross: g, max, capped, strokes: strokes[i] || 0 };
    });
    return { gross, ags, perHole, strokes };
  }

  // Step 2 — Score Differential = (113 / slope) × (AGS − rating), 1 decimal.
  // No PCC (playing conditions calculation): PlayPal has no field-wide
  // scoring data for the day, so PCC is always treated as 0.
  function scoreDifferential(ags, rating, slope) {
    return round1((113 / slope) * (ags - rating));
  }

  // Steps 1–3 + 6 for one player in one round.
  function roundDifferential(roundData, pid, opts) {
    const o = opts || {};
    const d = roundData || {};
    const course = d.course;
    if (!course || !Array.isArray(course.holes) || !course.holes.length) return { postable: false, reason: 'no-course' };
    const holes = course.holes;
    const layout = (course.holeCount === 9 || holes.length === 9) ? 9 : 18;
    const tee = teeRating(course, d.teeId);
    const grossArr = ((d.scores || {})[pid] || []).map(v => (typeof v === 'number' && v > 0 ? v : 0));
    const order = _playOrder(holes.length, d.startingTee);
    const thru = _dropoutThru(d.dropouts, pid);
    const inPlay = (i) => thru === null || order.indexOf(i) < thru;
    const scoredIdx = order.filter(i => grossArr[i] > 0 && inPlay(i));

    if (thru !== null && thru < 9) return { postable: false, reason: 'walked-in-before-9', holesPlayed: scoredIdx.length };
    if (scoredIdx.length < 9) return { postable: false, reason: 'fewer-than-9-holes', holesPlayed: scoredIdx.length };
    if (!tee) return { postable: false, reason: 'no-course-rating', holesPlayed: scoredIdx.length };

    const HS = _HS();
    const index = _playerIndexAtPlay(d, pid, o.fallbackIndex);
    let used, rating, holesCount, estimated;
    if (layout === 18 && scoredIdx.length === 18) {
      used = Array.from({ length: 18 }, (_, i) => i);
      rating = tee.rating; holesCount = 18; estimated = false;
    } else if (layout === 9) {
      // 9-hole layout: the tee's 9-hole rating/slope, doubled below.
      used = order.slice(0, 9).filter(i => grossArr[i] > 0 && inPlay(i));
      if (used.length < 9) return { postable: false, reason: 'fewer-than-9-holes', holesPlayed: used.length };
      rating = tee.rating; holesCount = 9; estimated = true;
    } else {
      // 18-hole layout, only 9+ holes finished: the front or back nine if one
      // is complete, else the first nine played. Rating/2 with the same slope.
      const front = [0, 1, 2, 3, 4, 5, 6, 7, 8], back = [9, 10, 11, 12, 13, 14, 15, 16, 17];
      const ok = (set) => set.every(i => grossArr[i] > 0 && inPlay(i));
      used = ok(front) ? front : ok(back) ? back : scoredIdx.slice(0, 9);
      rating = tee.rating / 2; holesCount = 9; estimated = true;
    }
    const subHoles = used.map(i => holes[i]);
    const subGross = used.map(i => grossArr[i]);
    const par = subHoles.reduce((a, h) => a + (h.par || 4), 0);
    // 9-hole course handicap: HandicapService halves the index for holeCount 9.
    const ch = HS.courseHandicap(index, tee.slope, rating, par, holesCount);
    const adj = adjustedGross(subHoles, subGross, ch);
    let differential = scoreDifferential(adj.ags, rating, tee.slope);
    // Step 3 — Simplification of the WHS 9-hole rule: rather than pairing two
    // 9-hole scores (or adding an expected-score nine), a 9-hole differential
    // is doubled to an 18-hole equivalent and tagged `estimated`.
    if (holesCount === 9) differential = round1(differential * 2);
    return {
      postable: true, reason: null,
      differential, ags: adj.ags, gross: adj.gross,
      holes: holesCount, estimated,
      rating,
      slope: tee.slope, teeName: tee.teeName, courseHcp: ch, indexAtPlay: index,
      holesUsed: used, perHole: adj.perHole,
    };
  }

  // Step 4 — lowest-N table (product spec, verbatim).
  function _tableRow(n) {
    if (n < 3) return null;
    if (n === 3) return { use: 1, adjustment: -2.0 };
    if (n === 4) return { use: 1, adjustment: -1.0 };
    if (n === 5) return { use: 1, adjustment: 0 };
    if (n === 6) return { use: 2, adjustment: -1.0 };
    if (n <= 8) return { use: 2, adjustment: 0 };
    if (n <= 11) return { use: 3, adjustment: 0 };
    if (n <= 14) return { use: 4, adjustment: 0 };
    if (n <= 16) return { use: 5, adjustment: 0 };
    if (n <= 18) return { use: 6, adjustment: 0 };
    if (n === 19) return { use: 7, adjustment: 0 };
    return { use: 8, adjustment: 0 };
  }

  function _key(d) { return d && (d.roundId != null && d.roundId !== '' ? 'r:' + d.roundId : 'c:' + d.syncCode); }

  // differentials: newest first. Uses the most recent 20.
  function computeIndex(differentials) {
    const recent = (differentials || []).filter(d => d && typeof d.differential === 'number').slice(0, MAX_DIFFS);
    const count = recent.length;
    const row = _tableRow(count);
    if (!row) return { index: null, used: 0, count, adjustment: 0, usedKeys: [], needed: 3 - count };
    const sorted = recent.map((d, pos) => ({ d, pos })).sort((a, b) => a.d.differential - b.d.differential || a.pos - b.pos);
    const low = sorted.slice(0, row.use);
    const avg = low.reduce((a, x) => a + x.d.differential, 0) / row.use;
    const HS = _HS();
    const index = HS.clampIndex(trunc1(avg + row.adjustment));
    return { index, used: row.use, count, adjustment: row.adjustment, usedKeys: low.map(x => _key(x.d)), needed: 0 };
  }

  // Step 5 — soft cap / hard cap against the lowest index held in 365 days.
  function applyCaps(index, lowIndex365) {
    if (!CAPS_ENABLED || index === null || lowIndex365 === null || lowIndex365 === undefined) return index;
    const inc = index - lowIndex365;
    if (inc <= SOFT_CAP) return index;
    const capped = Math.min(HARD_CAP, SOFT_CAP + (inc - SOFT_CAP) / 2);
    return trunc1(lowIndex365 + capped);
  }

  function normalize(player) {
    if (!player) return player;
    const out = { ...INDEX_DEFAULTS, ...player };
    if (!Array.isArray(out.ppDifferentials)) out.ppDifferentials = [];
    if (out.ppIndexMode !== 'manual') out.ppIndexMode = 'auto';
    return out;
  }

  function _playedAt(roundData) {
    const s = _num(roundData && roundData.savedAt);
    if (s) return s;
    const t = roundData && roundData.date ? Date.parse(roundData.date) : NaN;
    return Number.isFinite(t) ? t : Date.now();
  }

  function _roundKey(roundData) {
    const rid = roundData && roundData.roundId;
    if (rid !== undefined && rid !== null && rid !== '') return 'r:' + rid;
    const sc = roundData && roundData.syncCode;
    return sc ? 'c:' + sc : null;
  }

  function _already(player, roundData) {
    const rid = roundData && roundData.roundId;
    const sc = roundData && roundData.syncCode;
    return (player.ppDifferentials || []).some(d =>
      (rid !== undefined && rid !== null && rid !== '' && d.roundId !== undefined && d.roundId !== null && String(d.roundId) === String(rid)) ||
      (sc && d.syncCode && d.syncCode === sc));
  }

  function postRoundReport(player, roundData, opts) {
    const base = normalize(player);
    const before = { index: base.ppIndex, count: base.ppDifferentials.length };
    if (!base || !roundData) return { player: base, before, after: before, result: { postable: false, reason: 'no-round' }, posted: false };
    const result = roundDifferential(roundData, base.id, { fallbackIndex: base.handicap });
    if (!result.postable) return { player: base, before, after: before, result, posted: false };
    if (!_roundKey(roundData)) return { player: base, before, after: before, result: { ...result, postable: false, reason: 'no-round-id' }, posted: false };
    if (_already(base, roundData)) return { player: base, before, after: before, result: { ...result, duplicate: true }, posted: false };

    const playedAt = _playedAt(roundData);
    const rec = {
      roundId: roundData.roundId !== undefined && roundData.roundId !== null ? roundData.roundId : (roundData.syncCode || null),
      syncCode: roundData.syncCode || null,
      playedAt,
      courseName: (roundData.course && roundData.course.name) || '',
      teeName: result.teeName,
      holes: result.holes,
      gross: result.gross,
      ags: result.ags,
      rating: result.rating,
      slope: result.slope,
      differential: result.differential,
      estimated: !!result.estimated,
    };
    const diffs = [rec, ...base.ppDifferentials]
      .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0))
      .slice(0, MAX_DIFFS);
    const now = (opts && opts.now) || Math.max(Date.now(), playedAt);
    const lowValid = base.ppLowIndex365 !== null && base.ppLowIndex365 !== undefined
      && (!base.ppLowIndex365At || now - base.ppLowIndex365At <= 365 * DAY_MS);
    const low = lowValid ? base.ppLowIndex365 : null;
    const calc = computeIndex(diffs);
    const index = calc.index === null ? null : applyCaps(calc.index, low);
    let nextLow = low, nextLowAt = lowValid ? base.ppLowIndex365At : null;
    if (index !== null && (nextLow === null || index <= nextLow)) { nextLow = index; nextLowAt = playedAt; }
    const next = {
      ...base,
      ppDifferentials: diffs,
      ppIndex: index,
      ppIndexUpdatedAt: now,
      ppLowIndex365: nextLow,
      ppLowIndex365At: nextLowAt,
    };
    // Auto mode: the PlayPal Index drives the handicap every game reads.
    if (next.ppIndexMode === 'auto' && index !== null) {
      next.handicap = index;
      next.handicapSource = 'playpal';
      next.handicapUpdatedAt = now;
    }
    return { player: next, before, after: { index, count: diffs.length, calc }, result, posted: true };
  }

  function postRound(player, roundData, opts) {
    return postRoundReport(player, roundData, opts).player;
  }

  // Rebuild a player's history from saved rounds (any order in; posted oldest
  // first so caps and the 365-day low replay in time order). Idempotent and
  // additive: differentials already on the player (posted on another device)
  // are kept, and postRound's roundId/syncCode dedupe means running it twice
  // changes nothing.
  function rebuildFromHistory(player, dataList, opts) {
    let p = normalize(player);
    if (!p) return p;
    const list = (dataList || []).filter(Boolean).slice()
      .sort((a, b) => _playedAt(a) - _playedAt(b));
    list.forEach(d => {
      if (!(d.scores && d.scores[p.id] && d.scores[p.id].some(v => v > 0))) return;
      p = postRound(p, d, opts);
    });
    return p;
  }

  const REASON_TEXT = {
    'no-course-rating': 'no course rating for these tees — index unchanged',
    'fewer-than-9-holes': 'fewer than 9 holes scored — index unchanged',
    'walked-in-before-9': 'walked in before 9 holes — index unchanged',
    'no-course': 'no course on this round — index unchanged',
    'no-round-id': 'round has no id — index unchanged',
    'no-round': 'round not found — index unchanged',
  };
  function reasonText(reason) { return REASON_TEXT[reason] || 'round did not post — index unchanged'; }

  function _signedDelta(d) {
    const v = round1(d);
    if (v === 0) return '±0.0';
    return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1);
  }

  // Plain summary of one player's post-round index update, shared by the
  // summary screen and the emailed/shared round report so they never disagree.
  //   rep = postRoundReport(...) output. Returns
  //   { posted, headline, detail, differential, before, after, count, reason }
  function summarize(rep) {
    const r = rep || {};
    const res = r.result || {};
    const before = r.before ? r.before.index : null;
    const after = r.after ? r.after.index : null;
    const count = r.after ? r.after.count : 0;
    const mode = r.player && r.player.ppIndexMode === 'manual' ? 'manual' : 'auto';
    const out = { posted: !!r.posted, differential: res.differential, before, after, count, reason: res.reason || null,
      duplicate: !!res.duplicate, estimated: !!res.estimated, holes: res.holes || null, mode };
    if (res.duplicate) {
      out.headline = fmtIndex(before);
      out.detail = 'already counted — index unchanged';
      return out;
    }
    if (!r.posted) {
      out.headline = fmtIndex(before);
      out.detail = reasonText(res.reason);
      return out;
    }
    const diffTxt = 'differential ' + res.differential.toFixed(1) + (res.estimated ? ' (9-hole, estimated)' : '');
    if (after === null) {
      out.headline = count + ' of 3 rounds to your first index';
      out.detail = diffTxt;
      return out;
    }
    out.headline = before === null
      ? 'First index: ' + fmtIndex(after)
      : fmtIndex(before) + ' → ' + fmtIndex(after) + ' (' + _signedDelta(after - before) + ')';
    out.detail = diffTxt + (mode === 'manual' ? ' · manual handicap kept' : '');
    return out;
  }

  function fmtIndex(v) {
    if (v === null || v === undefined) return '—';
    return v < 0 ? '+' + Math.abs(v).toFixed(1) : v.toFixed(1);
  }

  return {
    MAX_DIFFS, CAPS_ENABLED, SOFT_CAP, HARD_CAP, DISCLAIMER, INDEX_DEFAULTS,
    round1, trunc1, teeRating, adjustedGross, scoreDifferential,
    roundDifferential, computeIndex, applyCaps, normalize,
    postRound, postRoundReport, rebuildFromHistory,
    reasonText, fmtIndex, summarize,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { IndexService });
}
