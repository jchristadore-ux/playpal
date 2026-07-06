// egtStore.js — localStorage persistence for the EGT tournament. One JSON blob
// per trip id holds the imported model plus everything entered live (hole
// scores, side-game events, SI edits) and the night snapshots. Re-importing the
// seed is idempotent by trip.id: the model refreshes but entered data survives.

const EgtStore = (function () {
  const KEY = tripId => `egt:${tripId}`;
  const storage = () => (typeof localStorage !== 'undefined' ? localStorage : null);

  function emptyState(tripId) {
    return {
      tripId,
      model: null,           // normalized import (EgtImporter.importSeed)
      scores: {},            // { roundId: { playerId: { hole: {gross,putts,fir,gir,sand} } } }
      events: {              // side-game / play-order events
        bbb: {}, wolf: {}, scrambleGross: {}, altShotGross: {},
        ctp: [], longDrive: [], singlesPairings: null,
      },
      finalized: [],         // round ids the user has closed
      stakes: {},            // { roundId: { stakeKey: dollars } } — Rounds-tab overrides
      snapshots: [],         // StandingsSnapshot list (per night)
      updatedAt: null,
    };
  }

  // Set a per-round stake override (dollars) for a format key.
  function setStake(state, roundId, key, value) {
    state.stakes = state.stakes || {};
    state.stakes[roundId] = state.stakes[roundId] || {};
    if (value === '' || value == null) delete state.stakes[roundId][key];
    else state.stakes[roundId][key] = Number(value);
    return save(state);
  }

  function load(tripId) {
    const s = storage();
    if (!s) return null;
    const raw = s.getItem(KEY(tripId));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function save(state) {
    const s = storage();
    state.updatedAt = new Date().toISOString();
    if (s) s.setItem(KEY(state.tripId), JSON.stringify(state));
    return state;
  }

  // Idempotent import: keep any existing entered data, swap in a fresh model.
  function importSeed(seed, EgtImporterRef) {
    const importer = EgtImporterRef || (typeof window !== 'undefined' && window.EgtImporter) || EgtImporter;
    const model = importer.importSeed(seed);
    const tripId = model.trip.id;
    const state = load(tripId) || emptyState(tripId);
    state.model = model;
    return save(state);
  }

  // Persisted, but the live model has methods/derived — rehydrate derived after
  // load by re-running recompute (SI is the source of truth).
  function rehydrate(state, EgtImporterRef) {
    const importer = EgtImporterRef || (typeof window !== 'undefined' && window.EgtImporter) || EgtImporter;
    if (state && state.model) importer.recomputeAll(state.model);
    return state;
  }

  function setHoleScore(state, roundId, playerId, hole, score) {
    const r = (state.scores[roundId] = state.scores[roundId] || {});
    const p = (r[playerId] = r[playerId] || {});
    p[hole] = { ...(p[hole] || {}), ...score };
    return save(state);
  }

  function setEvent(state, key, value) {
    state.events[key] = value;
    return save(state);
  }

  function finalizeRound(state, roundId) {
    if (!state.finalized.includes(roundId)) state.finalized.push(roundId);
    return save(state);
  }

  function addSnapshot(state, snapshot) {
    // One snapshot per night: replace an existing one for that night.
    state.snapshots = state.snapshots.filter(s => s.night !== snapshot.night);
    state.snapshots.push(snapshot);
    state.snapshots.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    return save(state);
  }

  function latestSnapshotBefore(state, night, NIGHT_ORDER) {
    const idx = NIGHT_ORDER.indexOf(night);
    const prior = state.snapshots.filter(s => NIGHT_ORDER.indexOf(s.night) < idx);
    return prior.length ? prior[prior.length - 1] : null;
  }

  function reset(tripId) {
    const s = storage();
    if (s) s.removeItem(KEY(tripId));
  }

  return {
    KEY, emptyState, load, save, importSeed, rehydrate,
    setHoleScore, setEvent, setStake, finalizeRound, addSnapshot, latestSnapshotBefore, reset,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtStore });
}
