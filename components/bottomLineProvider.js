// bottomLineProvider.js — the EGT Bottom Line data provider.
//
// Aggregates every scoring model in the app (live rounds, completed rounds,
// golf trips, the EGT Cup tournament engine, per-hole stats, format engines,
// money) into one unified ticker feed. Pure compute: no storage, no network,
// no DOM — the page feeds it a "world" snapshot (Firestore/RTDB data) and it
// returns cached facts + an ordered list of ticker segments + alert cards.
//
// Modular by design: segments come from a registry of builders keyed by
// category. A new statistic added anywhere in the app surfaces here by
// registering one more builder (or automatically, where builders read from
// open-ended stat maps like StatsService.computePlayerRound).
//
// Segment shape (the renderer contract):
//   { id, category, icon, label, parts:[{t,s}], alert?:bool, tone?:'up'|'down'|'hot' }
// part types: 'name' (player, bold gold), 'val' (big white), 'up' (green),
// 'down' (red), 'dim' (muted), 'sep' (dot divider), 'text' (plain).

const BottomLineProvider = (function () {
  const g = name => (typeof window !== 'undefined' ? window[name] : undefined);

  const LIVE_WINDOW_MS = 6 * 60 * 60 * 1000; // touches within 6h count as "on course"

  // ── tiny part helpers ──────────────────────────────────────────────────────
  const P = {
    name: s => ({ t: 'name', s: String(s) }),
    val:  s => ({ t: 'val',  s: String(s) }),
    up:   s => ({ t: 'up',   s: String(s) }),
    down: s => ({ t: 'down', s: String(s) }),
    dim:  s => ({ t: 'dim',  s: String(s) }),
    sep:  () => ({ t: 'sep', s: '' }),
    text: s => ({ t: 'text', s: String(s) }),
  };

  function fmtToPar(n) {
    if (n === 0) return 'E';
    return (n > 0 ? '+' : '') + n;
  }
  function fmtMoney(n) {
    const v = Math.round(Math.abs(n));
    return (n < 0 ? '-$' : '+$') + v;
  }
  function upDown(n, s) { return n >= 0 ? P.up(s) : P.down(s); }
  function first(list) { return list && list.length ? list[0] : null; }

  // ── world → normalized rounds ─────────────────────────────────────────────
  // A "doc" is a Firestore playpal_rounds document: { syncCode, round, savedAt,
  // liveScores }. EGT rounds may exist as liveScores-only docs (the app creates
  // them with a merge write); their round object is synthesized from the seed.

  function _egtNativeRounds(egtModel) {
    const EgtBridge = g('EgtBridge');
    if (!egtModel || !EgtBridge) return {};
    const out = {};
    (egtModel.rounds || []).forEach(r => {
      try {
        const nr = EgtBridge.toNativeRound(egtModel, r.id);
        out[nr.syncCode] = nr;
      } catch (e) { /* seed round not buildable — skip */ }
    });
    return out;
  }

  function normalizeRound(doc, egtRoundBySync, now) {
    const live = doc.liveScores || null;
    let round = doc.round || null;
    if (!round && egtRoundBySync[doc.syncCode]) round = egtRoundBySync[doc.syncCode];
    if (!round || !round.players || !round.course || !round.course.holes) return null;

    const holes = round.course.holes;
    const nHoles = holes.length;

    // Scores: live payload wins (freshest), else completed holeScores.
    let scores = null, putts = null;
    if (live && live.scores) { scores = live.scores; putts = live.putts || {}; }
    else if (round.holeScores) {
      scores = {}; putts = {};
      Object.keys(round.holeScores).forEach(pid => {
        scores[pid] = round.holeScores[pid].map(h => (h && h.strokes) || null);
        putts[pid]  = round.holeScores[pid].map(h => (h && h.putts) || 0);
      });
      if (round.putts) putts = round.putts;
    } else { scores = {}; putts = {}; }

    const src = live || round;
    const norm = {
      syncCode: doc.syncCode || round.syncCode || null,
      savedAt: doc.savedAt || 0,
      lastTouch: Math.max(doc.savedAt || 0, (live && live._ts) || 0),
      round, course: round.course, players: round.players,
      formats: round.formats || [],
      isEgt: !!round.egtRoundId,
      egtRoundId: round.egtRoundId || null,
      tripId: round.tripId || null,
      name: round.name || round.course.name,
      scores, putts,
      firData: src.firData || {}, girData: src.girData || {},
      extraStats: src.extraStats || {},
      wolfData: src.wolfData || {}, bbbData: src.bbbData || {},
      teeBallData: src.teeBallData || {}, popFlags: src.popFlags || {},
      currentHoleIdx: live && live.currentHoleIdx != null ? live.currentHoleIdx : null,
      payouts: round.payouts || null,
    };

    // Per-player thru counts + completion.
    let anyScore = false, allDone = round.players.length > 0;
    norm.thru = {};
    round.players.forEach(p => {
      const arr = scores[p.id] || [];
      let n = 0;
      for (let i = 0; i < nHoles; i++) if (arr[i] > 0) n++;
      norm.thru[p.id] = n;
      if (n > 0) anyScore = true;
      if (n < nHoles) allDone = false;
    });
    norm.hasScores = anyScore;
    norm.complete = anyScore && allDone;
    norm.status = norm.complete ? 'final'
      : (anyScore && now - norm.lastTouch < LIVE_WINDOW_MS) ? 'live'
      : anyScore ? 'partial' : 'idle';
    return norm;
  }

  // ── per-round computed facts ──────────────────────────────────────────────
  function computeRoundFacts(r) {
    const StatsService = g('StatsService');
    const holes = r.course.holes;
    const parThru = pid => {
      let par = 0;
      (r.scores[pid] || []).forEach((s, i) => { if (s > 0 && holes[i]) par += holes[i].par; });
      return par;
    };

    // Player lines: gross, toPar (thru), net (full-handicap), position.
    r.lines = r.players.map(p => {
      const arr = r.scores[p.id] || [];
      const gross = arr.reduce((a, s) => a + (s > 0 ? s : 0), 0);
      const toPar = gross - parThru(p.id);
      const thru = r.thru[p.id] || 0;
      const hcp = Number(p.handicap) || 0;
      // Handicap prorated to holes played so live net leaders are meaningful.
      const net = thru > 0 ? gross - Math.round(hcp * (thru / holes.length)) : 0;
      return { id: p.id, name: p.name, initials: p.initials, gross, toPar, thru, net, netToPar: net - parThru(p.id) };
    }).filter(l => l.thru > 0);
    r.lines.sort((a, b) => a.toPar - b.toPar || b.thru - a.thru);
    r.linesNet = r.lines.slice().sort((a, b) => a.netToPar - b.netToPar || b.thru - a.thru);

    // Front/back nines.
    r.nines = r.players.map(p => {
      const arr = r.scores[p.id] || [];
      const seg = (from, to) => {
        let gross = 0, par = 0, done = true;
        for (let i = from; i < to && i < holes.length; i++) {
          if (arr[i] > 0) { gross += arr[i]; par += holes[i].par; } else done = false;
        }
        return done && gross > 0 ? { gross, toPar: gross - par } : null;
      };
      return { id: p.id, name: p.name, front: seg(0, 9), back: seg(9, 18) };
    });

    // Full stat lines from the shared stats engine (open-ended: whatever
    // StatsService computes shows up on the ticker).
    r.stats = {};
    if (StatsService) {
      const data = {
        course: r.course, players: r.players, scores: r.scores, putts: r.putts,
        firData: r.firData, girData: r.girData, extraStats: r.extraStats,
      };
      r.players.forEach(p => {
        if (r.thru[p.id] > 0) {
          try { r.stats[p.id] = StatsService.computePlayerRound(data, p.id); } catch (e) {}
        }
      });
    }

    // Live money for every format in play (or the saved payouts if final).
    r.money = null;
    try {
      const computePTMState = g('computePTMState'), calcAllPayouts = g('calcAllPayouts');
      if (r.payouts && r.complete) r.money = r.payouts;
      else if (calcAllPayouts && r.hasScores && r.formats.length) {
        const ptm = computePTMState
          ? computePTMState(r.scores, r.putts || {}, r.players, r.course, r.players[0].id)
          : { holderId: null };
        r.ptmState = ptm;
        r.money = calcAllPayouts(r.scores, r.wolfData || {}, r.players, r.course, r.formats,
          [], ptm.holderId, r.popFlags || {}, null, r.bbbData || {}, r.teeBallData || {});
      }
    } catch (e) {}

    // Format boards — live standings per active format.
    r.formatBoards = [];
    const FORMAT_INFO = g('FORMAT_INFO') || {};
    const nameOf = pid => (r.players.find(p => p.id === pid) || {}).name || pid;
    r.formats.forEach(f => {
      const info = FORMAT_INFO[f.type] || { label: f.type, icon: '⛳' };
      const board = { type: f.type, label: info.label, icon: info.icon, lines: [], leader: null };
      try {
        if (f.type === 'skins') {
          const res = g('calcSkins')(r.scores, r.players, r.course, f.stakes, r.popFlags);
          board.skins = res.skins;
          const ranked = r.players.map(p => ({ name: p.name, id: p.id, n: res.skins[p.id] || 0 }))
            .sort((a, b) => b.n - a.n);
          board.lines = ranked.filter(x => x.n > 0).map(x => `${x.name} ${x.n}`);
          if (ranked[0] && ranked[0].n > 0) board.leader = ranked[0].name;
          // carryover count = holes decided by nobody so far
        } else if (f.type === 'wolf') {
          const pts = g('calcWolfStandings')(r.scores, r.wolfData, r.players, r.course);
          board.points = pts;
          const ranked = r.players.map(p => ({ name: p.name, n: pts[p.id] || 0 })).sort((a, b) => b.n - a.n);
          board.lines = ranked.map(x => `${x.name} ${x.n > 0 ? '+' : ''}${x.n}`);
          if (ranked[0] && ranked[0].n !== ranked[1]?.n) board.leader = ranked[0].name;
        } else if (f.type === 'bingobangobongo') {
          const st = g('calcBBBStandings')(r.bbbData, r.players);
          const ranked = r.players.map(p => ({ name: p.name, n: (st[p.id] || {}).total || 0 })).sort((a, b) => b.n - a.n);
          board.lines = ranked.map(x => `${x.name} ${x.n}`);
          if (ranked[0] && ranked[0].n > 0 && ranked[0].n !== ranked[1]?.n) board.leader = ranked[0].name;
        } else if (f.type === 'teeball') {
          const st = g('calcTeeBallStandings')(r.teeBallData, r.players);
          const ranked = r.players.map(p => ({ name: p.name, n: st[p.id] || 0 })).sort((a, b) => b.n - a.n);
          board.lines = ranked.filter(x => x.n > 0).map(x => `${x.name} ${x.n}`);
          if (ranked[0] && ranked[0].n > 0 && ranked[0].n !== ranked[1]?.n) board.leader = ranked[0].name;
        } else if (f.type === 'stableford') {
          const calcPts = g('calcStablefordPoints'), adj = g('getAdjustedHoleScore');
          const ranked = r.players.map(p => ({
            name: p.name,
            n: r.course.holes.reduce((a, h, i) => {
              const s = adj(r.scores, r.popFlags, p.id, i);
              return s ? a + calcPts(s, h.par) : a;
            }, 0),
          })).sort((a, b) => b.n - a.n);
          board.lines = ranked.map(x => `${x.name} ${x.n} pts`);
          if (ranked[0] && ranked[0].n > 0 && ranked[0].n !== ranked[1]?.n) board.leader = ranked[0].name;
        } else if (f.type === 'nassau') {
          const segStatus = g('nassauSegmentStatus');
          const matches = f.nassauMatches && f.nassauMatches.length ? f.nassauMatches
            : (f.nassauConfig ? [f.nassauConfig] : []);
          matches.forEach(m => {
            const ids = m.playersInMatch || [];
            const label = m.matchType === '2v2'
              ? `${nameOf((m.teams?.team1 || [])[0])}/${nameOf((m.teams?.team1 || [])[1])} v ${nameOf((m.teams?.team2 || [])[0])}/${nameOf((m.teams?.team2 || [])[1])}`
              : `${nameOf(ids[0])} v ${nameOf(ids[1])}`;
            const F = segStatus(r.scores, r.players, r.course, [0,1,2,3,4,5,6,7,8], 17, r.popFlags, m);
            const B = segStatus(r.scores, r.players, r.course, [9,10,11,12,13,14,15,16,17], 17, r.popFlags, m);
            const O = segStatus(r.scores, r.players, r.course, Array.from({length:18},(_,i)=>i), 17, r.popFlags, m);
            board.lines.push(`${label} — F9 ${F || 'AS'} · B9 ${B || 'AS'} · 18 ${O || 'AS'}`);
          });
        } else if (f.type === 'passmoney') {
          if (r.ptmState && r.ptmState.holderId) {
            board.holder = nameOf(r.ptmState.holderId);
            board.lines = [`${board.holder} holds the money`];
            board.leader = board.holder;
            board.passes = (r.ptmState.log || []).length;
          }
        }
      } catch (e) {}
      if (board.lines.length || board.leader) r.formatBoards.push(board);
    });

    return r;
  }

  // ── EGT Cup facts (rebuilt from the seed + synced scores, no storage) ─────
  function computeEgtFacts(world, rounds) {
    const EgtImporter = g('EgtImporter'), EgtEngine = g('EgtEngine'), EgtBridge = g('EgtBridge');
    const seed = world.egtSeed || g('EGT_SEED');
    if (!seed || !EgtImporter || !EgtEngine || !EgtBridge) return null;

    let model;
    try { model = EgtImporter.importSeed(seed); } catch (e) { return null; }

    // Hand-built state (never persisted): scores flow in from the synced
    // native rounds through the same bridge the app uses.
    const state = {
      // storage key suffix guards the app's real EGT store if anything saves
      tripId: model.trip.id + ':bottomline',
      model,
      scores: {}, events: { bbb: {}, wolf: {}, ctp: [], longDrive: [], singlesPairings: null },
      finalized: [], stakes: {}, snapshots: [], updatedAt: null,
    };

    const egtRounds = rounds.filter(r => r.isEgt && r.egtRoundId);
    egtRounds.forEach(r => {
      try {
        EgtBridge.bridge(model, state, r.egtRoundId, {
          scores: r.scores, putts: r.putts, firData: r.firData, girData: r.girData,
          extraStats: r.extraStats, wolfData: r.wolfData, bbbData: r.bbbData,
        });
        if (r.complete) state.finalized.push(r.egtRoundId);
      } catch (e) {}
    });

    if (!egtRounds.some(r => r.hasScores)) {
      // Nothing scored yet — still surface the schedule/preview facts.
      return { model, state, live: null, rounds: egtRounds };
    }

    let live = null;
    try { live = EgtEngine.liveUpdate(state, { noPersist: true }); } catch (e) {}

    // Biggest climber / biggest drop: standings with vs without the most
    // recently finalized round.
    let climber = null, dropper = null;
    try {
      if (live && state.finalized.length >= 2) {
        const seqOf = rid => (model.rounds.find(x => x.id === rid) || {}).seq || 0;
        const latest = state.finalized.slice().sort((a, b) => seqOf(a) - seqOf(b)).pop();
        const prevState = Object.assign({}, state, {
          finalized: state.finalized.filter(rid => rid !== latest),
          snapshots: [],
        });
        const prev = EgtEngine.liveUpdate(prevState, { noPersist: true });
        const prevRank = {}; prev.standings.forEach(s => { prevRank[s.player] = s.rank; });
        let best = 0, worst = 0;
        live.standings.forEach(s => {
          const d = (prevRank[s.player] || s.rank) - s.rank; // + = climbed
          if (d > best)  { best = d;  climber = { name: s.name, moved: d }; }
          if (d < worst) { worst = d; dropper = { name: s.name, moved: d }; }
        });
      }
    } catch (e) {}

    return { model, state, live, rounds: egtRounds, climber, dropper };
  }

  // ── records + career facts (EGT rounds only) ──────────────────────────────
  function computeRecords(rounds) {
    // Every EGT round scored so far feeds the record book.
    const rec = { bestRound: null, worstRound: null, mostBirdies: null, lowNine: null,
                  biggestPayday: null, mostSkinsRound: null };
    const career = {}; // by lowercased name
    rounds.forEach(r => {
      if (!r.hasScores) return;
      r.players.forEach(p => {
        const st = r.stats[p.id];
        if (!st) return;
        const key = String(p.name || p.id).toLowerCase();
        const c = career[key] = career[key] || { name: p.name, rounds: 0, earnings: 0, birdies: 0, eagles: 0, wins: 0 };
        if (st.holesPlayed > 0) {
          c.rounds++;
          c.birdies += st.counts.birdies; c.eagles += st.counts.eagles + st.counts.aces;
        }
        if (r.money && typeof r.money[p.id] === 'number') {
          c.earnings += r.money[p.id];
          if (r.complete && r.money[p.id] > 0) c.wins++;
        }
        const where = { name: p.name, course: r.course.name, code: r.syncCode };
        if (st.complete) {
          if (!rec.bestRound || st.toPar < rec.bestRound.toPar) rec.bestRound = Object.assign({ toPar: st.toPar, gross: st.gross }, where);
          if (!rec.worstRound || st.toPar > rec.worstRound.toPar) rec.worstRound = Object.assign({ toPar: st.toPar, gross: st.gross }, where);
        }
        if (st.counts.birdies > 0 && (!rec.mostBirdies || st.counts.birdies > rec.mostBirdies.n))
          rec.mostBirdies = Object.assign({ n: st.counts.birdies }, where);
        if (st.bestNine && (!rec.lowNine || st.bestNine.toPar < rec.lowNine.toPar))
          rec.lowNine = Object.assign({ toPar: st.bestNine.toPar, gross: st.bestNine.gross, label: st.bestNine.label }, where);
        if (r.complete && r.money && typeof r.money[p.id] === 'number' && r.money[p.id] > 0
            && (!rec.biggestPayday || r.money[p.id] > rec.biggestPayday.n))
          rec.biggestPayday = Object.assign({ n: r.money[p.id] }, where);
      });
    });
    return { records: rec, career };
  }

  // ── fun stats (streaks, blowups, recoveries) ──────────────────────────────
  function computeFunFacts(rounds) {
    const fun = { birdieStreak: null, parStreak: null, bogeyStreak: null, blowups: {},
                  recoveries: [], worstHole: null, mostThreePutts: null, mostOnePutts: null };
    rounds.forEach(r => {
      if (!r.hasScores) return;
      const holes = r.course.holes;
      r.players.forEach(p => {
        const arr = r.scores[p.id] || [];
        let bStreak = 0, pStreak = 0, boStreak = 0, prevDiff = null;
        arr.forEach((s, i) => {
          if (!(s > 0) || !holes[i]) { bStreak = pStreak = boStreak = 0; prevDiff = null; return; }
          const d = s - holes[i].par;
          bStreak  = d <= -1 ? bStreak + 1 : 0;
          pStreak  = d === 0 ? pStreak + 1 : 0;
          boStreak = d >= 1 ? boStreak + 1 : 0;
          if (bStreak >= 2 && (!fun.birdieStreak || bStreak > fun.birdieStreak.n))
            fun.birdieStreak = { name: p.name, n: bStreak, course: r.course.name };
          if (pStreak >= 4 && (!fun.parStreak || pStreak > fun.parStreak.n))
            fun.parStreak = { name: p.name, n: pStreak, course: r.course.name };
          if (boStreak >= 4 && (!fun.bogeyStreak || boStreak > fun.bogeyStreak.n))
            fun.bogeyStreak = { name: p.name, n: boStreak, course: r.course.name };
          if (d >= 2) fun.blowups[p.name] = (fun.blowups[p.name] || 0) + 1;
          if (prevDiff != null && prevDiff >= 2 && d <= -1)
            fun.recoveries.push({ name: p.name, hole: i + 1, course: r.course.name });
          if (!fun.worstHole || d > fun.worstHole.over)
            fun.worstHole = { name: p.name, over: d, gross: s, hole: i + 1, course: r.course.name };
          prevDiff = d;
        });
        const st = r.stats[p.id];
        if (st) {
          if (st.putts.threePutts > 0 && (!fun.mostThreePutts || st.putts.threePutts > fun.mostThreePutts.n))
            fun.mostThreePutts = { name: p.name, n: st.putts.threePutts };
          if (st.putts.onePutts > 0 && (!fun.mostOnePutts || st.putts.onePutts > fun.mostOnePutts.n))
            fun.mostOnePutts = { name: p.name, n: st.putts.onePutts };
        }
      });
    });
    return fun;
  }

  // Running bankroll for the EGT Cup. The tournament engine is authoritative:
  // its cumulative money over finalized rounds (which folds in Pass-the-Money
  // and per-round stake overrides) is the base, and live native money for any
  // EGT round still in progress is added on top. Keyed by player id; a round is
  // either finalized (engine) or live (native), never both, so no double count.
  function buildEgtMoneyBoard(egt, rounds) {
    const map = {};
    const nameOf = pid => (egt && egt.model && (egt.model.playersById[pid] || {}).name) || pid;
    const add = (pid, name, v) => {
      if (!pid) return;
      map[pid] = map[pid] || { name: name || pid, total: 0 };
      map[pid].total += v || 0;
    };
    if (egt && egt.live && egt.live.money && egt.live.money.total) {
      Object.entries(egt.live.money.total).forEach(([pid, v]) => add(pid, nameOf(pid), v));
    }
    const finalized = new Set(egt && egt.state ? egt.state.finalized : []);
    rounds.forEach(r => {
      if (!r.egtRoundId || finalized.has(r.egtRoundId) || !r.money) return;
      r.players.forEach(p => add(p.id, p.name, r.money[p.id] || 0));
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }

  // ── FACTS: the cached computed statistics the ticker renders from ─────────
  function computeFacts(world) {
    const now = world.now || Date.now();
    const egtSeed = world.egtSeed || g('EGT_SEED');
    let egtModelForSync = null;
    try {
      const EgtImporter = g('EgtImporter');
      if (egtSeed && EgtImporter) egtModelForSync = EgtImporter.importSeed(egtSeed);
    } catch (e) {}
    const egtBySync = _egtNativeRounds(egtModelForSync);

    const allRounds = (world.docs || [])
      .map(d => normalizeRound(d, egtBySync, now))
      .filter(Boolean)
      .map(computeRoundFacts)
      .sort((a, b) => b.lastTouch - a.lastTouch);

    // The Bottom Line is an EGT Cup broadcast: ONLY rounds that belong to the
    // EGT tournament feed it. Any other round synced to the same project
    // (casual rounds, other golf trips) is ignored entirely.
    const rounds = allRounds.filter(r => r.isEgt);

    const liveRounds = rounds.filter(r => r.status === 'live');
    const { records, career } = computeRecords(rounds);
    const egt = computeEgtFacts(world, rounds);

    // Running bankroll — the tournament engine is the single source of truth
    // for money (finalized rounds, incl. Pass-the-Money + stake overrides),
    // topped up with live native money for any EGT round still in progress.
    const moneyBoard = buildEgtMoneyBoard(egt, rounds);

    return {
      now, rounds, liveRounds,
      trips: [],                 // EGT-only: generic trip leaderboards excluded
      egt,
      records, career, moneyBoard,
      fun: computeFunFacts(rounds),
      players: world.players || [],
    };
  }

  // ── SEGMENT BUILDERS (the modular registry) ───────────────────────────────
  // Each builder: { id, category, build(facts) -> segment[] }. Rotation order
  // comes from CATEGORY_ORDER; buildFeed round-robins one segment per category
  // so the feed always cycles Money → Leaderboard → Stats → Format → Fun → …
  const CATEGORY_ORDER = ['live', 'leaderboard', 'money', 'format', 'stats', 'egt', 'fun', 'spotlight', 'records', 'schedule'];

  const BUILDERS = [];
  function register(builder) { BUILDERS.push(builder); }

  // LIVE NOW — current round, current hole, who's on the course.
  register({ id: 'liveNow', category: 'live', build(f) {
    return f.liveRounds.map(r => {
      const parts = [P.val('LIVE'), P.text('·'), P.name(r.course.name.toUpperCase())];
      if (r.currentHoleIdx != null) { parts.push(P.sep(), P.text('HOLE'), P.val(String(r.currentHoleIdx + 1))); }
      const onCourse = r.players.filter(p => r.thru[p.id] < r.course.holes.length);
      const done = r.players.filter(p => r.thru[p.id] >= r.course.holes.length && r.course.holes.length > 0);
      if (onCourse.length) parts.push(P.sep(), P.dim('ON COURSE'), P.text(onCourse.map(p => p.name).join(', ')));
      if (done.length) parts.push(P.sep(), P.dim('FINISHED'), P.text(done.map(p => p.name).join(', ')));
      return { id: `live:${r.syncCode}`, category: 'live', icon: '🔴', label: 'LIVE NOW', parts };
    });
  }});

  // Round leaderboards — gross + net, front/back lows, high round.
  register({ id: 'roundBoard', category: 'leaderboard', build(f) {
    const segs = [];
    f.rounds.filter(r => r.hasScores).slice(0, 6).forEach(r => {
      if (!r.lines.length) return;
      const parts = [];
      r.lines.forEach((l, i) => {
        if (i) parts.push(P.sep());
        parts.push(P.dim(`${i + 1}.`), P.name(l.name), P.val(fmtToPar(l.toPar)),
          P.dim(l.thru >= r.course.holes.length ? 'F' : `thru ${l.thru}`));
      });
      segs.push({ id: `lb:${r.syncCode}`, category: 'leaderboard', icon: '⛳',
        label: `${r.status === 'live' ? 'LIVE · ' : ''}${r.course.name.toUpperCase()}`, parts });

      const netLead = first(r.linesNet), grossLead = first(r.lines);
      if (netLead && grossLead && r.lines.length > 1) {
        segs.push({ id: `lb:net:${r.syncCode}`, category: 'leaderboard', icon: '🎖️',
          label: `${r.course.name.toUpperCase()} · LEADERS`,
          parts: [P.dim('GROSS'), P.name(grossLead.name), P.val(fmtToPar(grossLead.toPar)),
                  P.sep(), P.dim('NET'), P.name(netLead.name), P.val(fmtToPar(netLead.netToPar))] });
      }
      const fronts = r.nines.filter(n => n.front).sort((a, b) => a.front.toPar - b.front.toPar);
      const backs  = r.nines.filter(n => n.back).sort((a, b) => a.back.toPar - b.back.toPar);
      if (fronts.length || backs.length) {
        const parts2 = [];
        if (fronts.length) parts2.push(P.dim('LOW FRONT'), P.name(fronts[0].name), P.val(`${fronts[0].front.gross} (${fmtToPar(fronts[0].front.toPar)})`));
        if (fronts.length && backs.length) parts2.push(P.sep());
        if (backs.length) parts2.push(P.dim('LOW BACK'), P.name(backs[0].name), P.val(`${backs[0].back.gross} (${fmtToPar(backs[0].back.toPar)})`));
        segs.push({ id: `lb:nines:${r.syncCode}`, category: 'leaderboard', icon: '9️⃣',
          label: `${r.course.name.toUpperCase()} · NINES`, parts: parts2 });
      }
      if (r.complete && r.lines.length > 1) {
        const hi = r.lines[r.lines.length - 1];
        segs.push({ id: `lb:hilo:${r.syncCode}`, category: 'leaderboard', icon: '📊',
          label: `${r.course.name.toUpperCase()} · FINAL`,
          parts: [P.dim('LOW ROUND'), P.name(grossLead.name), P.val(String(grossLead.gross)),
                  P.sep(), P.dim('HIGH ROUND'), P.name(hi.name), P.val(String(hi.gross))] });
      }
    });
    return segs;
  }});

  // MONEY — running bankroll, biggest up/down, per-round payouts.
  register({ id: 'money', category: 'money', build(f) {
    const segs = [];
    if (f.moneyBoard.length) {
      const parts = [];
      f.moneyBoard.forEach((m, i) => {
        if (i) parts.push(P.sep());
        parts.push(P.name(m.name), upDown(m.total, fmtMoney(m.total)));
      });
      segs.push({ id: 'money:bank', category: 'money', icon: '💰', label: 'RUNNING BANKROLL', parts });
      const up = f.moneyBoard[0], down = f.moneyBoard[f.moneyBoard.length - 1];
      if (f.moneyBoard.length > 1 && (up.total > 0 || down.total < 0)) {
        segs.push({ id: 'money:updown', category: 'money', icon: '📈',
          label: 'MONEY MOVERS',
          parts: [P.dim('UP THE MOST'), P.name(up.name), P.up(fmtMoney(up.total)),
                  P.sep(), P.dim('DOWN THE MOST'), P.name(down.name), P.down(fmtMoney(down.total))] });
      }
    }
    // Per-round money. Finalized EGT rounds use the engine's authoritative
    // per-round totals; in-progress rounds use live native payouts — so the
    // per-round cards never contradict the running bankroll above.
    const egtByRound = (f.egt && f.egt.live && f.egt.live.money && f.egt.live.money.byRound) || {};
    const finalized = new Set(f.egt && f.egt.state ? f.egt.state.finalized : []);
    const nameOf = pid => (f.egt && f.egt.model && (f.egt.model.playersById[pid] || {}).name) || pid;
    f.rounds.filter(r => r.hasScores).slice(0, 6).forEach(r => {
      let totals = null, live = true;
      if (r.egtRoundId && finalized.has(r.egtRoundId) && egtByRound[r.egtRoundId]) {
        totals = egtByRound[r.egtRoundId].total; live = false;
      } else if (r.money) {
        totals = r.money;
      }
      if (!totals) return;
      const ranked = Object.entries(totals).map(([pid, v]) => ({ name: nameOf(pid), v }))
        .filter(x => x.v !== 0).sort((a, b) => b.v - a.v);
      if (!ranked.length) return;
      const parts = [];
      ranked.forEach((x, i) => { if (i) parts.push(P.sep()); parts.push(P.name(x.name), upDown(x.v, fmtMoney(x.v))); });
      segs.push({ id: `money:${r.syncCode}`, category: 'money', icon: '💵',
        label: `${live ? 'LIVE MONEY · ' : 'PAYOUTS · '}${r.course.name.toUpperCase()}`, parts });
    });
    return segs;
  }});

  // FORMATS — live standings for every active format engine.
  register({ id: 'formats', category: 'format', build(f) {
    const segs = [];
    f.rounds.filter(r => r.hasScores).slice(0, 4).forEach(r => {
      r.formatBoards.forEach(b => {
        const parts = [];
        if (b.leader) parts.push(P.dim('LEADER'), P.name(b.leader), P.sep());
        b.lines.slice(0, 4).forEach((line, i) => { if (i) parts.push(P.sep()); parts.push(P.text(line)); });
        if (!parts.length) return;
        segs.push({ id: `fmt:${r.syncCode}:${b.type}`, category: 'format', icon: b.icon,
          label: `${b.label.toUpperCase()} · ${r.course.name.toUpperCase()}`, parts });
      });
    });
    return segs;
  }});

  // STATS — every stat line the stats engine produces.
  register({ id: 'stats', category: 'stats', build(f) {
    const segs = [];
    f.rounds.filter(r => r.hasScores).slice(0, 3).forEach(r => {
      const entries = r.players.map(p => ({ p, st: r.stats[p.id] })).filter(x => x.st);
      if (!entries.length) return;
      const statSegs = [
        { key: 'putts', icon: '🎯', label: 'PUTTS', mk: x => x.st.putts.holes > 0 && [P.name(x.p.name), P.val(String(x.st.putts.total)), P.dim(`(${x.st.putts.perHole.toFixed(1)}/hole · ${x.st.putts.onePutts}×1putt · ${x.st.putts.threePutts}×3putt)`)] },
        { key: 'gir', icon: '🟢', label: 'GREENS IN REG', mk: x => x.st.gir.pct != null && [P.name(x.p.name), P.val(`${x.st.gir.pct}%`), P.dim(`(${x.st.gir.hit}/${x.st.gir.eligible})`)] },
        { key: 'fir', icon: '🎯', label: 'FAIRWAYS', mk: x => x.st.fir.pct != null && [P.name(x.p.name), P.val(`${x.st.fir.pct}%`), P.dim(`(${x.st.fir.hit}/${x.st.fir.eligible})`)] },
        { key: 'counts', icon: '🃏', label: 'SCORECARD', mk: x => {
          const c = x.st.counts;
          const bits = [];
          if (c.eagles) bits.push(`${c.eagles} EAG`);
          if (c.birdies) bits.push(`${c.birdies} BIRD`);
          bits.push(`${c.pars} PAR`, `${c.bogeys} BOG`);
          if (c.doubles + c.triplePlus) bits.push(`${c.doubles + c.triplePlus} DBL+`);
          return [P.name(x.p.name), P.val(bits.join(' · '))];
        } },
        { key: 'sand', icon: '🏖️', label: 'SAND SAVES', mk: x => x.st.sandSaves.att > 0 && [P.name(x.p.name), P.val(`${x.st.sandSaves.made}/${x.st.sandSaves.att}`)] },
        { key: 'pen', icon: '⚠️', label: 'PENALTY STROKES', mk: x => x.st.penalties > 0 && [P.name(x.p.name), P.down(String(x.st.penalties))] },
        { key: 'drv', icon: '🚀', label: 'LONGEST DRIVE', mk: x => x.st.longestDrive && [P.name(x.p.name), P.val(`${x.st.longestDrive} yds`)] },
        { key: 'lp', icon: '🎱', label: 'LONGEST PUTT', mk: x => x.st.longestPutt && [P.name(x.p.name), P.val(`${x.st.longestPutt} ft`)] },
        { key: 'p3', icon: '3️⃣', label: 'PAR-3 SCORING', mk: x => x.st.parAverages[3] != null && [P.name(x.p.name), P.val(x.st.parAverages[3].toFixed(2))] },
        { key: 'p4', icon: '4️⃣', label: 'PAR-4 SCORING', mk: x => x.st.parAverages[4] != null && [P.name(x.p.name), P.val(x.st.parAverages[4].toFixed(2))] },
        { key: 'p5', icon: '5️⃣', label: 'PAR-5 SCORING', mk: x => x.st.parAverages[5] != null && [P.name(x.p.name), P.val(x.st.parAverages[5].toFixed(2))] },
        { key: 'ud', icon: '🎽', label: 'SCRAMBLING', mk: x => x.st.upDowns.att > 0 && [P.name(x.p.name), P.val(`${x.st.upDowns.made}/${x.st.upDowns.att} up&down`)] },
      ];
      statSegs.forEach(def => {
        const parts = [];
        entries.forEach(x => {
          const chunk = def.mk(x);
          if (chunk) { if (parts.length) parts.push(P.sep()); parts.push(...chunk); }
        });
        if (parts.length) segs.push({ id: `stat:${r.syncCode}:${def.key}`, category: 'stats',
          icon: def.icon, label: `${def.label} · ${r.course.name.toUpperCase()}`, parts });
      });
    });
    return segs;
  }});

  // EGT CUP — points standings, money, climbers, skins, next round, awards.
  register({ id: 'egtCup', category: 'egt', build(f) {
    const e = f.egt;
    if (!e || !e.live) return [];
    const segs = [];
    const L = e.live;
    if (L.standings && L.standings.length) {
      const parts = [];
      L.standings.forEach((s, i) => {
        if (i) parts.push(P.sep());
        parts.push(P.dim(`${s.rank}.`), P.name(s.name), P.val(`${s.points} pts`));
        if (s.direction === 'up') parts.push(P.up(`▲${s.move}`));
        if (s.direction === 'down') parts.push(P.down(`▼${Math.abs(s.move)}`));
      });
      segs.push({ id: 'egt:standings', category: 'egt', icon: '🏆',
        label: `${e.model.trip.name} STANDINGS`, parts });
      const leader = L.standings[0];
      segs.push({ id: 'egt:leader', category: 'egt', icon: '👑', label: 'TRIP LEADER',
        parts: [P.name(leader.name.toUpperCase()), P.val(`${leader.points} pts`),
                P.dim(`of ${leader.maxPossible} possible`)] });
      if (L.standings.length > 2) {
        const last = L.standings[L.standings.length - 1];
        segs.push({ id: 'egt:last', category: 'fun', icon: '🐢', label: 'CURRENT LAST PLACE',
          parts: [P.name(last.name), P.down(`${last.points} pts`), P.dim(`${last.rank}th`)] });
      }
    }
    // (Cup money is surfaced by the RUNNING BANKROLL segment, which is built
    // from this same engine total — no separate EGT-money card needed.)
    if (e.climber) segs.push({ id: 'egt:climber', category: 'fun', icon: '📈', label: 'BIGGEST CLIMBER',
      parts: [P.name(e.climber.name), P.up(`▲${e.climber.moved} spots`)] });
    if (e.dropper) segs.push({ id: 'egt:dropper', category: 'fun', icon: '📉', label: 'BIGGEST DROP',
      parts: [P.name(e.dropper.name), P.down(`▼${Math.abs(e.dropper.moved)} spots`)] });
    if (L.skins) {
      const ranked = Object.entries(L.skins)
        .map(([pid, n]) => ({ name: (e.model.playersById[pid] || {}).name || pid, n }))
        .filter(x => x.n > 0).sort((a, b) => b.n - a.n);
      if (ranked.length) {
        const parts = [];
        ranked.forEach((x, i) => { if (i) parts.push(P.sep()); parts.push(P.name(x.name), P.val(`${x.n} skins`)); });
        segs.push({ id: 'egt:skins', category: 'format', icon: '💵', label: 'SKINS KING RACE', parts });
      }
    }
    if (L.tourneyStats) {
      const rows = Object.entries(L.tourneyStats)
        .map(([pid, st]) => ({ name: (e.model.playersById[pid] || {}).name || pid, st }))
        .filter(x => x.st.rounds > 0);
      if (rows.length) {
        const byBird = rows.slice().sort((a, b) => b.st.grossBirdies - a.st.grossBirdies)[0];
        const byPutt = rows.filter(x => x.st.putts > 0).sort((a, b) => (a.st.putts / a.st.rounds) - (b.st.putts / b.st.rounds))[0];
        const parts = [];
        if (byBird && byBird.st.grossBirdies > 0) parts.push(P.dim('BIRDIE KING'), P.name(byBird.name), P.val(String(byBird.st.grossBirdies)));
        if (byPutt) { if (parts.length) parts.push(P.sep()); parts.push(P.dim('FLAT STICK'), P.name(byPutt.name), P.val(`${(byPutt.st.putts / byPutt.st.rounds).toFixed(1)} putts/rd`)); }
        if (parts.length) segs.push({ id: 'egt:awards', category: 'stats', icon: '🏅', label: 'EGT CUP AWARD RACES', parts });
      }
    }
    return segs;
  }});

  // Schedule — next round up (works before any scores exist too).
  register({ id: 'schedule', category: 'schedule', build(f) {
    const e = f.egt;
    if (!e || !e.model) return [];
    const model = e.model;
    const played = new Set(e.state ? e.state.finalized : []);
    const next = model.rounds.find(r => !played.has(r.id));
    const segs = [];
    if (next) {
      const course = model.courses[next.courseId] || {};
      const parts = [P.val(next.id), P.name((course.name || '').toUpperCase()), P.dim(next.date || '')];
      if (next.teeTimeTarget) parts.push(P.sep(), P.dim('TEE TIME'), P.text(next.teeTimeTarget));
      if (next.primaryGame) parts.push(P.sep(), P.text(String(next.primaryGame)));
      segs.push({ id: 'egt:next', category: 'schedule', icon: '📅', label: 'NEXT ROUND', parts });
    }
    const parts = [];
    model.rounds.forEach((r, i) => {
      if (i) parts.push(P.sep());
      const course = model.courses[r.courseId] || {};
      parts.push(P.val(r.id), P.text(course.name || ''), P.dim(r.date || ''));
    });
    segs.push({ id: 'egt:sched', category: 'schedule', icon: '🗓️', label: `${model.trip.name} SCHEDULE`, parts });
    return segs;
  }});

  // FUN — streaks, blowups, recoveries, worst hole.
  register({ id: 'fun', category: 'fun', build(f) {
    const segs = [];
    const fun = f.fun;
    if (fun.birdieStreak) segs.push({ id: 'fun:bstreak', category: 'fun', icon: '🔥', label: 'LONGEST BIRDIE STREAK',
      parts: [P.name(fun.birdieStreak.name), P.val(`${fun.birdieStreak.n} in a row`), P.dim(fun.birdieStreak.course)] });
    if (fun.parStreak) segs.push({ id: 'fun:pstreak', category: 'fun', icon: '🧊', label: 'PAR MACHINE',
      parts: [P.name(fun.parStreak.name), P.val(`${fun.parStreak.n} straight pars`), P.dim(fun.parStreak.course)] });
    if (fun.bogeyStreak) segs.push({ id: 'fun:bostreak', category: 'fun', icon: '💀', label: 'ROUGH STRETCH',
      parts: [P.name(fun.bogeyStreak.name), P.down(`${fun.bogeyStreak.n} straight over par`), P.dim(fun.bogeyStreak.course)] });
    const blow = Object.entries(fun.blowups).sort((a, b) => b[1] - a[1])[0];
    if (blow && blow[1] >= 2) segs.push({ id: 'fun:blowups', category: 'fun', icon: '🧨', label: 'MOST BLOWUPS',
      parts: [P.name(blow[0]), P.down(`${blow[1]} doubles or worse`)] });
    const rec = fun.recoveries[fun.recoveries.length - 1];
    if (rec) segs.push({ id: 'fun:recovery', category: 'fun', icon: '💪', label: 'BEST RECOVERY',
      parts: [P.name(rec.name), P.up(`birdie right after a double`), P.dim(`hole ${rec.hole} · ${rec.course}`)] });
    if (fun.worstHole && fun.worstHole.over >= 3) segs.push({ id: 'fun:worsthole', category: 'fun', icon: '🕳️', label: 'WORST HOLE OF THE TRIP',
      parts: [P.name(fun.worstHole.name), P.down(`${fun.worstHole.gross} (+${fun.worstHole.over})`), P.dim(`hole ${fun.worstHole.hole} · ${fun.worstHole.course}`)] });
    if (fun.mostOnePutts) segs.push({ id: 'fun:oneputt', category: 'fun', icon: '🎩', label: 'LUCKIEST FLAT STICK',
      parts: [P.name(fun.mostOnePutts.name), P.up(`${fun.mostOnePutts.n} one-putts`)] });
    if (fun.mostThreePutts) segs.push({ id: 'fun:threeputt', category: 'fun', icon: '😖', label: 'UNLUCKIEST GREENS',
      parts: [P.name(fun.mostThreePutts.name), P.down(`${fun.mostThreePutts.n} three-putts`)] });
    return segs;
  }});

  // SPOTLIGHT — player of the moment: hottest recent form.
  register({ id: 'spotlight', category: 'spotlight', build(f) {
    const r = first(f.liveRounds) || first(f.rounds.filter(x => x.hasScores));
    if (!r || !r.lines.length) return [];
    const l = r.lines[0];
    const st = r.stats[l.id];
    const bank = f.moneyBoard.find(m => m.name.toLowerCase() === String(l.name).toLowerCase());
    const parts = [P.name(l.name.toUpperCase()), P.val(fmtToPar(l.toPar)),
      P.dim(l.thru >= r.course.holes.length ? 'FINAL' : `thru ${l.thru}`), P.sep(), P.dim('P1 ·'), P.text(r.course.name)];
    if (st) {
      parts.push(P.sep(), P.dim('PUTTS'), P.val(String(st.putts.total)));
      if (st.counts.birdies) parts.push(P.sep(), P.dim('BIRDIES'), P.up(String(st.counts.birdies)));
    }
    if (bank) parts.push(P.sep(), P.dim('BANKROLL'), upDown(bank.total, fmtMoney(bank.total)));
    return [{ id: `spot:${r.syncCode}:${l.id}`, category: 'spotlight', icon: '⭐', label: 'PLAYER OF THE MOMENT', parts }];
  }});

  // RECORDS + CAREER — the trip record book.
  register({ id: 'records', category: 'records', build(f) {
    const segs = [];
    const rec = f.records;
    if (rec.bestRound) segs.push({ id: 'rec:best', category: 'records', icon: '📜', label: 'BEST ROUND ON RECORD',
      parts: [P.name(rec.bestRound.name), P.val(`${rec.bestRound.gross} (${fmtToPar(rec.bestRound.toPar)})`), P.dim(rec.bestRound.course)] });
    if (rec.worstRound && rec.bestRound
        && !(rec.worstRound.code === rec.bestRound.code && rec.worstRound.name === rec.bestRound.name))
      segs.push({ id: 'rec:worst', category: 'records', icon: '🙈', label: 'WORST ROUND ON RECORD',
        parts: [P.name(rec.worstRound.name), P.down(`${rec.worstRound.gross} (${fmtToPar(rec.worstRound.toPar)})`), P.dim(rec.worstRound.course)] });
    if (rec.mostBirdies) segs.push({ id: 'rec:birdies', category: 'records', icon: '🐦', label: 'MOST BIRDIES · ONE ROUND',
      parts: [P.name(rec.mostBirdies.name), P.val(String(rec.mostBirdies.n)), P.dim(rec.mostBirdies.course)] });
    if (rec.lowNine) segs.push({ id: 'rec:lownine', category: 'records', icon: '9️⃣', label: 'LOWEST NINE ON RECORD',
      parts: [P.name(rec.lowNine.name), P.val(`${rec.lowNine.gross} (${fmtToPar(rec.lowNine.toPar)})`), P.dim(`${rec.lowNine.label} · ${rec.lowNine.course}`)] });
    if (rec.biggestPayday) segs.push({ id: 'rec:payday', category: 'records', icon: '🤑', label: 'BIGGEST SINGLE-ROUND PAYDAY',
      parts: [P.name(rec.biggestPayday.name), P.up(fmtMoney(rec.biggestPayday.n)), P.dim(rec.biggestPayday.course)] });
    const careers = Object.values(f.career).filter(c => c.rounds > 1);
    if (careers.length) {
      const byEarn = careers.slice().sort((a, b) => b.earnings - a.earnings)[0];
      if (byEarn && byEarn.earnings !== 0) segs.push({ id: 'rec:career', category: 'records', icon: '💼', label: 'CAREER EARNINGS LEADER',
        parts: [P.name(byEarn.name), upDown(byEarn.earnings, fmtMoney(byEarn.earnings)), P.dim(`${byEarn.rounds} rounds · ${byEarn.wins} cashes`)] });
    }
    return segs;
  }});

  // ── FEED — interleave categories so the ticker rotates topics ─────────────
  function buildFeed(facts) {
    const byCat = {};
    BUILDERS.forEach(b => {
      let segs = [];
      try { segs = b.build(facts) || []; } catch (e) {}
      segs.forEach(s => {
        (byCat[s.category] = byCat[s.category] || []).push(s);
      });
    });
    const cats = CATEGORY_ORDER.filter(c => byCat[c] && byCat[c].length)
      .concat(Object.keys(byCat).filter(c => !CATEGORY_ORDER.includes(c)));
    const feed = [];
    let remaining = true;
    const idx = {};
    while (remaining) {
      remaining = false;
      cats.forEach(c => {
        const list = byCat[c];
        const i = idx[c] || 0;
        if (i < list.length) { feed.push(list[i]); idx[c] = i + 1; remaining = true; }
      });
    }
    return feed;
  }

  // ── ALERTS — breaking-news cards from diffing two fact snapshots ──────────
  function _holeAlertsForRound(prev, next) {
    const alerts = [];
    if (!prev) return alerts;
    const holes = next.course.holes;
    next.players.forEach(p => {
      const before = (prev.scores && prev.scores[p.id]) || [];
      const after = next.scores[p.id] || [];
      for (let i = 0; i < holes.length; i++) {
        if (!(after[i] > 0) || before[i] === after[i]) continue;
        const d = after[i] - holes[i].par;
        const who = String(p.name || '').toUpperCase();
        const hole = i + 1;
        if (after[i] === 1) alerts.push({ icon: '🕳️', tone: 'hot', label: 'HOLE IN ONE',
          parts: [P.name(who), P.up('ACES'), P.val(`HOLE ${hole}`), P.dim(next.course.name)] });
        else if (d <= -2) alerts.push({ icon: '🦅', tone: 'hot', label: 'EAGLE ALERT',
          parts: [P.name(who), P.up(`EAGLE ON ${hole}`), P.dim(next.course.name)] });
        else if (d === -1) alerts.push({ icon: '🔥', tone: 'up', label: 'BIRDIE',
          parts: [P.name(who), P.up(`JUST MADE BIRDIE ON ${hole}`), P.dim(next.course.name)] });
        else if (d === 2) alerts.push({ icon: '💀', tone: 'down', label: 'DOUBLE BOGEY ALERT',
          parts: [P.name(who), P.down(`DOUBLE ON ${hole}`), P.dim(next.course.name)] });
        else if (d > 2) alerts.push({ icon: '📉', tone: 'down', label: 'MELTDOWN ALERT',
          parts: [P.name(who), P.down(`${after[i]} ON HOLE ${hole} (+${d})`), P.dim(next.course.name)] });
        // Hot streak: this hole capped 3+ straight under-par holes.
        if (d <= -1) {
          let run = 0;
          for (let k = i; k >= 0; k--) {
            if (after[k] > 0 && holes[k] && after[k] - holes[k].par <= -1) run++;
            else break;
          }
          if (run >= 3) alerts.push({ icon: '🔥', tone: 'hot', label: 'HOT STREAK',
            parts: [P.name(who), P.up(`${run} UNDER-PAR HOLES IN A ROW`)] });
        }
      }
    });
    return alerts;
  }

  function diffAlerts(prevFacts, facts) {
    const alerts = [];
    if (!prevFacts) return alerts;
    const prevBy = {}; prevFacts.rounds.forEach(r => { prevBy[r.syncCode] = r; });
    facts.rounds.forEach(r => {
      if (r.status !== 'live' && r.status !== 'final') return;
      alerts.push(..._holeAlertsForRound(prevBy[r.syncCode], r));

      // Round lead change.
      const prev = prevBy[r.syncCode];
      const pl = prev && first(prev.lines), nl = first(r.lines);
      if (pl && nl && pl.id !== nl.id && r.lines.length > 1) {
        alerts.push({ icon: '🏆', tone: 'hot', label: 'LEAD CHANGE',
          parts: [P.name(String(nl.name).toUpperCase()), P.up(`TAKES THE LEAD AT ${r.course.name.toUpperCase()}`), P.val(fmtToPar(nl.toPar))] });
      }

      // Format leader changes (wolf, skins, BBB, stableford, PTM holder…).
      const prevBoards = {}; ((prev && prev.formatBoards) || []).forEach(b => { prevBoards[b.type] = b; });
      r.formatBoards.forEach(b => {
        const pb = prevBoards[b.type];
        if (pb && pb.leader && b.leader && pb.leader !== b.leader) {
          const what = b.type === 'passmoney' ? 'HAS THE MONEY' : `TAKES THE ${b.label.toUpperCase()} LEAD`;
          alerts.push({ icon: b.type === 'passmoney' ? '💸' : '💰', tone: 'up', label: `${b.label.toUpperCase()} UPDATE`,
            parts: [P.name(String(b.leader).toUpperCase()), P.up(what), P.dim(r.course.name)] });
        }
      });
    });

    // Trip / EGT Cup lead change.
    const pe = prevFacts.egt && prevFacts.egt.live && first(prevFacts.egt.live.standings || []);
    const ne = facts.egt && facts.egt.live && first(facts.egt.live.standings || []);
    if (pe && ne && pe.player !== ne.player) {
      alerts.push({ icon: '👑', tone: 'hot', label: 'NEW TRIP LEADER',
        parts: [P.name(String(ne.name).toUpperCase()), P.up('NOW LEADS THE TRIP'), P.val(`${ne.points} pts`)] });
    }

    // Money leader change.
    const pm = first(prevFacts.moneyBoard), nm = first(facts.moneyBoard);
    if (pm && nm && pm.name !== nm.name && nm.total > 0) {
      alerts.push({ icon: '💰', tone: 'up', label: 'MONEY LEADER',
        parts: [P.name(String(nm.name).toUpperCase()), P.up('NOW UP THE MOST'), P.val(fmtMoney(nm.total))] });
    }

    // New trip record.
    if (prevFacts.records && facts.records && facts.records.bestRound && prevFacts.records.bestRound
        && facts.records.bestRound.toPar < prevFacts.records.bestRound.toPar) {
      const b = facts.records.bestRound;
      alerts.push({ icon: '📜', tone: 'hot', label: 'NEW TRIP RECORD',
        parts: [P.name(String(b.name).toUpperCase()), P.up(`BEST ROUND EVER — ${b.gross} (${fmtToPar(b.toPar)})`), P.dim(b.course)] });
    }

    return alerts.map((a, i) => Object.assign({
      id: `alert:${facts.now}:${i}`, category: 'alert', alert: true,
    }, a));
  }

  // ════════════════════════════════════════════════════════════════════════
  // BROADCAST LAYER — the EGT SportsCenter dashboard.
  //
  // Everything above powers the Bottom Line ticker. This section turns the same
  // cached facts into (a) the active broadcast MODE and (b) an ordered list of
  // full-screen MODULE descriptors the stage rotates through. Modules are plain
  // data (a `type` + fields); the React layer renders each type. New broadcast
  // modules are added by emitting one more descriptor here — no UI plumbing.
  // ════════════════════════════════════════════════════════════════════════

  // Player identities — logo, alias, and brand colors. Keyed by EGT player id;
  // also resolvable by display name.
  const PLAYERS = {
    brian: { id: 'brian', name: 'Brian', alias: 'Birdman',    logo: 'icons/players/brian.png', color: '#D2232A', accent: '#E0A32E' },
    john:  { id: 'john',  name: 'John',  alias: 'Gadget',     logo: 'icons/players/john.png',  color: '#C39A3B', accent: '#E4C56B' },
    tj:    { id: 'tj',    name: 'TJ',    alias: 'Straight T',  logo: 'icons/players/tj.png',    color: '#C8CDD4', accent: '#EEF1F4' },
    mike:  { id: 'mike',  name: 'Mike',  alias: 'H7',          logo: 'icons/players/mike.png',  color: '#2E5BB8', accent: '#D2232A' },
  };
  const _playerByName = {};
  Object.values(PLAYERS).forEach(p => { _playerByName[p.name.toLowerCase()] = p; });
  function playerInfo(idOrName) {
    if (!idOrName) return { id: '?', name: '?', alias: null, logo: null, color: '#C8A15A', accent: '#C8A15A' };
    const k = String(idOrName).toLowerCase();
    return PLAYERS[k] || _playerByName[k] ||
      { id: k, name: String(idOrName), alias: null, logo: null, color: '#C8A15A', accent: '#C8A15A' };
  }

  // Format labels + one-line rules, keyed by the seed's primaryGame value.
  const FORMAT_RULES = {
    'fourBallMatchPlay':        { label: 'Four-Ball Match Play + Nassau', rule: 'Better ball of each two-man team goes head to head. Front 9, Back 9, and Overall are three separate bets.' },
    'wolf':                     { label: 'Wolf',                          rule: 'The Wolf tees off last each hole and picks a partner before the next shot — or goes Lone Wolf to take the field for double.' },
    'bingoBangoBongo+nines':    { label: 'Bingo-Bango-Bongo + The Nines', rule: 'A point for first on the green (Bingo), closest once all are on (Bango), and first in the hole (Bongo).' },
    'bingoBangoBongo':          { label: 'Bingo-Bango-Bongo',             rule: 'A point for first on the green, closest once everyone is on, and first to hole out.' },
    'teamStableford':           { label: 'Team Stableford',               rule: 'Points per hole — eagle 4, birdie 3, par 2, bogey 1. The team’s best balls count.' },
    'individualStableford':     { label: 'Stableford',                    rule: 'Points per hole; highest total wins. Attack — a blow-up only costs you that hole.' },
    'roundRobinMatchPlay':      { label: 'Round-Robin Match Play',        rule: 'Everyone plays everyone head to head; the higher handicap receives the difference in strokes.' },
    'singles':                  { label: 'Singles Match Play',            rule: 'Head-to-head match play, pairings seeded by the current tournament standings.' },
    'scramble':                 { label: 'Scramble',                      rule: 'One ball per team — everyone hits, take the best, and go again.' },
  };
  function formatFor(round) {
    const key = round && round.primaryGame;
    return FORMAT_RULES[key] ||
      { label: String(key || '').replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim() || 'EGT Format', rule: '' };
  }

  // Cumulative per-player stats across the scored EGT rounds (for stat pages +
  // player cards). Reads the same StatsService lines the ticker uses.
  function aggregateEgtStats(rounds) {
    const agg = {};
    (rounds || []).forEach(r => {
      if (!r.hasScores) return;
      r.players.forEach(p => {
        const st = r.stats[p.id];
        if (!st || st.holesPlayed === 0) return;
        const a = agg[p.id] || (agg[p.id] = {
          id: p.id, name: p.name, rounds: 0, holes: 0, gross: 0, par: 0, toPar: 0,
          firHit: 0, firElig: 0, girHit: 0, girElig: 0, putts: 0, puttHoles: 0,
          onePutts: 0, threePutts: 0, birdies: 0, eagles: 0, pars: 0, bogeys: 0,
          doubles: 0, penalties: 0, longestDrive: 0,
        });
        a.rounds++; a.holes += st.holesPlayed;
        a.gross += st.gross; a.par += st.par; a.toPar += st.toPar;
        a.firHit += st.fir.hit; a.firElig += st.fir.eligible;
        a.girHit += st.gir.hit; a.girElig += st.gir.eligible;
        a.putts += st.putts.total; a.puttHoles += st.putts.holes;
        a.onePutts += st.putts.onePutts; a.threePutts += st.putts.threePutts;
        a.birdies += st.counts.birdies; a.eagles += st.counts.eagles + st.counts.aces;
        a.pars += st.counts.pars; a.bogeys += st.counts.bogeys;
        a.doubles += st.counts.doubles + st.counts.triplePlus; a.penalties += st.penalties;
        if (st.longestDrive && st.longestDrive > a.longestDrive) a.longestDrive = st.longestDrive;
      });
    });
    return Object.values(agg).map(a => Object.assign({}, a, {
      firPct: a.firElig ? Math.round(100 * a.firHit / a.firElig) : null,
      girPct: a.girElig ? Math.round(100 * a.girHit / a.girElig) : null,
      puttsPerRound: a.rounds ? a.putts / a.rounds : null,
      scoringAvg: a.rounds ? a.gross / a.rounds : null,
      avgToPar: a.rounds ? a.toPar / a.rounds : null,
    }));
  }

  // Recap of one round (winner, best net, low nines, MVP) from its fact lines.
  function roundRecap(round) {
    if (!round || !round.lines || !round.lines.length) return null;
    const gross = round.lines[0];
    const net = (round.linesNet || [])[0] || null;
    const fronts = round.nines.filter(n => n.front).sort((a, b) => a.front.toPar - b.front.toPar);
    const backs = round.nines.filter(n => n.back).sort((a, b) => a.back.toPar - b.back.toPar);
    return {
      course: round.course.name, syncCode: round.syncCode, complete: round.complete,
      winnerGross: { id: gross.id, name: gross.name, gross: gross.gross, toPar: gross.toPar },
      bestNet: net ? { id: net.id, name: net.name, net: net.net, toPar: net.netToPar } : null,
      lowFront: fronts[0] ? { id: fronts[0].id, name: fronts[0].name, gross: fronts[0].front.gross, toPar: fronts[0].front.toPar } : null,
      lowBack: backs[0] ? { id: backs[0].id, name: backs[0].name, gross: backs[0].back.gross, toPar: backs[0].back.toPar } : null,
      mvp: net ? { id: net.id, name: net.name } : { id: gross.id, name: gross.name },
    };
  }

  // Which broadcast mode is active. Data-driven and automatic:
  //   live  → a round is actively being scored right now
  //   post  → scoring has happened but nothing is live (EGT SportsCenter)
  //   pre   → nothing scored yet (pre-round dashboard)
  // opts.force overrides (manual control on the page).
  function broadcastMode(facts, opts) {
    if (opts && opts.force) return opts.force;
    if (facts.liveRounds && facts.liveRounds.length) return 'live';
    return (facts.rounds || []).some(r => r.hasScores) ? 'post' : 'pre';
  }

  function _standingsModule(facts) {
    const egt = facts.egt;
    if (!egt || !egt.live || !egt.live.standings || !egt.live.standings.length) return null;
    const rows = egt.live.standings.map(s => {
      const info = playerInfo(s.player);
      const bank = facts.moneyBoard.find(m => m.name.toLowerCase() === info.name.toLowerCase());
      return Object.assign({}, info, {
        rank: s.rank, points: s.points, maxPossible: s.maxPossible,
        move: s.move, direction: s.direction, money: bank ? bank.total : null,
      });
    });
    return { id: 'standings', type: 'standings', tripName: egt.model.trip.name, rows };
  }

  function _statsModules(facts, agg) {
    const defs = [
      { key: 'scoringAvg',    title: 'SCORING AVERAGE',      lower: true,  fmt: v => v.toFixed(1),   get: a => a.scoringAvg },
      { key: 'firPct',        title: 'FAIRWAYS HIT',         lower: false, fmt: v => v + '%',         get: a => a.firPct },
      { key: 'girPct',        title: 'GREENS IN REGULATION', lower: false, fmt: v => v + '%',         get: a => a.girPct },
      { key: 'puttsPerRound', title: 'PUTTS PER ROUND',      lower: true,  fmt: v => v.toFixed(1),    get: a => a.puttsPerRound },
      { key: 'birdies',       title: 'BIRDIE COUNT',         lower: false, fmt: v => String(v),       get: a => a.birdies },
    ];
    const mods = [];
    defs.forEach(d => {
      const rows = agg.map(a => Object.assign({}, playerInfo(a.id), { value: d.get(a) }))
        .filter(r => r.value != null)
        .sort((x, y) => d.lower ? x.value - y.value : y.value - x.value);
      if (rows.length) mods.push({
        id: `stat-${d.key}`, type: 'stat-leaderboard', title: d.title,
        rows: rows.map(r => ({ id: r.id, name: r.name, alias: r.alias, logo: r.logo, color: r.color, display: d.fmt(r.value) })),
      });
    });
    const money = facts.moneyBoard.map(m => Object.assign({}, playerInfo(m.name), { value: m.total }));
    if (money.length) mods.push({
      id: 'stat-money', type: 'stat-leaderboard', title: 'MONEY LEADERS',
      rows: money.map(r => ({ id: r.id, name: r.name, alias: r.alias, logo: r.logo, color: r.color,
        display: (r.value < 0 ? '-$' : '+$') + Math.abs(Math.round(r.value)), tone: r.value >= 0 ? 'up' : 'down' })),
    });
    return mods;
  }

  // The ordered module rotation for a mode. Each entry drives one full-screen
  // stage card; the page cross-fades between them.
  function broadcastModules(facts, mode) {
    const egt = facts.egt, model = egt && egt.model;
    const mods = [];

    if (mode === 'pre' && model) {
      const played = new Set(egt.state ? egt.state.finalized : []);
      const next = model.rounds.find(r => !played.has(r.id)) || model.rounds[0];
      const course = model.courses[next.courseId] || {};
      const fmt = formatFor(next);
      mods.push({ id: 'pre-hero', type: 'pre-round', tripName: model.trip.name, round: next.id,
        courseName: course.name, location: course.location, date: next.date,
        teeTime: next.teeTimeTarget, formatLabel: fmt.label });
      mods.push({ id: 'pre-format', type: 'format-rules', roundLabel: next.id, formatLabel: fmt.label, rule: fmt.rule });
      const teams = (next.teams || []).map(t => ({ name: t.name, players: t.players.map(playerInfo) }));
      mods.push({ id: 'pre-pairings', type: 'pairings', roundLabel: next.id,
        teams, players: (next.players || []).map(playerInfo) });
      mods.push({ id: 'pre-schedule', type: 'schedule', tripName: model.trip.name,
        rounds: model.rounds.map(r => ({ id: r.id, course: (model.courses[r.courseId] || {}).name,
          date: r.date, tee: r.teeTimeTarget, done: played.has(r.id) })) });
      const lastComplete = (facts.rounds || []).find(r => r.complete);
      if (lastComplete) {
        const rec = roundRecap(lastComplete);
        if (rec) mods.push({ id: 'pre-prev', type: 'prev-winner', course: rec.course,
          winner: Object.assign({}, playerInfo(rec.winnerGross.id), rec.winnerGross) });
      }
      mods.push({ id: 'pre-tee', type: 'tee-off', round: next.id, teeTime: next.teeTimeTarget, courseName: course.name });
    }

    if (mode === 'live') {
      (facts.liveRounds || []).forEach(r => {
        const holeN = r.course.holes.length;
        mods.push({ id: `live-lb-${r.syncCode}`, type: 'live-leaderboard', courseName: r.course.name,
          currentHole: r.currentHoleIdx != null ? r.currentHoleIdx + 1 : null,
          lines: r.lines.map(l => Object.assign({}, playerInfo(l.id),
            { toPar: l.toPar, thru: l.thru, gross: l.gross, done: l.thru >= holeN })) });
        const money = facts.moneyBoard.map(m => Object.assign({}, playerInfo(m.name), { total: m.total }));
        if (money.length) mods.push({ id: `live-money-${r.syncCode}`, type: 'live-money', courseName: r.course.name, lines: money });
        r.formatBoards.forEach(b => mods.push({ id: `live-fmt-${r.syncCode}-${b.type}`, type: 'format-board',
          formatLabel: b.label, icon: b.icon, courseName: r.course.name,
          leader: b.leader ? playerInfo(b.leader) : null, lines: b.lines }));
        mods.push({ id: `live-onc-${r.syncCode}`, type: 'on-course', courseName: r.course.name,
          currentHole: r.currentHoleIdx != null ? r.currentHoleIdx + 1 : null,
          onCourse: r.players.filter(p => r.thru[p.id] < holeN).map(p => Object.assign({}, playerInfo(p.id), { thru: r.thru[p.id] })),
          done: r.players.filter(p => r.thru[p.id] >= holeN && holeN).map(p => playerInfo(p.id)) });
      });
      const sm = _standingsModule(facts); if (sm) mods.push(sm);
    }

    if (mode === 'post') {
      const sm = _standingsModule(facts); if (sm) mods.push(sm);
      const lastScored = (facts.rounds || []).find(r => r.complete) || (facts.rounds || [])[0];
      if (lastScored) {
        const rec = roundRecap(lastScored);
        if (rec) {
          mods.push({ id: 'post-recap', type: 'round-recap', course: rec.course,
            winner: Object.assign({}, playerInfo(rec.winnerGross.id), rec.winnerGross),
            net:   rec.bestNet  ? Object.assign({}, playerInfo(rec.bestNet.id), rec.bestNet)   : null,
            front: rec.lowFront ? Object.assign({}, playerInfo(rec.lowFront.id), rec.lowFront) : null,
            back:  rec.lowBack  ? Object.assign({}, playerInfo(rec.lowBack.id), rec.lowBack)   : null });
          const mvp = playerInfo(rec.mvp.id);
          const mstats = lastScored.stats[rec.mvp.id];
          const bank = facts.moneyBoard.find(m => m.name.toLowerCase() === mvp.name.toLowerCase());
          mods.push({ id: 'post-mvp', type: 'player-of-round', player: mvp, course: rec.course,
            net: rec.bestNet ? rec.bestNet.net : null, birdies: mstats ? mstats.counts.birdies : 0,
            putts: mstats ? mstats.putts.total : null, money: bank ? bank.total : null });
          const fw = lastScored.formatBoards.filter(b => b.leader)
            .map(b => ({ formatLabel: b.label, icon: b.icon, winner: playerInfo(b.leader) }));
          if (fw.length) mods.push({ id: 'post-fmtwin', type: 'format-winners', course: rec.course, winners: fw });
        }
      }
      const agg = aggregateEgtStats(facts.rounds);
      const standings = (egt && egt.live && egt.live.standings) || [];
      const skinsOf = (egt && egt.live && egt.live.skins) || {};
      agg.forEach(a => {
        const info = playerInfo(a.id);
        const st = standings.find(s => s.player === a.id) || {};
        const bank = facts.moneyBoard.find(m => m.name.toLowerCase() === info.name.toLowerCase());
        mods.push({ id: `post-player-${a.id}`, type: 'player-card', player: info,
          rank: st.rank || null, points: st.points != null ? st.points : null, rounds: a.rounds,
          scoringAvg: a.scoringAvg, avgToPar: a.avgToPar, money: bank ? bank.total : null,
          skins: skinsOf[a.id] || 0, firPct: a.firPct, girPct: a.girPct,
          puttsPerRound: a.puttsPerRound, birdies: a.birdies });
      });
      mods.push(..._statsModules(facts, agg));
    }

    return mods.filter(Boolean);
  }

  return {
    CATEGORY_ORDER, BUILDERS, register,
    computeFacts, buildFeed, diffAlerts,
    normalizeRound, // exposed for tests
    _egtNativeRounds,
    P, fmtToPar, fmtMoney, LIVE_WINDOW_MS,
    // broadcast layer
    PLAYERS, playerInfo, FORMAT_RULES, formatFor,
    aggregateEgtStats, roundRecap, broadcastMode, broadcastModules,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { BottomLineProvider });
}
