// egtBridge.js — connects the EGT tournament model to PlayPal's native round
// scorer (ScoreEntry). It builds a normal `round` object from a seed round so
// the user scores an EGT round exactly like any other (hole-by-hole keypad,
// live scorecard, putts/FIR/GIR, Wolf/BBB trackers, cross-device sync), then
// translates those native scores back into the EGT store when the round is
// finalized so the Cup standings/money recompute.
//
// The native scorer stays the source of truth for raw scoring; the EGT engine
// owns all tournament math and recomputes pops itself, so the on-screen pop
// dots (native, full-handicap) may differ from the EGT per-game allocation —
// the standings are always driven by the EGT engine, not the native display.

const EgtBridge = (function () {
  const PALETTE = ['#15803D', '#C8A15A', '#2563EB', '#DC2626', '#7C3AED', '#0891B2'];

  function initialsFor(name) {
    const parts = String(name || '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name || '?').slice(0, 2).toUpperCase();
  }

  // A stable native round id per EGT round, so ScoreEntry's localStorage keys
  // (pp_scores_<id>, …) persist and a re-open resumes the same round.
  function nativeRoundId(model, roundId) {
    return `egt-${model.trip.id}-${roundId}`;
  }

  // Deterministic 6-char sync code from trip+round so re-opens share the room.
  function syncCodeFor(model, roundId) {
    const base = `${model.trip.id}-${roundId}`;
    let h = 0;
    for (let i = 0; i < base.length; i++) { h = (h * 31 + base.charCodeAt(i)) >>> 0; }
    const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) { code += alpha[h % alpha.length]; h = Math.floor(h / alpha.length) + 7; }
    return code;
  }

  // Native format trackers to surface per round (skins runs every round).
  const FORMATS_FOR = {
    R1: ['bingobangobongo', 'skins'],
    R2: ['nassau', 'skins'],
    R3: ['wolf', 'skins'],
    R4: ['stableford', 'skins'],
    R5: ['skins'],
    R6: ['stableford', 'skins'],
  };

  // Build a native `round` object from a seed round.
  function toNativeRound(model, roundId) {
    const round = model.rounds.find(r => r.id === roundId);
    const course = model.courses[round.courseId];
    const tee = course.tees.find(t => t.name === course.playedTee) || course.tees[0];
    const players = round.players.map((pid, i) => {
      const p = model.playersById[pid];
      return { id: p.id, name: p.name, handicap: p.handicapIndex, initials: initialsFor(p.name), color: PALETTE[i % PALETTE.length] };
    });
    const holes = course.holes.slice(0, 18).map((h, i) => ({
      num: h.hole, par: h.par, hdcp: (h.si == null ? i + 1 : h.si),
    }));
    return {
      id: nativeRoundId(model, roundId),
      egtRoundId: roundId,          // marker: this is an EGT tournament round
      egtTripId: model.trip.id,
      tripId: model.trip.id,
      name: `${round.id} · ${course.name}`,
      players,
      course: { id: course.courseId, name: course.name, location: course.location, rating: tee.cr, slope: tee.slope, holes },
      formats: FORMATS_FOR[roundId] || ['skins'],
      games: [],
      teeId: course.playedTee,
      startingTee: 1,
      trackStats: true,
      statsConfig: { putts: true, fir: true, gir: true, sand: true },
      syncCode: syncCodeFor(model, roundId),
    };
  }

  // ── native → EGT translation ──────────────────────────────────────────────
  // payload holds the arrays ScoreEntry hands to onSaveRound:
  //   scores/putts/firData/girData: { pid: Array(18) }  (index 0 = hole 1)
  //   extraStats: { pid: { holeIdx: { sand, … } } }
  //   wolfData:  { holeIdx: { wolfId, partnerId, confirmed, lone } }
  //   bbbData:   { holeIdx: { bingo, bango, bongo } }
  function bridge(model, state, roundId, payload) {
    const round = model.rounds.find(r => r.id === roundId);
    const p = payload || {};
    state.scores[roundId] = state.scores[roundId] || {};
    round.players.forEach(pid => {
      state.scores[roundId][pid] = state.scores[roundId][pid] || {};
      for (let i = 0; i < 18; i++) {
        const hole = i + 1;
        const gross = p.scores?.[pid]?.[i];
        if (gross == null) { delete state.scores[roundId][pid][hole]; continue; }
        state.scores[roundId][pid][hole] = {
          gross,
          putts: p.putts?.[pid]?.[i] ?? null,
          fir: p.firData?.[pid]?.[i] === true,
          gir: p.girData?.[pid]?.[i] === true,
          sand: !!(p.extraStats?.[pid]?.[i]?.sand === true),
        };
      }
    });

    // R1 Bingo-Bango-Bongo events.
    if (roundId === 'R1' && p.bbbData) {
      const events = [];
      Object.keys(p.bbbData).forEach(idx => {
        const e = p.bbbData[idx];
        if (e && (e.bingo || e.bango || e.bongo)) {
          events.push({ hole: Number(idx) + 1, bingo: e.bingo || null, bango: e.bango || null, bongo: e.bongo || null });
        }
      });
      events.sort((a, b) => a.hole - b.hole);
      state.events.bbb[roundId] = events;
    }

    // R3 Wolf events (native supports pair/lone; blind isn't a native pick).
    if (roundId === 'R3' && p.wolfData) {
      const events = [];
      Object.keys(p.wolfData).forEach(idx => {
        const w = p.wolfData[idx];
        if (w && w.confirmed) {
          events.push({ hole: Number(idx) + 1, wolf: w.wolfId, mode: w.lone ? 'lone' : 'pair', partner: w.lone ? null : w.partnerId });
        }
      });
      events.sort((a, b) => a.hole - b.hole);
      state.events.wolf[roundId] = events;
    }

    return state;
  }

  // Read native scores straight from localStorage (used when finalizing an EGT
  // round from the EGT screen without going through onSaveRound). Returns the
  // same payload shape bridge() expects, or null when nothing was entered.
  function readNativePayload(model, roundId) {
    if (typeof localStorage === 'undefined') return null;
    const nid = nativeRoundId(model, roundId);
    const get = key => { try { const s = localStorage.getItem(`${key}_${nid}`); return s ? JSON.parse(s) : null; } catch { return null; } };
    const scores = get('pp_scores');
    if (!scores) return null;
    return {
      scores,
      putts: get('pp_putts') || {},
      firData: get('pp_fir') || {},
      girData: get('pp_gir') || {},
      extraStats: get('pp_extra') || {},
      wolfData: get('pp_wolf') || {},
      bbbData: get('pp_bbb') || {},
    };
  }

  return { PALETTE, initialsFor, nativeRoundId, syncCodeFor, FORMATS_FOR, toNativeRound, bridge, readNativePayload };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtBridge });
}
