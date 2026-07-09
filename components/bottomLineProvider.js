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

  // ── trip + records + career facts ─────────────────────────────────────────
  function computeTripFacts(world, rounds) {
    const buildTripLeaderboard = g('buildTripLeaderboard');
    const byTrip = [];
    (world.trips || []).forEach(trip => {
      const docs = rounds.filter(r => r.tripId === trip.id && r.hasScores)
        .map(r => ({ syncCode: r.syncCode, savedAt: r.savedAt, round: Object.assign({}, r.round, {
          // trip aggregation reads holeScores — synthesize from live scores too
          holeScores: r.round.holeScores || _liveHoleScores(r),
          putts: r.putts, firData: r.firData, girData: r.girData,
          payouts: r.money || r.round.payouts || {},
        }) }));
      if (!docs.length) return;
      let leaderboard = [];
      try { leaderboard = buildTripLeaderboard ? buildTripLeaderboard(docs) : []; } catch (e) {}
      byTrip.push({ trip, docs, leaderboard });
    });
    return byTrip;
  }

  function _liveHoleScores(r) {
    const out = {};
    r.players.forEach(p => {
      const arr = r.scores[p.id] || [];
      if (!arr.some(s => s > 0)) return;
      out[p.id] = r.course.holes.map((h, i) => ({
        strokes: arr[i] > 0 ? arr[i] : null,
        putts: (r.putts[p.id] || [])[i] || 0,
      }));
    });
    return out;
  }

  function computeRecords(rounds) {
    // Every round ever synced feeds the record book.
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

    const rounds = (world.docs || [])
      .map(d => normalizeRound(d, egtBySync, now))
      .filter(Boolean)
      .map(computeRoundFacts)
      .sort((a, b) => b.lastTouch - a.lastTouch);

    const liveRounds = rounds.filter(r => r.status === 'live');
    const { records, career } = computeRecords(rounds);

    // Money board — everyone's running bankroll across every synced round.
    const bank = {};
    rounds.forEach(r => {
      if (!r.money) return;
      r.players.forEach(p => {
        const key = String(p.name || p.id).toLowerCase();
        bank[key] = bank[key] || { name: p.name, total: 0 };
        bank[key].total += r.money[p.id] || 0;
      });
    });
    const moneyBoard = Object.values(bank).sort((a, b) => b.total - a.total);

    return {
      now, rounds, liveRounds,
      trips: computeTripFacts(world, rounds),
      egt: computeEgtFacts(world, rounds),
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

  // Trip leaderboards (generic golf trips).
  register({ id: 'tripBoard', category: 'leaderboard', build(f) {
    const segs = [];
    f.trips.forEach(({ trip, leaderboard }) => {
      if (!leaderboard.length) return;
      const parts = [];
      leaderboard.forEach((p, i) => {
        if (i) parts.push(P.sep());
        parts.push(P.dim(`${i + 1}.`), P.name(p.name),
          P.val(`${p.avgVsPar >= 0 ? '+' : ''}${p.avgVsPar.toFixed(1)} avg`), P.dim(`${p.rounds}R`));
      });
      segs.push({ id: `trip:${trip.id}`, category: 'leaderboard', icon: '🏆',
        label: `${(trip.name || 'TRIP').toUpperCase()} STANDINGS`, parts });
      const last = leaderboard[leaderboard.length - 1];
      if (leaderboard.length > 2) {
        segs.push({ id: `trip:last:${trip.id}`, category: 'fun', icon: '🐢',
          label: 'BRINGING UP THE REAR',
          parts: [P.name(last.name), P.down(`${last.avgVsPar >= 0 ? '+' : ''}${last.avgVsPar.toFixed(1)} avg`), P.dim('current last place')] });
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
    f.rounds.filter(r => r.money && r.hasScores).slice(0, 4).forEach(r => {
      const ranked = r.players.map(p => ({ name: p.name, v: r.money[p.id] || 0 }))
        .filter(x => x.v !== 0).sort((a, b) => b.v - a.v);
      if (!ranked.length) return;
      const parts = [];
      ranked.forEach((x, i) => { if (i) parts.push(P.sep()); parts.push(P.name(x.name), upDown(x.v, fmtMoney(x.v))); });
      segs.push({ id: `money:${r.syncCode}`, category: 'money', icon: '💵',
        label: `${r.status === 'live' ? 'LIVE MONEY · ' : 'PAYOUTS · '}${r.course.name.toUpperCase()}`, parts });
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
    }
    if (L.money && L.money.total) {
      const ranked = Object.entries(L.money.total)
        .map(([pid, v]) => ({ name: (e.model.playersById[pid] || {}).name || pid, v }))
        .sort((a, b) => b.v - a.v);
      const parts = [];
      ranked.forEach((x, i) => { if (i) parts.push(P.sep()); parts.push(P.name(x.name), upDown(x.v, fmtMoney(x.v))); });
      segs.push({ id: 'egt:money', category: 'money', icon: '💰', label: 'EGT CUP MONEY', parts });
    }
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

  return {
    CATEGORY_ORDER, BUILDERS, register,
    computeFacts, buildFeed, diffAlerts,
    normalizeRound, // exposed for tests
    _egtNativeRounds,
    P, fmtToPar, fmtMoney, LIVE_WINDOW_MS,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { BottomLineProvider });
}
