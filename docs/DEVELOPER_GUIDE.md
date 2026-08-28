# PlayPal Developer Guide

How the v1.1 service layer fits together, and the recipes you'll actually use:
adding a match format, plugging in a course or handicap provider, and reading
round history.

## Architecture map

```
components/
  gameData.js            constants, bundled courses, legacy FORMAT_INFO
  gameUtils.js           legacy money-game engines (Wolf, Nassau, Skins, …)
  handicapService.js     WHS math + handicap provider registry      (pure)
  courseService.js       course model, tees, favorites, providers   (pure + storage)
  matchEngine.js         format registry + scoring engine           (pure)
  statsService.js        per-round & lifetime statistics            (pure)
  profileService.js      player profile model + derived career      (pure)
  roundHistoryService.js snapshot access, resume detection          (storage)
  sharingService.js      scorecard text/CSV, Web Share/clipboard    (pure + browser)
  migrations.js          versioned localStorage migrations
  GameTrackers.jsx       generic live/final standings renderer
  StatsScreen.jsx        dashboards, trends, round comparison
  …existing screens (Home/Setup/ScoreEntry/Summary/…)
```

Everything ships as classic scripts that talk through `window` globals
(see `scripts/build.mjs`). **Load order matters** and is encoded in
`index.html` and `tests/helpers/load.mjs`: data/services first, then UI.

“Pure” files never touch the DOM or storage in their calculation paths, so
they run unmodified under `node --test` via a vm sandbox.

## MatchEngine

### Computing standings

```js
const result = MatchEngine.compute(game, {
  course,            // any course shape — normalized internally
  players,           // round players (id, name, color, handicap)
  scores,            // { [playerId]: (number|null)[] }
  startingTee,       // 1 | 10 (optional)
  stats: { putts, fir, gir },                    // tracked stats — award formats
  dropouts: { p3: { thru: 9 } },                 // who walked in, and after how
                                                 // many holes (in play order)
  gameState: { wolf: wolfData, bbb: bbbData },   // input-driven formats only
});
// → { kind, entries[], leaderIds, thru, complete, status, winner }
```

`entries` are sorted best-first and every entry carries `total`,
`totalLabel`, `detail`, and `perHole` — `GameStandingsCard` renders any of
them without format-specific code. An entry may also carry `void`/`wd`: it
still shows its numbers but is out of the standings and out of the pot
(see **Mid-round dropouts**).

### Tracked putts, including zero

A putts cell is a number per hole with three meanings: `> 0` putts, `0` "not
recorded", and `−1` (`window.ZERO_PUTTS`) a **tracked zero** — holed out from
off the green. Never read a cell raw; the helpers in `gameUtils.js` are the
contract:

```js
puttCount(v)        // strokes this cell adds: 0 for both a chip-in and a blank
puttsTracked(v)     // was a number written down at all?
isZeroPutt(v)       // a chip-in
sumPutts(arr) · countZeroPutts(arr) · countPuttHoles(arr) · hasAnyPutts(bag, players)
puttCellText(v, blank)   // '0' for a chip-in, the count, or the caller's blank
```

Inside the engine the same distinction is `ctx.stats.putts(pid, i)` (strokes),
`ctx.stats.puttTracked(pid, i)` and `ctx.stats.zeroPutts(pid)`.

### Mid-round dropouts

`raw.dropouts` = `{ [playerId]: { thru: n, reason?, at? } }`, where `n` counts
holes **in play order** (so a shotgun start counts from its own first hole). A
player is in play for play-order positions `0 … n−1`. `buildCtx` turns that
into four questions every format can ask:

```js
ctx.withdrawn(pid)        // did they walk in?
ctx.inPlay(pid, holeIdx)  // were they there for this hole?
ctx.expected(pid)         // how many holes they were ever going to play
ctx.contestedHoles(min)   // holes with at least `min` participants in play
```

The rules the built-in formats implement with them:

* **whole-round games** (`_strokeLeaderboard`, `_pointsLeaderboard`,
  `_awardCompute`) mark a short card `void` — kept on the board, out of the
  standings and skipped by `_potPayouts` — and judge `complete` against
  `expected`, not `holeCount`, so nobody's blank back nine holds a game open.
  A side unit's expected holes come from `opts.ballsNeeded(unit)`: a best-ball
  pair plays on with one player, a team-total side can't.
* **match play / Nassau** treat a side whose players have all left as a
  **concession** (`result.conceded`, `segment.conceded`); a match already
  closed out or a segment already played out keeps its result.
* **hole-by-hole games** (skins, Wolf, BBB, sixes) contest each hole among the
  players still in play and finish at `ctx.contestedHoles(n)`.

`gameUtils` carries the same helpers for the legacy money games —
`dropoutThru`, `isDropped`, `activeAtSeq`, `activePlayers`, `setDropout`,
`dropoutLabel` — plus dropout-aware `calcSkins`, `computePTMState` (the pot
moves off a player who walks in) and the legacy stableford pot.

### Adding a format (the whole point)

Register one definition; no engine, UI, or existing-format changes:

```js
MatchEngine.register({
  id: 'flags',                      // unique, stable — stored in round.games
  label: 'Flags', icon: '🚩',
  desc: 'Start with par + handicap strokes; plant your flag where the ball dies.',
  category: 'points',               // individual | match | team | points | awards
  basis: 'gross',                   // or 'net' or 'choice'
  defaultBasis: 'gross',            // which way a 'choice' format starts
  defaultAllowance: 100,            // when net
  requiresStats: ['putts'],         // optional — Setup switches the tracking on
  options: [{ key:'mode', label:'COUNT', default:'total',
              choices:[{ value:'total', label:'TOTAL', hint:'…' }] }],
  players: { min: 2, max: 8 },      // optional
  teams: { count: 2, size: [2, 2] },// optional — Setup renders the team builder
  teamEntry: false,                 // true → one score per team per hole
  teamWeights: (size) => [35, 15],  // team-entry handicap blend, low CH first
  needsInput: null,                 // 'wolf' | 'bbb' to consume gameState
  compute(ctx) {
    // ctx: holes, holeCount, playOrder, players, teams, config, basis,
    //      gross(pid,i), net(pid,i), score(pid,i)  ← basis-aware,
    //      teamBest(team,i,count), teamEntered(team,i), handicaps, gameState,
    //      stats.putts(pid,i) / stats.fir(pid,i) / stats.gir(pid,i) and the
    //      stats.puttHoles(pid) / firHoles(pid) / girHoles(pid) counts
    return { kind: 'leaderboard', entries: [...], leaderIds: [...],
             thru, complete, status, winner };
  },
});
```

Aliases are first-class: `{ id:'betterBall', label:'Better Ball', aliasOf:'bestBall' }`
shares the canonical implementation but keeps its own name/desc in the picker.

Then add a test in `tests/matchEngine.test.mjs` (see the
"every non-input format returns a normalized result" invariant — new formats
are swept automatically).

### Awards

The five mini-cup awards (`MatchEngine.AWARD_FORMAT_IDS`) are ordinary
registered formats in the `awards` category, each settling `pot` against its
own stake. They share one helper, `_awardCompute(ctx, spec)`, which turns a
per-player count into the standard leaderboard result and enforces two rules:

* **eligibility** — `spec.eligible(pid)` gates a player out of the award (and
  out of its pot) when the stat behind it was never recorded on their card;
* **the empty award** — when every eligible player counts zero on a
  "most X" award, the result carries `awardEmpty` with `winner: null`, so no
  money moves.

A player who walked in is `void` for every award: an 11-hole card can't win an
18-hole trophy, and it doesn't hold one open either.

Completeness follows the scorecard, not eligibility, so one untracked card
can't hold an award open forever.

### Setup integration

`Setup.jsx` builds games from metadata alone:
`MatchEngine.list()` → picker; `MatchEngine.defaultConfig(formatId, players)`
→ serpentine-balanced teams; `MatchEngine.validateGame(game, players)` →
inline errors and the start gate.

## HandicapService

```js
HandicapService.courseHandicap(index, slope, rating, par, holeCount) // WHS CH
HandicapService.playingHandicaps(players, holes, tee, {
  allowancePct, relative, overrides,   // relative = strokes off the low ball
}) // → { [pid]: { index, courseHcp, playing, rounded, strokes[] } }
HandicapService.allocateStrokes(rounded, holes)  // stroke-index allocation,
                                                 // wraps >18, plus-handicap aware
HandicapService.teamPlayingHandicap(chs, [35,15]) // scramble-style blends
```

### Handicap providers (GHIN-style sync)

```js
HandicapService.registerProvider({
  id: 'ghin', label: 'GHIN',
  fetchIndex(player, cb) { /* … cb(index, err) … */ },
});
```

With no provider registered (the shipped state — a public client has nowhere
to keep credentials), `fetchIndex` calls back with
`(null, 'No handicap service connected')` and the UI keeps indexes manually
editable. The Home profile editor's **↻ SYNC** button is already wired to
this path.

## CourseService

Normalized model: `{ holeCount: 9|18, tees: [{id, name, rating, slope, yds[]|null}], holes, … }`.
Legacy courses normalize transparently (`normalizeCourse`), so no call site
ever branches on shape.

```js
CourseService.getTee(course, teeId)        // fallback to first tee
CourseService.holesForTee(course, teeId)   // tee-specific yardages
CourseService.toggleFavorite(id) / getFavoriteIds() / isFavorite(id)
CourseService.recordRecent(course) / getRecents()   // 10 newest, normalized
CourseService.searchLocal(query, courses)
```

### Course providers

```js
CourseService.registerProvider({
  id: 'somecourseapi', label: 'Some Course API',
  search(query, cb)    { /* cb(courses[]) */ },
  getCourse(id, cb)    { /* cb(course|null) */ },
});
CourseService.searchProviders(query, cb)   // aggregates + normalizes all providers
```

Remote results are normalized (and tagged `providerId`) before they reach the
UI, so swapping providers never changes calling code. Recents keep a full
normalized copy so a previously used remote course works offline.

## Stats / Profiles / History / Sharing

```js
// One round, one player:
StatsService.computePlayerRound(roundData, pid)
// All saved rounds (newest first), normalized for stats:
RoundHistoryService.listRoundData()
// Lifetime aggregate + trend + personal bests:
StatsService.aggregatePlayer(dataList, pid)
ProfileService.career(pid, dataList)        // + most-played course/format
StatsService.compareRounds(a, b, pid)       // hole-by-hole diff
RoundHistoryService.unfinishedRound()       // Home "resume" card source
SharingService.scorecardText(round, scores, { gameResults, payouts })
SharingService.scorecardCSV(round, scores, putts)
SharingService.share({ title, text }, cb)   // share → clipboard → cb('failed')
```

`roundData` is the normalized record produced by
`StatsService.roundDataFromSnapshot()` — it accepts both live shapes and
completed-round `holeScores`, and carries `dropouts` alongside the stats.
A round stat line adds `putts.zeroPutts` (chip-ins) and `walkedInAfter`
(`null` unless they left early — a part round is never `complete`).

## Migrations

`components/migrations.js` runs at script load in the browser (and is
exported for tests). To add **v3**:

1. Bump `PP_SCHEMA_VERSION` to `3`.
2. Add a pure `migrateXxxV3(data)` function.
3. Append an `if (from < 3) { … }` block in `runMigrations()`.
4. Cover it in `tests/services.test.mjs` (run twice → second run is a no-op).

Rules: additive only, never delete user data, always idempotent.

## Testing

```bash
npm test           # build + full suite (node:test)
```

`tests/helpers/load.mjs` loads the real source files into a vm sandbox with a
fake `localStorage`. Note the sandbox is a separate realm — compare arrays
from it with the `jeq` JSON helper, not `assert.deepStrictEqual`.

## Build & ship

Browser loads committed `dist/` — after editing `components/`, run
`npm run build` and commit `dist/` (CI fails otherwise). New source files must
be added to `scripts/build.mjs` `SOURCES`, `index.html` (both script blocks),
`sw.js` PRECACHE, and `tests/helpers/load.mjs` if services.
