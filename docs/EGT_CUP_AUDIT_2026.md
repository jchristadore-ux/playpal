# EGT 2026 Cup — Pre-Trip Audit

**Date:** 2026-07-11 · **Trip starts:** Tue Jul 21 (10 days out) · **Version:** 1.7.1

Full audit of the EGT setup, format/handicap tracking, partners/pairings, the
EGT money "Bottom Line," the SportsCenter broadcast, the app→SportsCenter data
integration, and the season-long data aggregation. Scope: `components/egt/*`,
`components/EgtTournament.jsx`, `components/BottomLine.jsx`,
`components/bottomLineProvider.js`, `fixtures/egt-2026-seed.json`, `docs/EGT_*`.

**Verdict:** Engine math, points, money zero-sum, standings, tiebreakers, and
the SI-gap machinery are sound — all 145 tests green. One **live functional
bug** was found and fixed (R5 match play was being dropped from the standings),
plus two documentation/data-hygiene items. Details below.

---

## 1. Fixed in this pass

### 1.1 🔴 R5 round-robin match play was silently ignored by the tournament engine
**Severity: High — would corrupt live standings, points, and money during the trip.**

- The Rounds tab persists each round's overlay matches under
  `state.events.roundMatches[roundId]` (`EgtTournament.jsx` → `setRoundMatches`).
  For R5 those matches **are** the round-robin 1v1 match play — the round's
  primary competitive format (worth up to 2 Cup points + Nassau money).
- The engine, however, read the matches from the **legacy** key
  `state.events.r5Matches` only (`egtEngine.js` `buildRoundCtx`). That key is
  never written by the current UI, so `matchPlay` resolved to **zero matches**:
  no match-play champion points, no head-to-head credit, no R5 match Nassau
  money — even though the user configured the matches.
- Reproduced directly: matches under `events.roundMatches.R5` → **0 matches**;
  same matches under `events.r5Matches` → 1 match. The existing tests passed
  only because they set the legacy key directly, never exercising the real UI
  path.

**Fix:** `buildRoundCtx` now reads `events.roundMatches.R5` first and falls back
to `events.r5Matches`, mirroring the UI's `roundMatchesFor()` precedence.
Added a regression test that stores matches the way the UI actually does.
(`components/egt/egtEngine.js`, `dist/egt/egtEngine.js`, `tests/egt.test.mjs`.)

> **Known residual limitation (not fixed — inherent):** the SportsCenter /
> Bottom Line rebuilds EGT facts from *synced native round scores only*
> (`bottomLineProvider.computeEgtFacts`), and the pre-round match configuration
> is **not** part of that synced payload. So R5's match-play results still won't
> appear on the SportsCenter broadcast — only R5 BBB and skins will. The Cup
> standings inside the app are now correct; the broadcast simply can't see the
> match config. If R5 match play should show on SportsCenter, the match config
> would need to be synced alongside scores. Flagged for a decision — see §4.

### 1.2 🟡 R4 tee time stale in the pairings doc
`docs/EGT_PAIRINGS.md` listed R4 (Crystal Springs) at **7:30 AM** in two places,
but the seed — corrected in v1.7.1 ("correct R4 tee time") — is **7:50 AM**.
Updated both the master-schedule row and the R4 section header to 7:50 AM.
(R2's 7:30 AM is genuine and unchanged.)

---

## 2. Verified correct (no action needed)

| Area | Result |
|---|---|
| **Course handicaps** (all 6 courses, White tees) | Match the seed golden values; two-loop 9s (Minerals, Cascades) use the 18-hole-equivalent CR/Par. ✓ |
| **Pop allocation** | The `⌊N/M⌋ + (si≤extra)` rule reproduces **every** `strokeAllocations[*].holes` array in the seed (golden test). ✓ |
| **SI-gap machinery (§6)** | `strokeIndexVerified:false` + `si:null` loads as "pending," net===gross, no calculator branches on it; entering a valid permutation flips the flag and recomputes pops everywhere. All 6 courses currently ship **SI verified**. ✓ |
| **Points engine** | Per-round ceilings 6+4+4+5+4+7 = 30, season awards 6 → 36; Brian caps at 30 (misses R1). `adjustedMaxPossible` recomputes from first principles (idempotent on rehydrate). ✓ |
| **Money engine** | Every cash game is a zero-sum vector; each finalized round and the full tournament net to $0 to the cent (float residual pushed onto the largest entry). ✓ |
| **Standings & tiebreakers** | R6 Stableford → head-to-head → total skins → chip-off; dense ranks; night-over-night snapshots + deltas persisted per night. ✓ |
| **R6 reseed** | 1v2 Championship / 3v4 Bronze auto-seeded off the R5 standings once R5 finalizes. ✓ |
| **Partners/pairings fairness** | The Pairings tab reads the **imported** model (see §3), where R5 teams are cleared, so teammate spread is correctly 0–1 over the two real team rounds (R2, R4); cart coverage complete; avg team Δ 5 CH. ✓ |
| **App→engine scoring bridge** | `toNativeRound` builds a normal scoreable round (stable id, deterministic sync code, real format trackers); `bridge`/`readNativePayload` translate native scores + BBB/Wolf events back into the EGT store on finalize. ✓ |
| **SportsCenter aggregation** | `bottomLineProvider` rebuilds the whole Cup from the seed + synced scores with no storage writes, filters to EGT-only rounds, and layers live native money on top of finalized-round engine money. Bankroll and records aggregate across all scored EGT rounds. ✓ |

---

## 3. Data hygiene — stale R5 seed fields (harmless, left intentionally)

The fixture's R5 block still carries the **pre-redesign** scramble/alternate-shot
format: `primaryGame:"scramble+alternateShot"`, a populated `teams` array
(John+Mike vs Brian+TJ), `formatConfigs.R5` (scramble2/alternateShot),
`pointsConfig.R5:{scrambleLoop,alternateShotLoop}`, `_teamHandicaps`, and the
scramble/alt-shot notes in `strokeAllocations.R5`.

These are **overridden at runtime** by `EgtImporter.applyFormatOverrides` (run in
`recomputeAll` on every import and rehydrate), which sets R5 to
`bingoBangoBongo+matchPlay`, **clears `teams` to `[]`**, and rewrites
`formatConfigs.R5`/`pointsConfig.R5`. Verified: the imported model shows
`teams: []` and `primaryGame: bingoBangoBongo+matchPlay`. So:

- The Rounds tab does **not** render phantom R5 teams (the `teams.length > 0`
  guard sees the cleared array).
- The Pairings fairness matrix does **not** miscount R5 as a team round.

**Why left as-is:** the importer is deliberately designed to keep the seed file
untouched and apply post-seed design changes in code (so persisted installs pick
them up on rehydrate). Editing the fixture would also risk the golden allocation
tests, which diff against `seed.strokeAllocations`. Recommendation: leave the
override in place; optionally add a one-line note in the fixture pointing at
`applyFormatOverrides` so a future reader isn't misled. No functional risk.

---

## 4. Open questions for the organizer (design intent — confirm before the trip)

1. **R4 & R6 carry no direct money match.** `moneyDefaults` has no Stableford or
   singles stake, so R4 (aggregate Stableford) and R6 (championship singles)
   pay out only through the always-on **skins / CTP / Long Drive / The Rock** —
   they're Cup-points rounds. This looks intentional, but R6 singles is the kind
   of match people often back with cash. Confirm you don't want a singles money
   stake on Championship Sunday.
2. **R5 match play on the SportsCenter broadcast** (§1.1 residual): accept that
   the broadcast shows only R5 BBB + skins, or wire the match config into the
   sync payload so the round-robin shows live? In-app standings are correct
   either way.
3. **Overlay Nassau on R1/R3/R4/R6** are tracked by the native scorer as side
   bets but are **not** folded into the zero-sum EGT tournament money (only R2's
   four-ball and R5's matches are). Confirm that's the intended split (tournament
   money vs. personal side bets).

---

## 5. Test status

`npm test` → **145 passing, 0 failing** (was 144; +1 regression test for §1.1).
Build is clean (`node scripts/build.mjs`); `dist/` regenerated so the browser
bundle carries the fix.
