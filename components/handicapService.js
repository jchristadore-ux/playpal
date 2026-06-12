// handicapService.js — World Handicap System math + optional sync providers.
//
// Pure calculation core (testable in Node) plus a provider registry so a real
// handicap network (e.g. GHIN, where permitted) can plug in later. With no
// provider registered every call degrades gracefully and indexes stay manual.
//
// Glossary:
//   Handicap Index (HI)    — the player's portable number (player.handicap)
//   Course Handicap (CH)   — HI × (Slope ÷ 113) + (Course Rating − Par)
//   Playing Handicap (PH)  — CH × format allowance %
//   Strokes                — PH distributed across holes by stroke index

const HandicapService = (function () {

  const MIN_INDEX = -10;   // "+10" plus handicap
  const MAX_INDEX = 54;    // WHS maximum

  function clampIndex(index) {
    const n = parseFloat(index);
    if (isNaN(n)) return 0;
    return Math.min(MAX_INDEX, Math.max(MIN_INDEX, n));
  }

  // CH = HI × (Slope ÷ 113) + (CR − Par). For 9-hole rounds the WHS uses half
  // the index against the 9-hole rating/par the caller supplies.
  function courseHandicap(index, slope, rating, par, holeCount) {
    const hi = clampIndex(index) * (holeCount === 9 ? 0.5 : 1);
    const sl = slope > 0 ? slope : 113;
    const cr = typeof rating === 'number' && rating > 0 ? rating : par;
    return hi * (sl / 113) + (cr - par);
  }

  function playingHandicap(ch, allowancePct) {
    const pct = (typeof allowancePct === 'number' && allowancePct >= 0) ? allowancePct : 100;
    return ch * (pct / 100);
  }

  // WHS rounds to the nearest whole number, .5 upward.
  function roundHandicap(x) { return Math.round(x); }

  // Hole positions ordered easiest-to-get-strokes first (stroke index 1 = hardest).
  function _rankByStrokeIndex(holes) {
    return holes
      .map((h, i) => ({ i, hdcp: h.hdcp || (i + 1) }))
      .sort((a, b) => a.hdcp - b.hdcp || a.i - b.i)
      .map(x => x.i);
  }

  // Distributes a rounded playing handicap across holes by stroke index.
  // Positive: strokes received on the hardest holes first; > holes.length wraps
  // (a second stroke on the hardest holes). Negative (plus players): strokes
  // given back starting from the easiest hole.
  function allocateStrokes(playing, holes) {
    const n = holes.length;
    if (!n) return [];
    const h = Math.round(playing || 0);
    const arr = holes.map(() => 0);
    if (h === 0) return arr;
    const magnitude = Math.abs(h);
    const base = Math.floor(magnitude / n);
    const rem  = magnitude % n;
    const sign = h > 0 ? 1 : -1;
    const order = _rankByStrokeIndex(holes);
    if (sign < 0) order.reverse();
    if (base) for (let i = 0; i < n; i++) arr[i] = base * sign;
    for (let i = 0; i < rem; i++) arr[order[i]] += sign;
    return arr;
  }

  function netScore(gross, strokesReceived) {
    if (!gross) return 0;
    return Math.max(1, gross - (strokesReceived || 0));
  }

  // Computes per-player handicap details for a round.
  //   players  — round players ({ id, handicap })
  //   holes    — the holes being played (par + hdcp per hole)
  //   tee      — { rating, slope } (defaults neutralize the formula)
  //   opts     — { allowancePct=100, relative=false, overrides={pid:index} }
  // Returns { [pid]: { index, courseHcp, playing, rounded, strokes[] } }.
  // relative ("off the low ball") zeroes the lowest playing handicap and is the
  // norm for match-style games.
  function playingHandicaps(players, holes, tee, opts) {
    const o = opts || {};
    const par = holes.reduce((a, h) => a + (h.par || 0), 0);
    const holeCount = holes.length;
    const raw = players.map(p => {
      const idx = (o.overrides && o.overrides[p.id] !== undefined && o.overrides[p.id] !== null && o.overrides[p.id] !== '')
        ? clampIndex(o.overrides[p.id])
        : clampIndex(p.handicap || 0);
      const ch = courseHandicap(idx, tee?.slope, tee?.rating, par, holeCount);
      const ph = playingHandicap(ch, o.allowancePct);
      return { p, idx, ch, ph };
    });
    const minPh = o.relative && raw.length ? Math.min(...raw.map(r => r.ph)) : 0;
    const out = {};
    raw.forEach(r => {
      const effective = r.ph - minPh;
      const rounded = roundHandicap(effective);
      out[r.p.id] = {
        index:     r.idx,
        courseHcp: r.ch,
        playing:   effective,
        rounded,
        strokes:   allocateStrokes(rounded, holes),
      };
    });
    return out;
  }

  // Combines team members' course handicaps into one team playing handicap
  // using a weight per member, lowest CH first (e.g. [35,15] for a 2-person
  // scramble, [50,50] for foursomes, [60,40] for Chapman).
  function teamPlayingHandicap(memberCourseHcps, weightsPct) {
    const sorted = memberCourseHcps.slice().sort((a, b) => a - b);
    let total = 0;
    sorted.forEach((ch, i) => {
      const w = weightsPct[Math.min(i, weightsPct.length - 1)] || 0;
      total += ch * (w / 100);
    });
    return total;
  }

  // ── Provider registry (GHIN-style sync, optional) ─────────────────────────
  // A provider implements { id, label, fetchIndex(player, cb(indexOrNull, err)) }.
  // None ship by default: a public client has no place to keep credentials, so
  // until a permitted integration is configured the app reports "not connected"
  // and handicap indexes remain manually editable.
  const _providers = [];

  function registerProvider(provider) {
    if (!provider || !provider.id || typeof provider.fetchIndex !== 'function') {
      throw new Error('HandicapService provider needs { id, fetchIndex }');
    }
    if (!_providers.some(p => p.id === provider.id)) _providers.push(provider);
  }

  function providerAvailable() { return _providers.length > 0; }

  function fetchIndex(player, cb) {
    if (!_providers.length) {
      cb && cb(null, 'No handicap service connected');
      return;
    }
    _providers[0].fetchIndex(player, function (index, err) {
      if (index === null || index === undefined || isNaN(parseFloat(index))) {
        cb && cb(null, err || 'Handicap lookup failed');
        return;
      }
      cb && cb(clampIndex(index), null);
    });
  }

  return {
    MIN_INDEX, MAX_INDEX,
    clampIndex,
    courseHandicap,
    playingHandicap,
    roundHandicap,
    allocateStrokes,
    netScore,
    playingHandicaps,
    teamPlayingHandicap,
    registerProvider,
    providerAvailable,
    fetchIndex,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { HandicapService });
}
