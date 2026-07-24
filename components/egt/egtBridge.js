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

  // Normalize the user-configured individual Nassau matches (the "Individual
  // Matches" overlay available on every round) into native Nassau match objects,
  // with pops derived off the low course handicap within each match. Shared by
  // every round so the overlay behaves identically everywhere. Manual pops win.
  function overlayNassauMatches(model, round, matchConfigs, val) {
    const H = (typeof window !== 'undefined' && window.EgtHandicap) || EgtHandicap;
    const course = model.courses[round.courseId];
    const chById = (model.derived && model.derived[round.id] && model.derived[round.id].courseHandicaps) || {};
    const holes18 = course.holes.slice(0, 18).map(h => ({ hole: h.hole, si: h.si }));
    const configured = (matchConfigs || []).filter(m => (m.matchType === '2v2'
      ? m.teams && (m.teams.team1 || []).length === 2 && (m.teams.team2 || []).length === 2
      : (m.playersInMatch || []).length === 2));
    return configured.map(m => ({
      id: m.id, matchType: m.matchType || '1v1',
      playersInMatch: (m.playersInMatch || []).slice(),
      teams: m.teams ? { team1: (m.teams.team1 || []).slice(), team2: (m.teams.team2 || []).slice() } : null,
      // Manual pops win; otherwise CH difference off the low within the match.
      popHoles: H.matchPopFlags(chById, holes18, m.playersInMatch || [], m.popHoles),
      stakes: (m.stakes != null && m.stakes !== '') ? Number(m.stakes) : val('nassauPerPoint', 5),
    }));
  }

  // Native format objects to surface per round, so ScoreEntry's real engines/
  // trackers fire exactly as they do for a normal round. `formats` is an array
  // of { type, ... } objects (matching Setup's shape) — NOT bare strings, or
  // ScoreEntry's `formats.some(f => f.type === …)` checks all read false and no
  // tracker appears. Skins are not played, so no skins format is emitted.
  //
  // Individual Nassau overlay: every round accepts optional 1v1/2v2 matches
  // (`matchConfigs`) layered on top of its primary format. They share the same
  // hole-by-hole scoring data (no duplicate entry) and merge into one Nassau
  // tracker — for R2 they join the four-ball team match; for R5 they ARE the
  // match play; elsewhere they add a standalone Nassau tracker.
  function formatsFor(model, round, stakes, matchConfigs) {
    const md = model.moneyDefaults;
    const S = (stakes && stakes[round.id]) || {};
    const val = (k, d) => (S[k] != null && S[k] !== '' ? Number(S[k]) : (md[k] != null ? md[k] : d));
    const overlay = overlayNassauMatches(model, round, matchConfigs, val);

    // Primary format per round + any Nassau matches that belong to it (R2's
    // four-ball team match). The overlay is merged in below. Every game is a
    // flat stake to the winner — BBB/Stableford native payouts collect the
    // stake from each other player, matching the tournament money engine.
    const base = [];
    const baseNassau = [];
    switch (round.id) {
      case 'R1': // loop 1 Bingo-Bango-Bongo (loop 2 Nines has no native engine)
        base.push({ type: 'bingobangobongo', stakes: val('bbbNinesWinner', 5) });
        break;
      case 'R2': { // four-ball best-ball match play as a 2v2 Nassau, John+TJ vs Brian+Mike
        const t = round.teams;
        if (t && t[0] && t[1]) baseNassau.push({
          id: 'egt-R2', matchType: '2v2',
          playersInMatch: [...t[0].players, ...t[1].players],
          teams: { team1: t[0].players.slice(), team2: t[1].players.slice() },
          popHoles: {}, stakes: val('fourballWinner', 5),
        });
        break;
      }
      case 'R3': base.push({ type: 'wolf', stakes: val('wolfWinner', 5) }); break;
      case 'R4': base.push({ type: 'stableford', stakes: val('teamStablefordWinner', 5) }); break;
      case 'R5': base.push({ type: 'bingobangobongo', stakes: val('bbbNinesWinner', 5) }); break;
      case 'R6': base.push({ type: 'stableford', stakes: val('stablefordWinner', 5) }); break;
      default: break;
    }

    const formats = base.slice();
    const nassauMatches = baseNassau.concat(overlay);
    if (nassauMatches.length) formats.push({ type: 'nassau', stakes: val('nassauPerPoint', 5), nassauMatches });
    return formats;
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

    bridgeEvents(state, roundId, p);
    return state;
  }

  // Non-destructive score merge: writes only the holes the payload actually
  // carries (gross != null) and never deletes a hole that's already stored
  // locally. Used by the cross-device pull (EgtSync) so pulling in a phone's
  // scores can't wipe holes typed elsewhere; `bridge` above stays destructive
  // for the finalize path where the payload is the authoritative full card.
  function mergeNativeScores(model, state, roundId, payload) {
    const round = model.rounds.find(r => r.id === roundId);
    if (!round) return state;
    const p = payload || {};
    state.scores[roundId] = state.scores[roundId] || {};
    round.players.forEach(pid => {
      const dst = (state.scores[roundId][pid] = state.scores[roundId][pid] || {});
      for (let i = 0; i < 18; i++) {
        const gross = p.scores?.[pid]?.[i];
        if (gross == null) continue;
        dst[i + 1] = {
          gross,
          putts: p.putts?.[pid]?.[i] ?? null,
          fir: p.firData?.[pid]?.[i] === true,
          gir: p.girData?.[pid]?.[i] === true,
          sand: !!(p.extraStats?.[pid]?.[i]?.sand === true),
        };
      }
    });
    return state;
  }

  // Translate the native side-game data (Bingo-Bango-Bongo, Wolf) into EGT
  // events. Split out of `bridge` so the cross-device pull can replay events
  // without touching the score merge.
  function bridgeEvents(state, roundId, payload) {
    const p = payload || {};
    state.events = state.events || {};
    state.events.bbb = state.events.bbb || {};
    state.events.wolf = state.events.wolf || {};

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

  // ── stored-match pop repair ───────────────────────────────────────────────
  // Before v1.7.3 the Rounds-tab match editor auto-filled 1v1 pops from the
  // HANDICAP INDEX difference (native players carry the index), while the
  // tournament rule — and the engine's own fallback — is the COURSE handicap
  // difference off the low within the match. Those auto-filled arrays count as
  // "manual" overrides everywhere (engine, native tracker, broadcast), so a
  // stored match could settle a stroke short (e.g. R5 John v TJ: 10 pops
  // instead of 11). This scans persisted matches and, when the stored pops are
  // exactly the legacy auto-fill (i.e. the user never touched them), clears
  // them so every consumer live-derives the correct CH-based pops instead.
  // Manually edited pops — anything that differs from the auto-fill — are
  // left alone. Returns true when something changed (caller persists).
  function repairMatchPops(state) {
    const H = (typeof window !== 'undefined' && window.EgtHandicap) || EgtHandicap;
    const model = state && state.model;
    if (!model || !model.derived) return false;
    let changed = false;

    const flagsOf = ph => {
      const out = {};
      Object.entries(ph || {}).forEach(([pid, arr]) => {
        if (Array.isArray(arr) && arr.some(Boolean)) out[pid] = Array.from({ length: 18 }, (_, i) => !!arr[i]);
      });
      return out;
    };
    const sameFlags = (a, b) => {
      const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
      if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
      return ka.every(k => a[k].every((v, i) => v === !!b[k][i]));
    };

    const repairList = (rid, list) => {
      const round = model.rounds.find(r => r.id === rid);
      const der = model.derived[rid];
      if (!round || !der || !Array.isArray(list)) return;
      const course = model.courses[round.courseId];
      // Both SI variants the legacy auto-fill could have seen: the real card SI
      // and the hole-number placeholder used while SI was still pending.
      const holeVariants = [
        course.holes.slice(0, 18).map((h, i) => ({ hole: h.hole, si: h.si == null ? i + 1 : h.si })),
        course.holes.slice(0, 18).map((h, i) => ({ hole: h.hole, si: i + 1 })),
      ];
      const hiById = {};
      round.players.forEach(pid => { hiById[pid] = model.playersById[pid]?.handicapIndex || 0; });
      list.forEach(m => {
        if (!m || (m.matchType || '1v1') !== '1v1') return;
        const pids = m.playersInMatch || [];
        if (pids.length !== 2) return;
        const stored = flagsOf(m.popHoles);
        if (!Object.keys(stored).length) return; // nothing baked — already live-derived
        const isLegacyAutofill = holeVariants.some(holes => sameFlags(stored, H.matchPopFlags(hiById, holes, pids, null)));
        const chFlags = H.matchPopFlags(der.courseHandicaps, holeVariants[0], pids, null);
        if (isLegacyAutofill && !sameFlags(stored, chFlags)) {
          m.popHoles = {};
          changed = true;
        }
      });
    };

    const rm = (state.events && state.events.roundMatches) || {};
    Object.keys(rm).forEach(rid => repairList(rid, rm[rid]));
    if (state.events && Array.isArray(state.events.r5Matches)) repairList('R5', state.events.r5Matches);
    return changed;
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

  return { PALETTE, initialsFor, nativeRoundId, syncCodeFor, formatsFor, playerOrder, toNativeRound, bridge, mergeNativeScores, bridgeEvents, repairMatchPops, readNativePayload };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtBridge });
}
