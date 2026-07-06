// egtImporter.js — ingest egt-2026-seed.json into a normalized, re-importable
// tournament model, and (re)derive every course handicap + pop array from the
// courseLibrary stroke index at runtime.
//
// Why derive rather than trust the seed's numbers? Because seed §6 requires the
// app to survive three courses shipping with stroke index unverified (holes[].si
// null) and then fill it in later. If every calculator reads pops from THIS
// module — which reads SI from courseLibrary live — the pending→verified
// transition needs no code change anywhere else. On a fully-verified seed the
// output must match strokeAllocations[*].holes exactly (the golden test).

const EgtImporter = (function () {
  const H = (typeof window !== 'undefined' && window.EgtHandicap) || EgtHandicap;

  // Allowance fraction per game (seed handicapAllowances).
  const GAME_ALLOWANCE = {
    skinsNet: 1.0,
    fourBallMatch: 0.9,
    wolf: 1.0,
    teamStableford: 0.85,
    stableford: 1.0,
    nines: 1.0,
  };

  // basis: 'offLow' subtracts the group's lowest playing handicap (match/skins/
  //         wolf); 'full' gives every player their whole playing handicap
  //         (Stableford). scope: '18' = all 18; 'loop2' = the second 9 only,
  //         scored on 9-hole stroke index (Nines).
  const GAME_RULES = {
    skinsNet:       { allowance: 1.0,  basis: 'offLow', scope: '18',  label: 'off low, over all 18' },
    fourBallMatch:  { allowance: 0.9,  basis: 'offLow', scope: '18',  label: '90% off low' },
    wolf:           { allowance: 1.0,  basis: 'offLow', scope: '18',  label: '100% off low; best net ball' },
    teamStableford: { allowance: 0.85, basis: 'full',   scope: '18',  label: '85% full dots' },
    stableford:     { allowance: 1.0,  basis: 'full',   scope: '18',  label: '100% full dots' },
    nines:          { allowance: 1.0,  basis: 'offLow', scope: 'loop2', nine: true, label: '9-hole handicaps, loop 2 only; BBB (loop 1) is gross' },
  };

  // Which handicap games apply in each round (skinsNet is always present).
  const PRIMARY_GAMES = {
    'bingoBangoBongo+nines':        ['nines'],
    'fourBallMatchPlay':            ['fourBallMatch'],
    'wolf':                         ['wolf'],
    'fourBallAggregateStableford':  ['teamStableford'],
    'scramble+alternateShot':       [],
    'championshipSingles+stableford': ['stableford'],
  };

  function gamesForRound(round) {
    const primary = PRIMARY_GAMES[round.primaryGame] || [];
    return ['skinsNet', ...primary];
  }

  // Resolve the tee actually played for a course.
  function playedTee(course) {
    return course.tees.find(t => t.name === (course.playedTee || 'White')) || course.tees[0];
  }

  // 18-hole CR/Par used for the course handicap. Two-loop 9s (loopsForRound: 2)
  // use the full 18-hole tee figures already stored (cr/par are the 18-hole
  // numbers on the White tee for Minerals/Cascades).
  function courseHandicapFor(course, hi) {
    const tee = playedTee(course);
    return H.courseHandicap(hi, tee.slope, tee.cr, course.par);
  }

  // 9-hole course handicap for the Nines loop game.
  function nineHoleHandicapFor(course, hi) {
    const tee = playedTee(course);
    const nine = tee.nine || { slope: tee.slope, cr: tee.cr / 2, par: course.par / 2 };
    return H.nineHoleCourseHandicap(hi, nine.slope, nine.cr, nine.par);
  }

  // Build the {hole, si} list a game is scored over. For '18' it's the full
  // card. For 'loop2' it's holes 10..18 renumbered to 9-hole SI (ceil(si/2)),
  // which the pending-SI path also honors (si null → null out).
  function holesForScope(course, scope) {
    const holes = course.holes || [];
    if (scope === 'loop2') {
      return holes
        .filter(h => h.hole >= 10 && h.hole <= 18)
        .map(h => ({ hole: h.hole, si: h.si == null ? null : H.nineHoleSi(h.si) }));
    }
    // '18': first 18 holes as-is.
    return holes.slice(0, 18).map(h => ({ hole: h.hole, si: h.si }));
  }

  // Course handicap per player for a round, keyed by player id.
  function computeCourseHandicaps(course, players) {
    const out = {};
    players.forEach(p => { out[p.id] = courseHandicapFor(course, p.handicapIndex); });
    return out;
  }

  // The heart of the importer: per round → per player → per game allocation,
  // derived live from courseLibrary SI. Mirrors seed.strokeAllocations exactly.
  function computeStrokeAllocations(round, course, playersById) {
    const roundPlayers = round.players.map(id => playersById[id]);
    const games = gamesForRound(round);
    const out = {};

    // Precompute each player's CH once.
    const chById = {};
    const nineChById = {};
    roundPlayers.forEach(p => {
      chById[p.id] = courseHandicapFor(course, p.handicapIndex);
      nineChById[p.id] = nineHoleHandicapFor(course, p.handicapIndex);
    });

    roundPlayers.forEach(p => {
      out[p.id] = { courseHandicap: chById[p.id], games: {} };
    });

    games.forEach(gameKey => {
      const rule = GAME_RULES[gameKey];
      const holes = holesForScope(course, rule.scope);
      // Base handicap number per player for this game (nine-hole for Nines).
      const baseCh = id => (rule.nine ? nineChById[id] : chById[id]);
      // Apply allowance to get playing handicap.
      const phById = {};
      roundPlayers.forEach(p => { phById[p.id] = H.playingHandicap(baseCh(p.id), rule.allowance); });
      const lowPh = rule.basis === 'offLow' ? Math.min(...roundPlayers.map(p => phById[p.id])) : 0;

      roundPlayers.forEach(p => {
        const strokes = phById[p.id] - lowPh;
        const pops = H.allocatePops(strokes, holes); // null when SI pending
        const entry = {
          allowance: rule.allowance,
          strokes,
          holes: pops,               // null => pending SI
          pending: pops === null,
          basis: rule.label,
        };
        if (gameKey === 'nines') entry.nineHoleCH = nineChById[p.id];
        else if (rule.allowance !== 1.0 || rule.basis === 'full') entry.playingHandicap = phById[p.id];
        out[p.id].games[gameKey] = entry;
      });
    });

    return out;
  }

  // ── Normalize the raw seed into the persisted model ──────────────────────
  function normalize(seed) {
    const playersById = {};
    seed.players.forEach(p => { playersById[p.id] = p; });

    const courses = {};
    Object.entries(seed.courseLibrary).forEach(([id, c]) => {
      courses[id] = {
        courseId: id,
        name: c.name,
        location: c.location,
        holesCount: c.holesCount,
        loopsForRound: c.loopsForRound || 1,
        tees: c.tees,
        playedTee: c.playedTee,
        par: c.par,
        // Holes carry si which may be null (pending) — never assume verified.
        holes: (c.holes || []).map(h => ({ hole: h.hole, par: h.par, si: h.si == null ? null : h.si })),
        strokeIndexVerified: !!c.strokeIndexVerified,
        note: c.note || null,
        source: c.source || null,
      };
    });

    const rounds = seed.rounds.map(r => ({
      id: r.id,
      seq: r.seq,
      date: r.date,
      courseId: r.courseId,
      playedTee: r.playedTee,
      teeTimeTarget: r.teeTimeTarget,
      players: r.players,
      primaryGame: r.primaryGame,
      allowance: r.allowance,
      teams: r.teams || [],
      seedCourseHandicaps: r.courseHandicaps || {},   // kept for reference/QA
    }));

    return {
      schemaVersion: seed.schemaVersion,
      trip: seed.trip,
      players: seed.players,
      playersById,
      handicapAllowances: seed.handicapAllowances,
      courses,
      rounds,
      formatConfigs: seed.formatConfigs,
      sideGames: seed.sideGames,
      pointsConfig: seed.pointsConfig,
      moneyDefaults: seed.moneyDefaults,
      // Derived, recomputed from courseLibrary SI (the live source of truth):
      derived: {},
      // The seed's own allocations, retained so a golden test can diff.
      seedStrokeAllocations: seed.strokeAllocations,
    };
  }

  // Recompute derived course handicaps + allocations for every round. Called on
  // import and again whenever a course's SI is edited (seed §6.3).
  function recomputeAll(model) {
    model.derived = {};
    model.rounds.forEach(round => {
      const course = model.courses[round.courseId];
      model.derived[round.id] = {
        courseHandicaps: computeCourseHandicaps(course, round.players.map(id => model.playersById[id])),
        allocations: computeStrokeAllocations(round, course, model.playersById),
      };
    });
    return model;
  }

  // Full import: seed JSON → normalized + derived model.
  function importSeed(seed) {
    const model = normalize(seed);
    recomputeAll(model);
    // Adjust the "Max possible" ceiling for standings-excluded rounds (R1 is
    // flat/stakes-only), without mutating the original seed's pointsConfig.
    const Points = (typeof window !== 'undefined' && window.EgtPoints) || (typeof EgtPoints !== 'undefined' ? EgtPoints : null);
    if (Points && Points.adjustedMaxPossible) {
      model.pointsConfig = { ...model.pointsConfig, maxPossible: Points.adjustedMaxPossible(model) };
    }
    return model;
  }

  // ── SI entry (seed §6.2 / §6.3) ──────────────────────────────────────────
  // Enter a printed stroke index for a course and recompute pops automatically.
  //   siValues: for an 18-hole course, 18 numbers (hole 1..18). For a two-loop
  //             9 (loopsForRound 2), 9 numbers (the card's 9-hole SI); the
  //             18-hole SI is derived by the odd/even loop interleave.
  // Throws if siValues isn't a valid permutation. Returns the model.
  function enterStrokeIndex(model, courseId, siValues) {
    const course = model.courses[courseId];
    if (!course) throw new Error(`Unknown course: ${courseId}`);
    const twoLoop = course.loopsForRound === 2;
    let si18;
    if (twoLoop) {
      if (!H.isPermutation(siValues, 9)) {
        throw new Error('9-hole stroke index must be a permutation of 1..9');
      }
      si18 = H.eighteenFromNine(siValues.map(Number));
    } else {
      if (!H.isPermutation(siValues, 18)) {
        throw new Error('18-hole stroke index must be a permutation of 1..18');
      }
      si18 = siValues.map(Number);
    }
    course.holes = course.holes.map((h, i) => ({ ...h, si: si18[i] }));
    course.strokeIndexVerified = true;
    recomputeAll(model);       // pops repopulate for every round on this course
    return model;
  }

  // Clear a course's SI back to pending (test/utility for the gap path).
  function clearStrokeIndex(model, courseId) {
    const course = model.courses[courseId];
    if (!course) throw new Error(`Unknown course: ${courseId}`);
    course.holes = course.holes.map(h => ({ ...h, si: null }));
    course.strokeIndexVerified = false;
    recomputeAll(model);
    return model;
  }

  return {
    GAME_RULES,
    gamesForRound,
    playedTee,
    courseHandicapFor,
    nineHoleHandicapFor,
    holesForScope,
    computeCourseHandicaps,
    computeStrokeAllocations,
    normalize,
    recomputeAll,
    importSeed,
    enterStrokeIndex,
    clearStrokeIndex,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EgtImporter });
}
