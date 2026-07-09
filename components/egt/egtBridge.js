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

  // Native format objects to surface per round, so ScoreEntry's real engines/
  // trackers fire exactly as they do for a normal round. `formats` is an array
  // of { type, ... } objects (matching Setup's shape) — NOT bare strings, or
  // ScoreEntry's `formats.some(f => f.type === …)` checks all read false and no
  // tracker appears. Skins runs every round.
  function formatsFor(model, round, stakes, matchConfigs) {
    const md = model.moneyDefaults;
    const S = (stakes && stakes[round.id]) || {};
    const val = (k, d) => (S[k] != null && S[k] !== '' ? Number(S[k]) : (md[k] != null ? md[k] : d));
    const skins = { type: 'skins', stakes: val('skinsAnte', 5) };
    switch (round.id) {
      case 'R1': // loop 1 Bingo-Bango-Bongo (loop 2 Nines has no native engine)
        return [{ type: 'bingobangobongo', stakes: val('bbbNinesPerPointDiff', 1) }, skins];
      case 'R2': { // four-ball best-ball + Nassau, John+Brian vs TJ+Mike (2v2)
        const t = round.teams;
        const nassauMatches = [{
          id: 'egt-R2', matchType: '2v2',
          playersInMatch: [...t[0].players, ...t[1].players],
          teams: { team1: t[0].players.slice(), team2: t[1].players.slice() },
          popHoles: {}, stakes: val('nassauPerPoint', 5),
        }];
        return [{ type: 'nassau', stakes: val('nassauPerPoint', 5), nassauMatches }, skins];
      }
      case 'R3': return [{ type: 'wolf', stakes: val('wolfPerUnit', 2) }, skins];
      case 'R4': return [{ type: 'stableford', stakes: 1 }, skins];
      case 'R5': { // full-18 BBB + the match play configured before the round
        const H = (typeof window !== 'undefined' && window.EgtHandicap) || EgtHandicap;
        const course = model.courses[round.courseId];
        const chById = (model.derived && model.derived.R5 && model.derived.R5.courseHandicaps) || {};
        const holes18 = course.holes.slice(0, 18).map(h => ({ hole: h.hole, si: h.si }));
        // The matches the user set on the Rounds tab (1v1 or 2v2, any players).
        // No default — no matches configured means no Nassau tracker.
        const configured = (matchConfigs || []).filter(m => (m.matchType === '2v2'
          ? m.teams && (m.teams.team1 || []).length === 2 && (m.teams.team2 || []).length === 2
          : (m.playersInMatch || []).length === 2));
        const nassauMatches = configured.map(m => ({
          id: m.id, matchType: m.matchType || '1v1',
          playersInMatch: (m.playersInMatch || []).slice(),
          teams: m.teams ? { team1: (m.teams.team1 || []).slice(), team2: (m.teams.team2 || []).slice() } : null,
          // Manual pops win; otherwise CH difference off the low within the match.
          popHoles: H.matchPopFlags(chById, holes18, m.playersInMatch || [], m.popHoles),
          stakes: (m.stakes != null && m.stakes !== '') ? Number(m.stakes) : val('nassauPerPoint', 5),
        }));
        const formats = [{ type: 'bingobangobongo', stakes: val('bbbNinesPerPointDiff', 1) }];
        if (nassauMatches.length) formats.push({ type: 'nassau', stakes: val('nassauPerPoint', 5), nassauMatches });
        formats.push(skins);
        return formats;
      }
      case 'R6': return [{ type: 'stableford', stakes: 1 }, skins];
      default:   return [skins];
    }
  }

  // Player order for the round. Wolf rotates by players[holeIdx % n], so R3 uses
  // the seed's Wolf order (tj, mike, brian, john) to match the tournament.
  function playerOrder(model, round) {
    if (round.id === 'R3') {
      const order = model.formatConfigs?.R3?.order;
      if (Array.isArray(order) && order.length) return order.filter(id => round.players.includes(id));
    }
    return round.players.slice();
  }

  // Build a native `round` object from a seed round. `stakes` (optional) are the
  // per-round Rounds-tab overrides; `opts.matchConfigs` carries the pre-round
  // match setup (R5) into the native Nassau engine.
  function toNativeRound(model, roundId, stakes, opts) {
    const round = model.rounds.find(r => r.id === roundId);
    const course = model.courses[round.courseId];
    const tee = course.tees.find(t => t.name === course.playedTee) || course.tees[0];
    const order = playerOrder(model, round);
    const players = order.map((pid, i) => {
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
      formats: formatsFor(model, round, stakes, opts && opts.matchConfigs),
      games: [],
      teeId: course.playedTee,
      startingTee: 1,
      trackStats: true,
      statsConfig: { putts: true, fir: true, gir: true },
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

    // Bingo-Bango-Bongo events. R1 plays BBB on loop 1 only (holes 1-9; loop 2
    // is The Nines); R5 plays it over the full 18.
    if ((roundId === 'R1' || roundId === 'R5') && p.bbbData) {
      const maxHole = roundId === 'R1' ? 9 : 18;
      const events = [];
      Object.keys(p.bbbData).forEach(idx => {
        const hole = Number(idx) + 1;
        const e = p.bbbData[idx];
        if (hole <= maxHole && e && (e.bingo || e.bango || e.bongo)) {
          events.push({ hole, bingo: e.bingo || null, bango: e.bango || null, bongo: e.bongo || null });
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

  return { PALETTE, initialsFor, nativeRoundId, syncCodeFor, formatsFor, playerOrder, toNativeRound, bridge, readNativePayload };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtBridge });
}
