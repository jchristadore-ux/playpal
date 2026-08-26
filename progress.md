# PlayPal — Progress

## v1.17.0 — Round awards / mini cup (26 Aug 2026)

**Branch:** `claude/golf-awards-setup-fy1s6d`
**Status:** complete. 276 tests green (17 new in `tests/awards.test.mjs`),
`dist/` rebuilt, browser smoke through setup → mini cup → live tracker with
zero page errors.

### What was built

Five trophies from the EGT Cup's season awards, re-cut as ordinary MatchEngine
formats so they run on any single round with their own stakes, alongside
whatever else is being played:

| Format id | Award | Counts | Default |
|---|---|---|---|
| `flatstick` | FLATSTICK | putts (or three-putts) | total putts, gross |
| `firKing` | FIR KING | fairways off the tee, par 3s excluded | gross |
| `bogeyBro` | BOGEY BRO | bogeys exactly (or bogey-or-better) | exact, gross |
| `parPrince` | PAR PRINCE | pars (or par-or-better) | exact, gross |
| `birdieBro` | BIRDIE BRO | birdies or better | **net** |

Each settles `pot` against its own `config.stake` — losers ante, winner takes,
ties split — so five awards are five independent pots inside the same round
total, and `calcRoundPayouts` still nets to $0.

### Rules that keep an award honest

- A "most X" award where every eligible player counts zero returns
  `awardEmpty` with `winner: null` — a birdie-less Friday pays nobody rather
  than splitting four ways among four zeros.
- A player who never recorded the stat behind an award (putts, FIR) is
  ineligible: out of the standings and out of the pot, neither anteing nor
  winning.
- FLATSTICK additionally requires putts on *every* played hole — it is the one
  award where a blank would improve your score.
- Completeness follows the scorecard, not eligibility, so one untracked card
  can't hold an award open.

### Files

- `components/matchEngine.js` — `raw.stats` → `ctx.stats` accessors,
  `def.defaultBasis`, `def.requiresStats`, `def.options`, the `awards`
  category, `AWARD_FORMAT_IDS`, `_awardCompute` + `_toParCount`, the five
  registrations, and `_potPayouts` skipping entries that sat out.
- `components/Setup.jsx` — generic `def.options` selector, missing-stat
  warning on the game card, adding an award switches its tracking on, and the
  **Mini Cup** card in the picker (all five at $1/$2/$5/pride).
- Stats threaded to every surface that settles: `components/GameTrackers.jsx`,
  `ScoreEntry.jsx`, `Summary.jsx`, `gameUtils.js` (`calcAllPayouts` /
  `calcRoundPayouts`), `sharingService.js`, `App.jsx`.
- `tests/awards.test.mjs` (17 tests), docs (`README.md`,
  `docs/USER_GUIDE.md`, `docs/DEVELOPER_GUIDE.md`), CHANGELOG, version 1.17.0.

### Next action if resuming

Nothing pending. Optional follow-ups are listed in `todo.md`.

---

## v1.16.0 — App Store submission audit (23 Aug 2026)

**Branch:** `claude/app-store-submission-audit-pqkj74`
**Status:** complete. 259 tests green, verified in a browser. Everything left is
outside this repo — see `APP_STORE_AUDIT.md` §7.

### What this pass found and fixed

The app was not submittable. Three findings would each have blocked it:

1. **20 of 28 game formats settled no money.** Every `MatchEngine` format
   computed a winner and moved $0 — no stake field, no payout path,
   `calcAllPayouts` never saw `round.games`.
2. **The GHIN button faked success** (2.3.1) — a 2.2s timer and a green tick.
3. **All synced data was in one global namespace** — every user of a public
   build would read and overwrite every other user's profiles, emails and
   Venmo handles; `players.set()` wiped the roster on each save.

Plus: nine-hole rounds scored as eighteen (Nassau paid 3× for one match), stroke
pops were manual so skins/Stableford silently scored gross, money displayed to
the dollar while Venmo charged to the cent, the round email omitted the same 20
formats and was truncated by iOS Mail, Wolf with 2 players paid a phantom win,
plus handicaps took a stroke away on every hole, solo rounds were impossible.

### Files added
- `components/groupService.js` — group ids, join codes, normalization
- `components/scorecardImport.js` — the paste-the-numbers parser
- `tests/moneyAudit.test.mjs` — 37 regression tests
- `APP_STORE_AUDIT.md` — the audit, the Firebase plan, the submission
  checklist and the pricing model

### Files changed
`components/`: matchEngine.js (settlement modes + `payouts()`), gameUtils.js
(`calcRoundPayouts`, `autoPopStrokes`, `popStrokesAt`, `fmtMoney`,
`nassauSegments`, layout-aware Wolf/Skins/BBB/TeeBall/Markey), gameData.js
(`getHoleStrokes` plus handicaps; `DEFAULT_PLAYERS` emptied), sharingService.js
(`roundReport`, `settleDebts`, `venmoRequest`), Setup.jsx (stakes per game,
photo pane, paste box, solo rounds, scorecard-only, pop grid), ScoreEntry.jsx
(viewport hook, columns, compact cards, stroke-count pops), Summary.jsx (engine
money, cents, new SEND tab, honest GHIN), Home.jsx (empty roster, group panel,
Cup unlock, plus handicaps), App.jsx (`calcRoundPayouts`, course save, Cup gate),
Shared.jsx (group in join links).
Root: index.html (group-scoped sync), join.html, sw.js, manifest.webmanifest,
privacy.html, support.html, package.json, CHANGELOG.md,
APP_STORE_READINESS.md, todo.md.
`firebase/`: both rule files rewritten. `ios/`: Info.plist (arm64 + permission
strings). `scripts/`: build.mjs, build-www.mjs (`--public`).

### Exact next action
Deploy the Firebase rules. Nothing else in the audit is real until they are live:

```bash
cd firebase && npx firebase-tools login && npx firebase-tools use playpal-sync
npx firebase-tools deploy --only firestore:rules,database
```

Then work down `APP_STORE_AUDIT.md` §7.

---


## 2026-07-27 — The recap book as PDFs (branch claude/tournament-results-pages-kp4bse) — v1.15.0

Status: **complete — 222 tests green (4 new), 25 PDFs / 146 sheets generated and
verified page-complete, dist rebuilt.** Follow-on to v1.14.0 (PR #108, merged),
so the branch restarted from main.

Asked for: "all the individual pdfs".

`npm run recap:pdf` → `scripts/gen-recap-pdf.mjs` prints every page of the book
to `recap/pdf/`, mirroring the folder layout. Chrome's own PDF engine renders it
(found via `$CHROME` → Playwright browsers → system paths), so paper matches the
browser. 7.9 MB, `print.pdf` being 3 MB of that.

### Two real defects the PDF pass exposed
1. **Wide scorecards would have been clipped, not just cut.** `.scroll` boxes
   scroll on screen; Chrome *clips* them when printing, so R6's 23-column card
   would have lost its last holes, totals and net column entirely. Print CSS now
   sets `overflow: visible`, shrinks `table.card` to 8.5px with 1px padding, and
   pins `@page { size: Letter; margin: 0.45in }` — the whole card fits one sheet
   (verified by rasterizing the PDF, not by assuming).
2. **`−$31.25` wrapped after its sign**, leaving `$31.25` alone on the next line
   — which reads as money owed *to* the man rather than *by* him. `cash()` now
   emits a nowrap span; `nbMoney()` does the same for figures inside the money
   engine's own prose lines. Caught by extracting text back out of the PDFs.

Fixing (2) surfaced a third: the cover's player tiles ran `cash()` output through
`esc()`, printing `&lt;span class="amt"&gt;` on the page. `group()` now takes
HTML and each caller escapes its own text.

### How the PDFs were verified
Not by eye alone. For all 25: extract text with pdfplumber, strip `<style>`,
the breadcrumb and `.noprint` blocks from the HTML, uppercase-fold (headings and
pills are `text-transform: uppercase`), and assert every token on the page is in
the PDF. Result: **25/25 complete, 0 missing tokens, 0 orphaned money signs**
(the two flagged were the "+" in "Individual Stableford + two $2 Nassaus").
Plus rasterized spot checks of the widest cards.

### Guards left behind (tests/recap.test.mjs, 13 tests)
- The three print rules that stop clipping are pinned by regex — remove one and
  the suite fails before a clipped PDF ever ships.
- Every signed money figure in every page must sit inside `.amt`.
- `pagesIn()` finds all 25 pages, skips its own `pdf/` output, cover first.
- Every page links its own PDF at the right relative depth.

### Next actions (if resumed)
- Nothing pending. After any scoring/stake change:
  `npm run recap:pdf` (HTML + PDFs) and `npm run settlement`.
- Note: the PDF step needs Chrome. It is deliberately not in `npm test` or CI —
  the committed PDFs are the artifact, the tests guard the CSS that makes them
  correct.

## 2026-07-26 — The 2026 recap book (branch claude/tournament-results-pages-kp4bse) — v1.14.0

Status: **complete — 218 tests green (9 new), 25 pages generated, browser-verified
at desktop and narrow widths, zero broken links, dist rebuilt.**

Asked for: individual single-page outputs of all matches, scorecards, the
individual awards, standings and points earned, to memorialize the trip.

Built `scripts/gen-recap.mjs` → `recap/`, 25 standalone pages (692 KB):

| Page | What's on it |
|---|---|
| `recap/index.html` | The cover: champion, final board, the trip, a directory of every page |
| `recap/rounds/r1–r6.html` | Full scorecard (pop dots + to-par marks), every game hole by hole, course handicaps and pops with bases, Cup points offered and collected, the money and its settle-up, carts |
| `recap/matches/*.html` (10) | R2 four-ball, R3 side Nassau, six R5 round-robin matches, both R6 singles — hole by hole with best net ball, running match state, front/back/overall, cash, Cup points |
| `recap/players/*.html` (4) | Round by round, every match, every Cup point traced, every dollar incl. off-course, his numbers vs the field |
| `recap/standings.html` | Final board + tiebreakers, the night-by-night climb, where all 33 points come from, every player's points ledger |
| `recap/awards.html` | Five season awards + the stat race behind each, every title on the trip, The Rock's ledger |
| `recap/money.html` | Bankroll, settle-up, round-by-round + off-course matrix, how each stake was decided |
| `recap/print.html` | Every other page in order, one sheet each, links rebased so they still work |

### How it stays honest
- Replays the trip exactly as `gen-settlement.mjs` does (seed + results fixtures
  → `EgtBridge.bridge` per round → `EgtEngine.liveUpdate` with `season: true`).
- Per-round Cup points come from `EgtPoints.compute(model, {[rid]: results}, null)`
  and the awards from `EgtPoints.seasonAwards` on a fresh accumulator, so every
  point can be attributed to where it was won. The generator **throws** if those
  parts don't sum to the engine's published totals, or if money doesn't net to $0.
- "The climb" re-runs the engine over a truncated `finalized` list on a copy of
  the state, so each night's board is that night's real board.
- 1v1 match pop counts are derived as gross − net off the engine's own per-hole
  numbers (never recomputed), so a match page can't disagree with the match.
- The money engine's two-letter side-match keys (`Match tj v jo front`) are
  rewritten to full names for display only.

### Decisions worth knowing
- **Light "paper" theme, not the SportsCenter dark board** — these are documents
  to keep and print. `@media print` gives each part its own sheet.
- **Self-contained pages**: styles inlined, no scripts, no remote assets (only
  the site favicon). A test asserts this for all 25 pages.
- **No in-app link added.** `recap/` is a web artifact like `settlement.html` and
  `packlist.html`, which `build-www.mjs` does not copy into the native bundle —
  linking it from the EGT Cup screen would 404 in the iOS build. If it should be
  reachable in-app, add `recap` to `build-www.mjs` DIRS first.
- **R1 stays out of the Cup** everywhere in the book (cash only), matching the
  engine, and the climb shows a four-way 0 after Tuesday.
- The book reports untracked stats honestly: no putt was recorded on the trip, so
  **Flat Stick is "Not awarded"** and **Iron Man is a four-way tie at zero**
  (0.25 each) — stated on the page rather than papered over.

### Also fixed (pre-existing, adjacent)
`deploy-pages.yml` never copied `settlement.html` or `packlist.html`, both of
which sit in `sw.js`'s `PRECACHE`. `cache.addAll()` rejects wholesale on a 404,
so the service worker never installed on the deployed site. Now copied, with
`recap/`.

### Next actions (if resumed)
- Nothing pending. Regenerate after any scoring/stake change with
  `npm run recap` (and `npm run settlement`); `tests/recap.test.mjs` pins the
  headline figures.

## 2026-07-25 — Three more shared costs, split four ways (branch claude/golf-money-audit-hom5rs) — v1.13.0

Status: **complete — 209 tests green, dist rebuilt, board + both surfaces re-verified.**

Follow-on to the money work. PR #106 was already merged, so this restarted the
branch from main as a fresh change.

### Added to the ledger
| Cost | Fronted by | Total | Each |
|---|---|---|---|
| Custom jerseys | Brian | $120 ($30 a jersey) | $30 |
| Steak night | TJ | $85 | $21.25 |
| Three trays of food | Mike | $40 | $10 |

`tripExtras` `collect` items now take **`total`** as well as `perPlayer`. Given a
total the engine splits it evenly across everyone who shared it — the payer
included, so he carries his own quarter and collects the other three. The seed
records the real receipt rather than a pre-divided share.

### Settle-up change — prepaid cash now settles any bill
Brian's $40 buy-in only covers $23.25 of what he owes the poker winners now, so
under the old rule $16.75 bounced back to him as a refund. It now spends against
his remaining bills (John) too: the pot holder just passes the cash on. Same net
money, one less round trip. A float that outruns every bill still refunds.

### Formatting
Shares can land on cents ($21.25), so the settlement board and the SportsCenter
money cards render to the cent; the ticker's bankroll figures still round. A bill
the pot already covered reads "paid from the pot", not "$0".

### The answer
Golf only unchanged: John $0 · Brian −$17 · TJ +$28 · Mike −$11.
With costs: **John +$48.75 · TJ +$17.75 · Mike −$18.25 · Brian −$48.25**.
Settle: Brian → John $8.25 · TJ → John $8.75 · Mike → John $15 · Mike → TJ $20.25.

## 2026-07-25 — Tournament money summary on every surface (branch claude/golf-money-audit-hom5rs) — v1.12.0

Status: **complete — 208 tests green (8 new), dist rebuilt, both surfaces browser-verified.**

Follow-on to the money audit: the settlement board's content now lives on the
EGT Cup screen and the SportsCenter too, off one shared description.

### Added
- `components/egt/egtMoneySummary.js` — `build(model, live)` reshapes an
  `EgtEngine.liveUpdate` result into: standings (total / golf / off-course),
  the netted settle-up, a row per round + the off-course items, and
  plain-language "how this stake was decided" lines per round. Pure; registered
  in build.mjs SOURCES and tests/helpers/load.mjs.
- EGT Cup screen: a **Money** tab between Rounds and Courses.
- SportsCenter: `money-ledger` + `money-settle` stage cards, in the post-round
  rotation and as a new REVEAL act ("THE DAMAGE") after By the Numbers.
- `scripts/gen-settlement.mjs` now renders from the shared summary, so the
  printable board, the app and the TV cannot drift apart.

### Two real bugs found while sharing the logic
1. **Prepaid credit hit the wrong items.** `settleUp` matched a payer's prepaid
   cash against every extras item where they were down — so Brian's $40 poker
   buy-in was also credited against the banner and gas John fronted ($80 of
   credit on a $40 float, and one settlement went negative). Items now carry
   their own `prepaid` map; the credit applies only to that item's winners.
2. **Credit could reverse a transfer.** If a pot holds more of someone's cash
   than the pairing owes, the credit now clamps at the bill and the remainder
   surfaces as `refund` rather than a backwards payment.

### Verified in a browser
Replayed the real trip into localStorage and drove the app to the Money tab
(430×932: settle-up, +$110/−$107 correct, no page-level horizontal scroll — the
ledger scrolls inside its own container), and mounted both TV cards at 1920×1080
off the real synced rounds.

## 2026-07-25 — EGT 2026 money audit (branch claude/golf-money-audit-hom5rs) — v1.11.0

Status: **complete — 200 tests green (14 new), dist rebuilt, settlement board generated.**

Full recalculation of what everyone owes after the trip, against the real scores.

### Where the data came from
The six rounds were all synced by the app to Firestore `playpal_rounds` under
codes W/X/Y/Z/2/3 + `4K336`. Those docs carry the full hole-by-hole cards **and**
the manually entered Bingo-Bango-Bongo and Wolf events, so nothing had to be
retyped. Captured verbatim as `fixtures/egt-2026-results.json`.

### Three real defects found in the money engine
1. **R4 Stableford basis.** Ran at the seed's 85% full dots → a 39–39 tie → the
   round paid $0. Every other net game runs off the low ball; R4 now does too
   (John scratch). Real result: Brian + Mike 26, John + TJ 18.
2. **Side wagers never settled.** R3's Nassau, R5's round robin and R6's two
   Nassaus only existed if someone opened the match editor on that device. The
   seed now ships them as `rounds[].sideMatches`; the engine and the scorer
   bridge both fall back to them. Worth $29 that was going unsettled.
3. **The Rock settled money nobody wagered** — $129 to John, purely derived from
   3-putts and net birdies. Gated behind `sideGames.passTheMoney.played`.

### Added
- `model.tripExtras` + `EgtMoney.tripExtrasSettlement` — banner, gas and the
  poker pot on the same zero-sum ledger, folded in at final settlement only.
  `compute()` now returns `golfOnly` and `extras` beside `total`.
- `settlement.html` + `scripts/gen-settlement.mjs` — the one-screen board, in
  the SportsCenter's livery, generated from the engine.
- `tests/egtAudit.test.mjs` — replays the trip and pins every figure.

### The answer
Golf only: John $0 · Brian −$17 · TJ +$28 · Mike −$11.
With costs: **John +$110 · Brian −$107 · TJ −$6 · Mike +$3** (nets to $0).
Settle: Brian → John $55, → TJ $7, → Mike $5; TJ → John $30; Mike → John $25,
→ TJ $9. (Brian's $40 poker buy-in is already in the pot — $8 of it is TJ's,
$32 Mike's — which is why his bill is $67, not $107.)

### Open question left for the organizer
R6's Cup **points** still seed the singles 1v2 / 3v4 off the R5 standings, but
the matches actually played were TJ v John and Brian v Mike. Money is correct
either way (the Nassaus are settled as side matches); only the Cup-points
attribution for R6 singles would change.

## EGT SportsCenter — post-tournament REVEAL ceremony (branch claude/egt-sportscenter-reveal-sequence-dicwe5) — v1.10.0

The user wanted to reveal the trip results on the EGT SportsCenter as a
systematic, built-up "post-tourney reveal" that saves the Final EGT Standings
for the end.

Built a new **`reveal` broadcast mode** — a deliberately paced ceremony that is
pure ordering of the same cached facts the rest of the broadcast reads, so the
standings are always last:
- `components/bottomLineProvider.js`: new helpers `_titleCard`,
  `_awardWinnersModule` (season awards from `egt.live.tourneyStats`),
  `_championModule` (standings[0] hero), `_revealCountdown` (standings reversed,
  last→2nd, champion excluded). New `if (mode === 'reveal' && model)` branch in
  `broadcastModules` assembles the arc: cold open → BY THE NUMBERS (marquee stat
  pages) → THE HARDWARE (award winners) → ROUND BY ROUND (recaps in seed order)
  → THE FINAL STANDINGS title → reverse countdown → champion → full board
  (reuses the existing `standings` module as the closing image). Graceful with
  no scores (cold open + schedule only). `broadcastMode` already honored a
  forced mode, so reveal is manual-only; auto never selects it.
- `components/BottomLine.jsx`: four new `StageModule` renderers (`reveal-title`,
  `reveal-standing` giant ordinal + player hero, `champion` crown hero,
  `award-winners` grid). Page: `reveal` in `MODE_LABEL`, REVEAL mode button + `R`
  key, a **stage HOLD** toggle (`H` key / HOLD button) that freezes auto-rotation
  so the presenter reveals each place by hand, `←/→` step, longer reveal dwell
  (`REVEAL_DWELL_MS` 14s). Renamed the ticker-pause button to TICKER.
- Tests: +5 in `tests/bottomLineProvider.test.mjs` (reveal is forced-only; the
  ceremony saves standings for the end; countdown is last→2nd with the champion
  as #1; award winners read tourney stats; graceful with no scores). 186 green.
- Verified in headless Chromium (Playwright): built real full-trip facts and
  rendered every reveal frame — cold open, stat pages, THE HARDWARE, the reverse
  countdown, the CHAMPION hero, and the CUP STANDINGS closing board — all render
  cleanly with player logos/aliases, zero page errors.
- Version 1.10.0 everywhere (package.json, sw.js CACHE_VERSION + `?v=`,
  index.html `?v=`, bottomline.html `?v=` — the last was stale at 1.8.2, now
  synced), CHANGELOG entry, dist rebuilt.

## In-round scoring redesign — vertical player cards (branch claude/egt-scoring-redesign-ku27i6) — v1.9.0

Problem: the in-round scorer crammed four players into a non-scrolling grid,
auto-scaling every control down to fit one screen. For an EGT foursome with
several concurrent betting formats the touch targets were tiny and stats were
nearly impossible to enter during live play.

Redesign (`components/ScoreEntry.jsx`): replaced the ResizeObserver auto-scaling
grid with a **vertical stack of full-width player cards** (one golfer per
section, scrolls top→bottom, never horizontally). Each card carries every
per-hole interaction at a large size — score stepper, `1·2·3·4` putts,
full-width `HIT/MISS` toggles for FIR / GIR / **Sand** / U&D, penalty stepper,
BBB awards, pop strokes, Wolf picks. Read-only match/bet status moved to a
per-card collapsible "Matches & bets" disclosure plus the existing Games sheet,
so match visualization never competes with score entry.

Sand-save entry restored: re-added `sand` to `STAT_TRACK_DEFS` (opt-in),
`cardStats`, and enabled it for EGT rounds (`components/egt/egtBridge.js`
`statsConfig`). It feeds `extraStats.sand`, which the EGT side-games engine
already counts. `tests/statsConfig.test.mjs` updated; full suite 181/181 green.
Verified with a Playwright harness (4 players × 6 formats) across 320/390/430px:
zero horizontal page overflow, stat entry persists, keypad/wolf/games all work.

Files: `components/ScoreEntry.jsx`, `components/statsService.js`,
`components/egt/egtBridge.js`, `tests/statsConfig.test.mjs`, version bump to
1.9.0 (`package.json`, `index.html`, `sw.js`), `CHANGELOG.md`, rebuilt `dist/`.

## EGT Cup cross-device submitted-status sync (branch claude/egt-cup-mobile-sync-twd320) — v1.8.2

Reported bug: a round scored and finalized ("submitted") in the EGT Cup →
Rounds tab on the phone did not show as submitted — and its scores were absent
— when the Cup was opened on the web, throwing off standings and money.

Root cause: cross-device sync in PlayPal is per-round through Firestore
`playpal_rounds/<syncCode>`. The **native scorer** streams every EGT round's
raw hole scores there, and the **SportsCenter** reads the whole collection. But
the **EGT tournament store** — entered scores, side-game events, and the
`finalized` list that the engine uses to include a round in standings/money —
had only ever lived in each device's `localStorage`. Nothing pulled the synced
scores into the Cup screen, and the finalize gesture never left the device.

Fix (all read the same Firestore data the SportsCenter uses):
- **`components/egt/egtSync.js`** (new, self-contained: EgtBridge +
  RoundSyncService only). `hydrate(state, docs)` merges the synced round docs
  into the local store — non-destructive score merge, BBB/Wolf events, overlay
  match play, and per-round stake overrides (the last two only from a real
  saved round, not a synthesized live-only doc) — and reconciles `finalized`
  (explicit `egtFinalized` flag wins; else falls back to score completeness).
  `pull` (boot) + `subscribe` (live) target only this trip's rounds by their
  deterministic sync codes. `pushFinalized` broadcasts the submit/reopen.
- **EgtTournament.jsx**: boot pull + live subscription (via a `stateRef` so
  snapshots merge into the latest store, never a stale boot-time copy);
  `toggleFinalize` pushes the flag. **App.jsx** `_finishEgtRound` pushes on
  native-scorer finish.
- **EgtBridge**: `bridge` split into `mergeNativeScores` (non-destructive, for
  the pull) + `bridgeEvents`; `bridge` itself unchanged for the finalize path.
- **index.html `RoundSyncService`**: `writeMeta`, `fetchDocs`, `subscribeDocs`.
- **bottomLineProvider.js**: `normalizeRound` carries `egtFinalized`;
  `computeEgtFacts` honors it (explicit wins, else completeness) so the
  broadcast agrees with the app.

Files modified: components/egt/egtBridge.js, components/egt/egtSync.js (new),
components/bottomLineProvider.js, components/EgtTournament.jsx, components/App.jsx,
index.html, scripts/build.mjs, tests/helpers/load.mjs, tests/egt.test.mjs, sw.js,
bottomline.html, package.json, package-lock.json + rebuilt dist/.

Status: **complete — 178 tests green (10 new EgtSync tests), build clean,
browser smoke (app boot + EGT Cup + Rounds tab) zero console errors.** Released
1.8.2 everywhere (package(-lock).json, index.html/bottomline.html `?v=`, sw.js
CACHE_VERSION + precache incl. dist/egt/egtSync.js) + CHANGELOG.

Caveat: scores typed directly into the Cup's Rounds-tab grid (not via the
native scorer) still don't sync — the native scorer remains the cross-device
score path; the finalize flag itself always propagates.

## Full audit pass #5 — all things PlayPal, EGT Cup + SportsCenter focus (branch claude/playpal-egt-audit-t6p8ce) — v1.8.1

Status: **complete — 166 tests green (2 new regressions), browser smoke
verified (EGT standings "35 pts max" + breakdown + award races, corrected R4
rationale on the Rounds tab, friendly printable heading, SportsCenter
pre-round content + formatted lead-change alert; zero page errors).**

Read every EGT engine module, EgtTournament.jsx, bottomLineProvider.js,
BottomLine.jsx, the seed fixture, store/bridge/importer/printable, and the
app-shell wiring end to end. Baseline was healthy (164 tests, seed embed in
sync, dist fresh, 1.8.0 stamped everywhere). Defects found + fixed:

- 🟡 **SportsCenter NEW TRIP LEADER alert showed raw float points**
  (`bottomLineProvider.js` diffAlerts) — the one points display that bypassed
  the v1.7.3 fmtPoints sweep. A Cup lead change on a split award (3-way tie =
  ⅓ pt) would scroll `0.6666666666666666 pts` across the TV at the exact
  moment everyone watches. Fixed with fmtPts + a diffAlerts regression test
  that drives a real lead change (John 2 pts → Brian ⅔ pt leader).
- 🟡 **R4 seed pairings rationale was stale prose** — claimed "new teams"
  (they're the same John+TJ vs Brian+Mike as R2, kept by request) and "every
  pair has now shared a cart exactly once" after R4 (false: John+Mike and
  Brian+TJ first ride together in R5). Rewrote the fixture text to match the
  actual schedule; gen-seed re-run so the embed matches.
- ⚪ Printable packet scorecard headings printed machine keys
  (`bingoBangoBongo+matchPlay`) — mapped all six rounds to friendly labels
  (+ test asserting no camelCase key ever prints).
- ⚪ Removed the dead `GAME_ALLOWANCE` map from egtImporter.js (duplicated
  GAME_RULES and was referenced nowhere).

Verified sound with no changes needed: points/money/standings/scoring/side
games engines (R1 exclusion, zero-sum money, 35-pt ceiling recompute,
Flat Stick putt-tracking gate, gross Birdie King), importer R5 migration
(scramble→BBB+matchPlay applied in every recomputeAll), bridge (R2 team
Nassau kept out of the overlay so money can't double-count), SportsCenter
stake/overlay recovery, every broadcast module type has a renderer, sw.js
precache + ?v= strings, packlist offline. Released as **1.8.1** everywhere
(package.json + lock, sw.js CACHE_VERSION + ?v=, index.html, bottomline.html,
Home.jsx) with a CHANGELOG entry.

## Full audit pass #4 — pre-trip go/no-go (branch claude/session-t9l8vn) — v1.8.0

Status: **complete — 164 tests green, browser smoke verified (EGT standings
"35 pts max" + breakdown table + all 7 award races on phone viewport, Rounds
pills, SportsCenter pre-round card + Bottom Line ticker, packlist add-item;
zero console/page errors).**

Audited everything PlayPal / EGT Cup / EGT SportsCenter after the award
restructuring merged in PRs #93–#95 (Par King 2 pts, Bogey God 1 pt, Birdie
King now GROSS for 4 pts with net honorary, ceiling 30 → 35, packlist page).
Engine, seed, importer boot-refresh, standings, printable and app Award Races
were all found consistent. Defects found + fixed:

- **SportsCenter had no race page for the paying Birdie King** — the honorary
  net race had a full-screen leaders page but the 4-pt gross award had none.
  Added `stat-grossbirdies` ("BIRDIE KING RACE", gross values) ahead of the
  net page, which is retitled "BIRDIE KING RACE (NET · HONORARY)". The ticker
  segment already ranked gross — only the page rotation was missing it.
- **PRs #93–95 shipped with no version bump or CHANGELOG entry** (user-visible
  scoring change under an unchanged 1.7.6). Released as **1.8.0** everywhere
  (package.json + lock, sw.js CACHE_VERSION + all ?v= strings, index.html,
  bottomline.html, Home.jsx) with a CHANGELOG entry documenting the award
  restructuring + this audit.
- **packlist.html wasn't in the sw.js precache** despite advertising offline
  use — added (bottomline.html precedent).
- Stale comments still describing the 30-point/4-award structure fixed in
  egtPoints.js (×2) and bottomLineProvider.js (×2).
- New regression tests: season settlement pays Par King 2 / Bogey God 1 /
  Birdie King (gross) 4 to the right stat leaders reading the seed config;
  broadcast test asserts the gross race page (Mike 18 birdies) + honorary
  net labeling. 163 → 164 tests.

Verified sound with no changes needed: R1 stays out of stats/awards/points
(engine + tests), seed embed in sync with fixture (gen-seed diff clean),
maxPossible recomputes on every boot so stale persisted models pick up 35,
printable reads the refreshed model, dist matched a fresh build pre-audit.

## Cup-points explanations per round (branch claude/r1-stakes-money-tracker-d6otdm, restarted post-merge) — v1.7.6

Status: **complete — 163 tests green, browser smoke verified (phone viewport:
standings breakdown table, round pills, R2 team section, R5 individual with no
stale Teams row, R1 cash-only note; no page errors).**

The user wanted the app to explain how many Cup points each round is worth,
what earns them, and whether the round is a team or individual event.

- `EgtPoints.roundPointsBreakdown(model, rid)` + `seasonAwardsBreakdown(model)`
  (engine, testable): mode 'team'/'individual'/'none', per-player max,
  itemized `{label, pts}` rows, compact `summary`, plain-English `note`. Reads
  `pointsConfig` with the SAME fallbacks `pointsForRound` uses (R5's stale
  scramble keys in the seed are ignored by both), so display can't drift from
  scoring — a test asserts maxes match `ROUND_MAX_POINTS` and rebuild the
  30-point ceiling (24 round pts + 6 awards) = `adjustedMaxPossible`.
- Rounds tab: header pill per card (`🏆 4 CUP PTS · TEAM 2v2` / `INDIVIDUAL` /
  `💵 CASH ONLY · NO CUP PTS`), expanded **Cup Points** section with the
  how-to-earn-them table + note. Stale R5 "Teams" row fixed: Teams renders
  only when mode === 'team' (R2/R4).
- Standings tab: **"Where the 30 points come from"** table (R2 4 team, R3 4
  ind, R4 5 team, R5 4 ind, R6 7 ind, awards 6 → 30 max/player) + header line
  now derives the total from the breakdown.
- Version 1.7.6 everywhere; package-lock stamp synced. CHANGELOG entry added.

## Remove EGT Pairings tab (branch claude/r1-stakes-money-tracker-d6otdm, restarted post-merge) — v1.7.5

Status: **complete — 162 tests green.**

Removed the Pairings tab (fairness matrices + handicap-balance table +
scorecard stats) from the EGT Cup screen at the user's request — the analysis
proved the schedule was balanced and isn't needed day-to-day. Cart pairings
and rationale still show on each round card in the Rounds tab; the written
analysis remains in `docs/EGT_PAIRINGS.md`. Version 1.7.5 everywhere.

## R1 stakes in the overall money tracker (branch claude/r1-stakes-money-tracker-d6otdm) — v1.7.4

Status: **complete — 162 tests green.**

Task: guarantee R1 (Minerals, flat/stakes-only) money is captured in the
overall money tracker even though its formats/points don't count toward the
EGT Cup. Audit result: the tournament engine already settles R1 money (BBB +
Nines + skins + overlay matches + CTP/LD in `egtMoney.moneyForRound`), and the
app's Standings money table, printable packet, and broadcast bankroll all read
the engine total — but one real defect was found and fixed:

- **SportsCenter per-round payout cards ignored the engine**
  (`components/bottomLineProvider.js` money builder read `live.money.byRound`,
  a key the engine never produces — its map is `live.money.rounds`). Finalized
  rounds always fell back to native live payouts, which for R1 silently drop
  The Nines money (no native Nines engine) and skip CTP/LD + recovered stake
  overrides everywhere. One-line fix + regression tests.
- New tests: engine level (R1 money in `money.rounds.R1` and the overall
  total, zero-sum, while Cup points stay 0 for everyone) and broadcast level
  (Nines money present, bankroll = engine totals, finalized card labeled
  PAYOUTS with engine amounts).
- Version 1.7.4 everywhere (package.json, index.html, bottomline.html, sw.js
  cache + query strings, Home.jsx — which had been stuck at v1.7.2),
  CHANGELOG entry added.

## Full audit + GUI optimization (branch claude/playpal-audit-gui-optimization-pwq1ef) — v1.7.2

Status: **complete — 151 tests green, browser smoke verified (focus retention
while typing scores/stakes, landscape chrome compaction, SportsCenter keyboard
mode switch, Award Races render).**

Audited PlayPal scoring/tracking/handicap, the EGT Cup engines, the SportsCenter
integration, and the GUI in both orientations. Engine math (handicaps, pops,
points, zero-sum money, standings, tiebreakers, R6 reseed) verified sound; the
live defects were in the view layer and the app→broadcast stake sync.

- **EgtTournament.jsx refactor** — inline component types made React remount the
  subtree per keystroke (focus loss in score/stake inputs; Individual Matches
  editor state reset). Tab/card renderers are now invoked as plain functions;
  `EgtSiEditor` + `EgtStakeInput` hoisted to module scope (see the layout note
  at the top of the file — keep it that way).
- **Stake input buffering** — clearing a stake no longer snaps back to the
  default mid-edit (draft state while focused, commits every keystroke).
- **SportsCenter stakes** — `computeEgtFacts` recovers per-round stake overrides
  from the synced native format objects (skins/bbb/wolf/nassau), so broadcast
  money settles at the app's rates. Known limit: R4/R6 `nassauPerPoint` is only
  recoverable when the round carries a Nassau format (i.e. matches configured).
- **Leaders in all categories** — Award Races table (Skins King / Birdie King
  net / Flat Stick / Iron Man) on the app's Standings tab; `stat-skins` +
  `stat-netbirdies` stat-leaderboard modules in the SportsCenter post rotation.
- **GUI** — landscape chrome compaction (NavBar `compact` prop + short-viewport
  bottom nav in App.jsx, `(max-height: 480px)`); SportsCenter wake lock +
  keyboard controls (F/Space/→/±/A-P-L-S) + pause button + key legend.
- Tests: +2 (stake recovery drives engine money; award-race broadcast modules).
  Version 1.7.2 everywhere (package.json, index.html, bottomline.html, sw.js
  cache + query strings, Home.jsx), CHANGELOG entry added.


## EGT 2026 pairings + tee times + Nassau overlay (branch claude/egt-2027-pairings-gbh70n) — v1.7.0

Status: **complete — 143 tests green, browser-smoke verified (Rounds redesign,
Pairings tab matrices, Individual Matches on every round, new tee times).**

Single source of truth is `fixtures/egt-2026-seed.json`; `scripts/gen-seed.mjs`
regenerates `components/egt/egtSeedData.js` (do not hand-edit the embed).

- **Task 2 — tee times.** Each round now has structured `teeTimes` + an updated
  `teeTimeTarget` string (Minerals 10:00/12:36, Ballyowen 7:30, Wild Turkey 1:45,
  Crystal Springs 7:30, Cascades 2:02/4:08, Black Bear 8:36). Propagates to the
  Rounds page, Bottom Line schedule and SportsCenter automatically (all read the
  seed). No stale tee-time strings remain in the repo.
- **Task 1 — pairings.** Each round carries `pairings.carts` + a director
  rationale. R2 teams rebalanced to John+Mike vs Brian+TJ (avoids the low-low
  super-team; with R5 individual, R2 & R4 are the only team rounds and both are
  balanced, avg team Δ 5). New **Pairings** tab renders partner/opponent/cart
  frequency matrices + handicap-balance table + a fairness scorecard. Written
  deliverable in `docs/EGT_PAIRINGS.md`.
- **Task 3 — Rounds page.** RoundCard redesigned: consistent structure, tee-time
  chips, "Pairings & Logistics" block, unified section headers/typography.
- **Task 4 — individual Nassau overlay for R1–R6.** Generalized the old R5-only
  `r5Matches` to `events.roundMatches[rid]` (legacy R5 migrated on read).
  `egtBridge.formatsFor` now merges configured 1v1/2v2 matches into one Nassau
  tracker on any round (R2's team match + overlay; R5's overlay = the match
  play; standalone elsewhere), reusing the existing Nassau engine + the
  `NassauMultiMatchConfig` UI. No duplicate score entry.
- Version bumped 1.6.3 → 1.7.0 (package.json, index.html, bottomline.html,
  sw.js cache + query strings, Home.jsx), CHANGELOG entry added.



## Previously — EGT 2026 Cup tournament engine (branch claude/playpal-egt-tournament-25w5g0)

Status: **engine + UI complete, all tests green (111 pass), browser-smoke verified.**

Built the tournament feature that loads the EGT 2026 trip definition, runs live
scoring across six mixed-format rounds, and produces printable standings.

### What shipped this pass
- `fixtures/egt-2026-seed.json` — the canonical trip definition (schemaVersion 2.2),
  committed as the reference fixture. `components/egt/egtSeedData.js` embeds it as
  `window.EGT_SEED` so the offline PWA imports with zero network.
- Engine (classic scripts, `window.Egt*`, built file-by-file by esbuild, loaded
  into the test VM by `tests/helpers/load.mjs`):
  - `egtHandicap.js` — course handicap, playing handicap, the §2 pop-allocation
    rule (base+extra by SI, 2nd stroke past 18), permutation validation, 9-hole
    interleave. This is the piece proved against every golden array.
  - `egtImporter.js` — normalize seed → model; derive all course handicaps + pops
    live from `courseLibrary` SI; idempotent by trip.id; SI-entry + auto-recompute;
    tolerant of `holes: null` (pending SI).
  - `egtScoring.js` — BBB, Nines, four-ball match + Nassau, Wolf, team Stableford,
    individual Stableford, scramble, alternate shot, singles, gross/net skins.
  - `egtSideGames.js` — Pass the Money (The Rock) ledger, CTP/LD, tracked stats.
  - `egtPoints.js` — EGT Cup points + season awards (verified vs maxPossible 36/30).
  - `egtMoney.js` — zero-sum money engine (every round nets $0 by construction).
  - `egtStandings.js` — leaderboard, tiebreakers, R6 reseed, night snapshots/deltas.
  - `egtStore.js` — localStorage persistence, idempotent re-import preserving scores.
  - `egtPrintable.js` — print-ready standings + scorecards from stored data.
  - `egtEngine.js` — orchestrator: run rounds → points/money/standings → snapshot.
- UI: `components/EgtTournament.jsx` (new `EGT CUP` tab in `App.jsx`) — standings
  with deltas + money, per-round score entry + finalize, SI-entry modal with
  permutation validation, printable packet. Wired into `index.html` + `sw.js`
  precache; `build.mjs` SOURCES; `build-www` copies `dist/egt/` automatically.
- Tests: `tests/egt.test.mjs` — the §8 acceptance suite (course handicaps, the
  golden reproduction of EVERY strokeAllocations[*].holes array, R2/R6 callouts,
  SI-gap load→enter→recompute, money nets to $0) + calculator/standings units.

### Key decision (flagged to user)
The seed plays **White tees**, so R2 Ballyowen course handicaps are 13/18/23/23
(seed) — NOT §8's prose 17/23/28/28, which are Ballyowen **Blue** tees. Per the
task's explicit "courseLibrary is the single source of truth / seed value wins",
the engine reproduces the seed's White-tee values exactly. R6 (16/22/27/27) matches
§8 as written.

### Follow-up shipped — native scorer integration (post-merge)
Each EGT round now opens in the app's real hole-by-hole scorer (ScoreEntry),
not the compact grid. New `components/egt/egtBridge.js`:
- `toNativeRound(model, roundId)` builds a native `round` (course {num,par,hdcp}
  from the played tee, players with index/initials/color, matching format
  trackers, putts/FIR/GIR/sand on, deterministic id + sync code).
- `bridge()` translates native score arrays + BBB/Wolf events back into the EGT
  store; `readNativePayload()` reads them from localStorage on finalize.
App wiring: EGT card "Score this round" → native ScoreEntry; finishing bridges
scores in, finalizes the round, recomputes standings, returns to the Cup screen.
Standings recompute on finalize (per user's choice). R5 scramble/alt-shot derive
the team ball from the four per-player grosses (per user's choice).
Verified: 114 tests pass; browser smoke — launch prefilled scorer + bridge/
finalize updates standings (John 8.5 pts from bridged R6 scores).

### Next actions (if resumed)
- Optional: reflect EGT per-game pops (off-low/allowance) in the native scorer's
  on-screen dots (today it shows full-handicap pops; EGT engine stays authoritative).
- Optional: per-hole net-birdie basis toggle for The Rock (currently skinsNet).

## Previously shipped (merged) — v1.4.0 App Store readiness
Self-contained vendored bundle + in-repo Capacitor iOS project. Merged as PR #59.
Do NOT redo. (Prior detail preserved in git history / CHANGELOG.)

## EGT Bottom Line ticker (branch claude/egt-bottom-line-ticker-347cku) — v1.6.0

Status: **complete — 136 tests green, browser-smoke verified (empty state,
live data via stubbed Firebase, alert banner + alert card injection).**

Built `/bottomline` (bottomline.html on GitHub Pages): an always-on ESPN-style
broadcast ticker for TVs.

- `components/bottomLineProvider.js` — pure, modular data provider
  (`window.BottomLineProvider`). Registry of segment builders (live now,
  round/trip leaderboards, money, formats, stats, EGT Cup, fun stats,
  spotlight, records, schedule) round-robined by category so the feed rotates
  topics. `computeFacts(world)` = cached computed statistics;
  `buildFeed(facts)` = ticker segments; `diffAlerts(prev, next)` = breaking
  cards (birdie/eagle/ace/double/meltdown, hot streak, lead changes across
  round/format/trip/money, new trip record). Reuses the app's engines:
  calcAllPayouts/calcSkins/calcWolfStandings/nassauSegmentStatus/
  computePTMState/StatsService/buildTripLeaderboard/EgtEngine.liveUpdate.
- EGT Cup on the TV: reconstructs tournament state from `EGT_SEED` +
  synced Firestore liveScores via EgtBridge (handles liveScores-only docs by
  synthesizing the native round from the seed; deterministic sync codes);
  state.tripId gets a `:bottomline` suffix so nothing clobbers the app store.
- `components/BottomLine.jsx` — page + imperative rAF ticker engine
  (transform-only, fill/recycle/rebase with no visual jump, alerts jump the
  off-screen buffer, changed cards flash, pause-on-hover, speed control,
  fullscreen, auto-hiding controls, breaking banner, live clock header).
- Realtime: onSnapshot on the whole `playpal_rounds` + `golf_trips`
  collections, RTDB `players`; recompute debounced 400ms; first emit is
  immediate so the seed schedule scrolls with no network.
- Wired: build.mjs SOURCES, sw.js precache (+bottomline.html), version bump
  1.6.0 everywhere, CHANGELOG, tests/helpers/load.mjs, 12-test suite in
  tests/bottomLineProvider.test.mjs.

## Full audit pass #3 — EGT Cup + SportsCenter focus (branch claude/full-audit-egt-focus-g1rrvm) — v1.7.3

Status: **complete — 159 tests green (8 new regressions), dist rebuilt, version 1.7.3.**

Hyper-focused audit of components/egt/*, EgtTournament.jsx, BottomLine.jsx,
bottomLineProvider.js. Five real defects found, all fixed + regression-tested:

1. 🔴 Match-play pops auto-filled from handicap INDEX, not COURSE handicap.
   The Rounds-tab match editor got native players (handicap = HI); its
   auto-fill (calcAutoPopHoles) baked HI-difference pops which count as manual
   overrides in engine + tracker + broadcast. R5 John v TJ: 10 pops instead of
   11 (CH 17 v 28). Fixed: EgtTournament passes CH-based players to
   NassauMultiMatchConfig; new EgtBridge.repairMatchPops clears stored,
   untouched legacy auto-fills on boot (manual edits preserved).
2. 🔴 SportsCenter never passed season flag → after R6 the TV was missing all
   4 season awards (6 pts) + Pass-the-Money settlement; could show wrong
   champion. computeEgtFacts now passes season: finalized.includes('R6')
   (live pass + climber/dropper pass).
3. 🟡 Raw float points (0.6666666666666666) displayed in app standings,
   printable, ticker, broadcast modules. New shared EgtStandings.fmtPoints
   used everywhere points render.
4. 🟡 Flat Stick winnable with 0 tracked putts. trackedStats/seasonStats now
   carry puttHoles; engine + Award Races require puttHoles > 0.
5. 🟡 TV pre-round cards for R4/R5/R6: primaryGame keys missing from
   FORMAT_RULES → mangled labels, empty rules panel. Added all three; the
   schedule ticker now uses the resolved label.

Files: components/egt/{egtBridge,egtPoints,egtSideGames,egtStandings,egtPrintable}.js,
components/{EgtTournament.jsx,bottomLineProvider.js}, tests/{egt,bottomLineProvider}.test.mjs,
version bump 1.7.3 (package.json, index.html, bottomline.html, sw.js), CHANGELOG.

---

## 2026-07-14 — Crystal Springs Golf Trip Playlist Generator (side project)

Self-contained in `crystal-springs-trip/` (no app code touched).

- 9 curated playlists, 553 unique songs, 36h 01m total; all within ±5 min
  of the brief's runtime targets.
- `playlist_data.py` (source of truth) + `generate_playlists.py`
  (validates zero duplicate songs across all playlists and ≤3 songs per
  artist per playlist; exits non-zero on violation).
- Deliverables in `crystal-springs-trip/output/`: master xlsx + csv,
  per-playlist CSVs, Soundiiz-ready import CSVs, JSON backup, PLAYLISTS.md,
  VALIDATION.md.
- `automation/amazon_music_uploader.py`: Playwright uploader for Amazon
  Music (manual login, resumable, per-track report + replacement
  suggestions). Not yet run — waiting on user to run locally and log in.

Next action if resuming: nothing pending in-repo; automation runs locally.
