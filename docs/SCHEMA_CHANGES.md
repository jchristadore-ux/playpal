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


---

# Schema & Storage Changes — v1.18.0 (zero putts · mid-round dropouts)

Additive and backward compatible again: one new per-round map, and one new
*value* inside an existing map. Old clients keep working; a round saved by an
old client reads exactly as it always did.

## Putts arrays — a tracked zero

`putts[playerId][holeIdx]` gains one value:

| Value | Means |
|---|---|
| `> 0` | that many putts (unchanged) |
| `-1` (`window.ZERO_PUTTS`) | **new** — a tracked zero: holed out from off the green (chip-in, bunker hole-out, ace) |
| `0` / missing | not recorded (unchanged) |

No migration: nothing that exists today is reinterpreted. Readers must go
through the `gameUtils` helpers (`puttCount`, `puttsTracked`, `sumPutts`,
`countZeroPutts`, `countPuttHoles`, `puttCellText`) rather than summing raw
cells, since `-1` must never be added to a total. An old client shown a `-1`
treats the hole as untracked — a degraded read, never a wrong total.

## Dropouts — who walked in

| Key | Status | Shape |
|---|---|---|
| `pp_drop_<roundId>` | **new** | `{ [playerId]: { thru: n, reason: string\|null, at: epochMs } }` |

`thru` counts holes **in play order**, so a shotgun start counts from its own
first hole: the player is in the round for play-order positions `0 … thru-1`.
`thru: 0` is "did not start". Removing the key (or the player's entry) puts
them back in the round.

The same map rides along everywhere round data travels:

```js
{
  // round object (local `pp_round` + Firestore `…/{syncCode}.round`)
  dropouts: { p3: { thru: 9, reason: null, at: 1787942593791 } },   // NEW
}
```

* `pp_round_snap_<CODE>` — snapshot gains `dropouts` next to `extraStats`.
* Completed rounds gain `dropouts` alongside `putts` / `firData` / `girData`,
  so a saved round settles identically when it is re-opened.
* `holeScores[pid][i].putts` is now written raw, so a `-1` survives the round
  trip (it was previously `|| 0`-ed, which happened to preserve it, but the
  intent is now explicit).

## Firestore (`playpal_rounds/{syncCode}`)

* `liveScores` payload gains a `dropouts` map, debounce-written like the other
  live maps, so every phone in the group sees the walk-off immediately.
* Top-level field count is unchanged (`syncCode`, `round`, `savedAt`,
  `liveScores`). **No rules changes required.**

## Engine compute inputs (not persisted)

`MatchEngine.compute(game, raw)` accepts `raw.dropouts` in the same shape.
Standings and money remain derived, never stored.
