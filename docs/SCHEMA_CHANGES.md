# Schema & Storage Changes — v1.1.0

All changes are **additive and backward compatible**. Old clients ignore the
new fields; new clients normalize old data on the fly (and once, via the
versioned migration below). No server-side migration is required.

## localStorage

| Key | Status | Shape |
|---|---|---|
| `pp_schema_version` | **new** | `"2"` — bumped by `runMigrations()` (`components/migrations.js`) |
| `pp_players` | extended | each player gains `preferredTee`, `dominantHand` (`'R'|'L'`), `homeCourseId`, `homeCourseName`, `favoriteFormats[]`, `handicapSource` (`'manual'|'provider'`), `handicapUpdatedAt` |
| `pp_custom_courses` | extended | each course gains `holeCount` (9\|18) and `tees[] = {id, name, rating, slope, yds[]\|null}`; legacy `rating`/`slope`/`holes[].yds` kept as mirrors of the first tee |
| `pp_fav_courses` | **new** | `string[]` of favorite course ids |
| `pp_recent_courses` | **new** | up to 10 normalized course objects with `lastPlayedAt`, newest first |
| `pp_extra_<roundId>` | **new** | per-round stat extras: `{ [playerId]: { [holeIdx]: { pen?, sand?, ud?, drv?, lp? } } }` |
| `pp_round` | extended | round object gains `games[]`, `teeId`, `trackStats` (see below) |
| `pp_round_snap_<CODE>` | extended | snapshot gains `extraStats` alongside the existing scores/putts/fir/gir |

The migration is **idempotent** and **never deletes data** — it only fills in
defaults and normalizes shapes (`migratePlayersV2`, `migrateCoursesV2`).

## Round object (local + Firestore `playpal_rounds/{syncCode}.round`)

```js
{
  // existing fields unchanged …
  games: [            // NEW — MatchEngine games configured for the round
    {
      id: 'g_169…',
      formatId: 'fourBall',          // any id in MatchEngine.list()
      name: 'Four Ball',
      config: {
        teams: [{ id:'t1', name:'Team A', playerIds:['p1','p4'] }, …],
        scoringBasis: 'net' | 'gross',
        allowancePct: 90,
        relative: true,
        handicapOverrides: { p2: 12.4 },   // per-round manual overrides
        countBalls: 1,                     // best-ball variants
        carryover: true,                   // skins
        quotaBase: 36,                     // quota
        stake: 5,                          // optional, display-only
        teeId: 'blue',
      },
    },
  ],
  teeId: 'blue',       // NEW — tee box the round is played from
  trackStats: true,    // NEW — enables FIR/GIR/penalty/sand/up-down entry
  extraStats: { … },   // NEW on completed rounds (same shape as pp_extra_*)
}
```

## Firestore (`playpal_rounds/{syncCode}`)

* `liveScores` payload gains an `extraStats` map (debounce-written like the
  other live maps).
* Document field count stays far below the `request.resource.size() < 50`
  rule limit (top-level fields are still `syncCode`, `round`, `savedAt`,
  `liveScores`).
* **No rules changes required** — verify with the existing
  `firebase/firestore.rules`.

## Realtime Database

* `players/*` — profile fields ride on the existing player objects; the
  existing `auth != null` rule already covers them. **No rules changes.**
* No new RTDB paths. Favorites and recent courses are intentionally
  device-local (they are personal preferences, not group state).

## Engine compute inputs (not persisted)

`MatchEngine.compute(game, raw)` consumes the live maps that already sync:
`scores`, plus `gameState: { wolf: wolfData, bbb: bbbData }` for input-driven
formats. Nothing new is written for engine standings — they are derived,
never stored, so the scorecard stays the single source of truth.
