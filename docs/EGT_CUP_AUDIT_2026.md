# EGT 2026 Cup — Pre-Trip Audit

**Date:** 2026-07-11 · **Trip starts:** Tue Jul 21 (10 days out) · **Version:** 1.7.1

Full audit of the EGT setup, format/handicap tracking, partners/pairings, the
EGT money "Bottom Line," the SportsCenter broadcast, the app→SportsCenter data
integration, and the season-long data aggregation. Scope: `components/egt/*`,
`components/EgtTournament.jsx`, `components/BottomLine.jsx`,
`components/bottomLineProvider.js`, `fixtures/egt-2026-seed.json`, `docs/EGT_*`.

**Verdict:** Engine math, points, money zero-sum, standings, tiebreakers, and
the SI-gap machinery are sound — all **149 tests green**. One **live functional
bug** was found and fixed (R5 match play was being dropped from the standings),
plus two documentation/data-hygiene items. The organizer's three follow-up
decisions (every match carries money · sync it all · tally every wager) are now
implemented — see §4. Details below.

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

> **Broadcast follow-through (now implemented — see §4.2):** the SportsCenter /
> Bottom Line rebuilds EGT facts from synced rounds. The match configuration is
> in fact already carried on the synced round (inside `round.formats`), so the
> provider now reconstructs it and R5 match play (plus every other round's
> matches) shows on the broadcast, money and all.

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
| **Money engine** | Every cash game is a zero-sum vector; each finalized round and the full tournament net to $0 to the cent (float residual pushed onto the largest entry). Now covers every round's primary format **and** every overlay side match (§4). ✓ |
| **Standings & tiebreakers** | R6 Stableford → head-to-head → total skins → chip-off; dense ranks; night-over-night snapshots + deltas persisted per night. ✓ |
| **R6 reseed** | 1v2 Championship / 3v4 Bronze auto-seeded off the R5 standings once R5 finalizes. ✓ |
| **Partners/pairings fairness** | The Pairings tab reads the **imported** model (see §3), where R5 teams are cleared, so teammate spread is 0–2 over the two real team rounds (R2, R4 — both John+TJ vs Brian+Mike, paired by request); cart coverage complete with John+TJ riding together 4 of 6 rounds (incl. Ballyowen & Crystal Springs); avg team Δ 5 CH. ✓ |
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

## 4. Organizer decisions — now implemented

The three open questions from the original audit were answered "every match
carries money · sync it all · tally every wager." All three are implemented as
zero-sum additions to the money engine (rates editable on the Rounds tab; the
per-round money still nets to $0 to the cent).

### 4.1 Every match carries direct money
- **R4 — 2v2 aggregate net Stableford.** The three segment matches (1–6 / 7–12 /
  13–18) and the 18-hole total now settle team-to-team at `nassauPerPoint`,
  weighted like the Cup (segment = 1, overall = 2). New "Stableford match" stake
  on the R4 Rounds card. (`egtMoney.moneyForRound` R4 branch.)
- **R6 — championship singles.** Each seeded 1v1 (Championship 1v2, Bronze 3v4)
  settles Nassau-style — front · back · overall (1 / 1 / 2 units) — at
  `nassauPerPoint`. The `singles()` calculator now also returns front/back
  segments for this. New "Singles" stake on the R6 card.
  (`egtScoring.singles`, `egtMoney.moneyForRound` R6 branch.)
- R1 (BBB/Nines), R2 (four-ball Nassau), R3 (Wolf) and R5 (BBB + match play)
  already carried money; unchanged.

### 4.2 Sync it all — match play shows on SportsCenter
The match configuration is already carried on the synced round inside
`round.formats`, so `bottomLineProvider.computeEgtFacts` now reconstructs each
round's overlay matches from there (skipping the synthetic `egt-*` four-ball to
avoid double-counting) and feeds them to the engine. R5's round-robin — and any
side match on any round — now appears on the broadcast with its money.

Related fix: R6 singles are now **seeded before** round results are computed in
`egtEngine.liveUpdate` (off the standings *through R5*), so singles points and
money resolve in the single pass the broadcast and printable use — previously
they only appeared on a second recompute.

### 4.3 Every wager tallied — overlay side matches, all rounds
The individual-Nassau overlay (available on R1–R6) is now folded into the
zero-sum tournament money on **every** round via a shared `settleMatchPlay`
pass, not just R2/R5. Any 1v1 or 2v2 side bet set through the Nassau engine is
tallied into the round's net and the running bankroll. (`egtEngine` computes
`overlayMatchPlay` for every round; `egtMoney` settles it everywhere.)

> **Note on stake structure (adjustable):** R4 and R6 reuse the `nassauPerPoint`
> rate (default $5/point) with the Nassau front/back/overall weighting, matching
> R2/R5. If you want a different stake shape for Championship Sunday singles or
> the R4 Stableford match (e.g. a flat per-match stake, or a different rate),
> it's a small change — the rate is already editable per round on the Rounds tab.

---

## 5. Test status

`npm test` → **149 passing, 0 failing** (was 144; +5: the §1.1 regression plus
R4 money, R6 singles money, overlay-side-match money, and the SportsCenter
match-reconstruction test). Build is clean (`node scripts/build.mjs`); `dist/`
regenerated so the browser bundle carries every change.
