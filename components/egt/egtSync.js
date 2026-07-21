// egtSync.js — cross-device sync for the EGT Cup screen.
//
// The native scorer already streams every EGT round's raw hole scores to
// Firestore (playpal_rounds/<syncCode>, written continuously by ScoreEntry).
// The EGT tournament STORE, however — the entered scores, side-game events,
// and (critically) the `finalized` list that drives standings + money — has
// only ever lived in each device's localStorage. So a round scored and
// finalized ("submitted") on a phone did not show as submitted, and its
// scores didn't appear, when the Cup was opened on another device (the web).
//
// This module closes that gap. It PULLS the synced native rounds into the
// local EGT store (merging scores, side-game events, overlay match play, and
// per-round stake overrides, all non-destructively) and reconciles the
// finalized list, and it PUSHES an explicit finalize/reopen flag back to each
// round's doc so the "submitted" gesture propagates even before all 18 holes
// are in. Standings, money, and the FINAL badge then match on every device —
// the same Firestore data the EGT SportsCenter broadcast reads.
//
// It stays self-contained (only EgtBridge + RoundSyncService), so it works in
// the main app shell without pulling in the broadcast provider. Each EGT
// round's Firestore doc id is deterministic (EgtBridge.syncCodeFor), so the
// pull/subscribe target only this trip's rounds — no full-collection scan.

const EgtSync = (function () {
  function _win() { return (typeof window !== 'undefined') ? window : null; }
  function _bridge() { const w = _win(); return (w && w.EgtBridge) || (typeof EgtBridge !== 'undefined' ? EgtBridge : null); }
  function _roundSync() { const w = _win(); return w && w.RoundSyncService; }

  // Stake key each native format bakes its per-round override into (mirrors
  // EgtBridge.formatsFor), so overrides set on one device's Rounds tab flow
  // through the synced formats to every other device's money engine.
  const STAKE_KEY_BY_FORMAT = {
    skins: 'skinsAnte', bingobangobongo: 'bbbNinesPerPointDiff',
    wolf: 'wolfPerUnit', nassau: 'nassauPerPoint',
  };

  // The deterministic Firestore doc id for every round in this model.
  function syncCodes(model) {
    const B = _bridge();
    if (!B || !model) return [];
    return (model.rounds || []).map(r => B.syncCodeFor(model, r.id));
  }

  // Index every seed round by BOTH stable identifiers a synced round carries:
  // its deterministic sync code (the doc id) and its native round id
  // (`egt-<tripId>-<Rn>`, echoed in liveScores.roundId). A live-only doc — one
  // the app created with a merge write and never fully saved — has no `round`
  // object; we rebuild it from the seed via this index.
  function _egtRoundIndex(model) {
    const B = _bridge();
    const out = {};
    if (!B) return out;
    (model.rounds || []).forEach(r => {
      try {
        const nr = B.toNativeRound(model, r.id);
        out[nr.syncCode] = nr;
        out[nr.id] = nr;
      } catch (e) { /* seed round not buildable — skip */ }
    });
    return out;
  }

  // Reduce a raw playpal_rounds doc to just the fields the Cup store needs.
  // Returns null for non-EGT / unresolvable docs.
  function _normalizeDoc(model, doc, index) {
    if (!doc) return null;
    const live = doc.liveScores || null;
    let round = doc.round || null;
    if (!round && index[doc.syncCode]) round = index[doc.syncCode];
    if (!round && live && live.roundId && index[live.roundId]) round = index[live.roundId];
    if (!round || !round.egtRoundId || !round.players || !round.course || !round.course.holes) return null;

    const nHoles = round.course.holes.length;

    // Scores: freshest live payload wins, else a completed round's holeScores.
    let scores = {}, putts = {};
    if (live && live.scores) { scores = live.scores; putts = live.putts || {}; }
    else if (round.holeScores) {
      Object.keys(round.holeScores).forEach(pid => {
        scores[pid] = round.holeScores[pid].map(h => (h && h.strokes) || null);
        putts[pid] = round.holeScores[pid].map(h => (h && h.putts) || 0);
      });
      if (round.putts) putts = round.putts;
    }
    const src = live || round;

    // Completion: every player has a stroke on every hole.
    let anyScore = false, allDone = round.players.length > 0;
    round.players.forEach(p => {
      const arr = scores[p.id] || [];
      let n = 0;
      for (let i = 0; i < nHoles; i++) if (arr[i] > 0) n++;
      if (n > 0) anyScore = true;
      if (n < nHoles) allDone = false;
    });

    return {
      egtRoundId: round.egtRoundId,
      formats: round.formats || [],
      // Whether `round` came from a real saved doc vs. a seed-synthesized one
      // for a live-only doc. Overlay matches + stake overrides are only trusted
      // from a saved round (a synthesized round carries this device's own
      // defaults, which mustn't shadow the store's).
      fromSavedRound: !!doc.round,
      scores, putts,
      firData: src.firData || {}, girData: src.girData || {},
      extraStats: src.extraStats || {}, wolfData: src.wolfData || {}, bbbData: src.bbbData || {},
      hasScores: anyScore,
      complete: anyScore && allDone,
      // Explicit submit/reopen flag from the Cup screen; null = no opinion.
      egtFinalized: (typeof doc.egtFinalized === 'boolean') ? doc.egtFinalized : null,
    };
  }

  // Merge one normalized native round into the EGT state: scores (non-
  // destructive), side-game events, overlay match play, and stake overrides.
  function _mergeRound(model, state, norm) {
    const B = _bridge();
    if (!B) return;
    const rid = norm.egtRoundId;
    const payload = {
      scores: norm.scores, putts: norm.putts, firData: norm.firData, girData: norm.girData,
      extraStats: norm.extraStats, wolfData: norm.wolfData, bbbData: norm.bbbData,
    };
    B.mergeNativeScores(model, state, rid, payload);
    B.bridgeEvents(state, rid, payload);

    // Overlay match play + stake overrides only travel on a real saved round —
    // a live-only doc's formats are seed-synthesized from this device's own
    // defaults and carry no cross-device intent.
    if (!norm.fromSavedRound) return;

    // Individual-Nassau overlay recovered from the synced Nassau format. Skip
    // the synthetic 'egt-*' team matches (e.g. R2's four-ball) — those settle
    // in their own money branch and would double-count if replayed as overlay.
    const nassau = (norm.formats || []).find(f => f && f.type === 'nassau');
    const overlay = ((nassau && nassau.nassauMatches) || []).filter(m => m && !String(m.id || '').startsWith('egt-'));
    if (overlay.length) {
      state.events = state.events || {};
      state.events.roundMatches = state.events.roundMatches || {};
      state.events.roundMatches[rid] = overlay;
    }

    // Per-round stake overrides baked into the synced native formats.
    const recovered = {};
    (norm.formats || []).forEach(f => {
      const key = f && STAKE_KEY_BY_FORMAT[f.type];
      if (key && f.stakes != null && f.stakes !== '' && isFinite(Number(f.stakes))) recovered[key] = Number(f.stakes);
    });
    if (Object.keys(recovered).length) {
      state.stakes = state.stakes || {};
      state.stakes[rid] = Object.assign({}, state.stakes[rid], recovered);
    }
  }

  // Reconcile the finalized list against what the cloud says per round.
  // Explicit flag wins (true adds, false removes); with no flag, fall back to
  // score completeness so a round played to 18 on the phone reads as final.
  function _reconcileFinalized(state, perRound) {
    const set = new Set(state.finalized || []);
    Object.keys(perRound).forEach(rid => {
      const { explicit, complete } = perRound[rid];
      if (explicit === true) set.add(rid);
      else if (explicit === false) set.delete(rid);
      else if (complete) set.add(rid);
    });
    // Preserve the model's round order for stable, deterministic output.
    const order = (state.model && state.model.rounds ? state.model.rounds.map(r => r.id) : []);
    const rank = rid => { const i = order.indexOf(rid); return i === -1 ? 999 : i; };
    return Array.from(set).sort((a, b) => rank(a) - rank(b));
  }

  // Pure, no-Firestore: merge an array of playpal_rounds doc datas
  // ({ syncCode, round, savedAt, liveScores, egtFinalized }) into `state`.
  // Returns true when anything in the store actually changed.
  function hydrate(state, docs) {
    const B = _bridge();
    if (!state || !state.model || !B || !Array.isArray(docs)) return false;
    const model = state.model;
    const before = JSON.stringify([state.scores, state.events, state.finalized, state.stakes]);
    const index = _egtRoundIndex(model);
    const perRound = {};
    docs.forEach(doc => {
      let norm = null;
      try { norm = _normalizeDoc(model, doc, index); } catch (e) { norm = null; }
      if (!norm) return;
      const rid = norm.egtRoundId;
      if (norm.hasScores) _mergeRound(model, state, norm);
      const prev = perRound[rid] || { explicit: undefined, complete: false };
      perRound[rid] = {
        // Any explicit flag among a round's docs wins over "no opinion".
        explicit: (norm.egtFinalized === true || norm.egtFinalized === false) ? norm.egtFinalized : prev.explicit,
        complete: prev.complete || norm.complete,
      };
    });
    state.finalized = _reconcileFinalized(state, perRound);
    const after = JSON.stringify([state.scores, state.events, state.finalized, state.stakes]);
    return before !== after;
  }

  // One-shot pull of this trip's rounds from Firestore into `state`.
  // cb(changed, docs). Safe no-op when Firebase/sync is unavailable (offline,
  // native bundle without config) — the local store just stands on its own.
  function pull(state, cb) {
    const RS = _roundSync();
    if (!RS || typeof RS.fetchDocs !== 'function' || !state || !state.model) { cb && cb(false); return; }
    RS.fetchDocs(syncCodes(state.model), function (docs) {
      let changed = false;
      try { changed = hydrate(state, docs || []); } catch (e) { changed = false; }
      cb && cb(changed, docs || []);
    });
  }

  // Live subscription: re-hydrate whenever any of this trip's round docs
  // change. `stateOrGetter` may be the state object or a getter that returns
  // the CURRENT state — pass a getter from React so each snapshot merges into
  // the latest store (not a stale boot-time reference) and can't clobber edits
  // made after subscribing. onChange(docs) fires only when the merge actually
  // changed the store. Returns an unsubscribe function.
  function subscribe(stateOrGetter, onChange) {
    const RS = _roundSync();
    const get = (typeof stateOrGetter === 'function') ? stateOrGetter : function () { return stateOrGetter; };
    const initial = get();
    if (!RS || typeof RS.subscribeDocs !== 'function' || !initial || !initial.model) return function () {};
    return RS.subscribeDocs(syncCodes(initial.model), function (docs) {
      const state = get();
      if (!state || !state.model) return;
      let changed = false;
      try { changed = hydrate(state, docs || []); } catch (e) { changed = false; }
      if (changed) onChange && onChange(docs || []);
    });
  }

  // Push the explicit finalize/reopen gesture to the round's doc so it shows
  // as submitted on every device — even before all 18 holes are entered, and
  // so a reopen propagates too. Merge write; creates the doc if it's absent.
  function pushFinalized(model, roundId, finalized, cb) {
    const RS = _roundSync();
    const B = _bridge();
    if (!RS || typeof RS.writeMeta !== 'function' || !B || !model) { cb && cb(false); return; }
    RS.writeMeta(B.syncCodeFor(model, roundId), { egtFinalized: !!finalized }, cb);
  }

  return { syncCodes, hydrate, pull, subscribe, pushFinalized, _normalizeDoc, _egtRoundIndex };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtSync });
}
