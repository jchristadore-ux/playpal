# Changelog

All notable changes to PlayPal. Format follows [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [Unreleased]

## [1.16.0] — 2026-08-23 — App Store submission audit

A full pass over the app ahead of an App Store submission: the money, the
handicap strokes, the layouts, the post-round summary, and everything a public
build must not ship.

### Money — every format now settles

- **The 20 MatchEngine formats paid nothing.** Stroke play, individual net,
  Stableford, Quota, match play, four-ball, Nassau, skins, sixes, best ball,
  shamble, team gross/net, scramble, 2-person scramble, alternate shot,
  foursomes, Chapman, Wolf and Bingo Bango Bongo all computed standings and a
  winner, and then no money changed hands — there was no stake field and no
  payout path. Each format now declares how a stake settles (`pot`, `unit`,
  `match`, `nassau`), Setup has a stake input per game (zero = play for pride),
  and `MatchEngine.payouts()` returns a zero-sum ledger. Verified zero-sum for
  all 19 concrete formats.
- **New `calcRoundPayouts(round, data)`** settles the money games and the engine
  games in one call, rounded to cents and still netting to $0, so the summary,
  the trip dashboard, the email and the stored round can't disagree.
- **Cents.** Money was displayed with `toFixed(0)` while Venmo was charged
  `toFixed(2)` — a $12.50 debt showed as "$13" and requested $12.50. All money
  now goes through `fmtMoney`, which shows cents only when there are cents, and
  the Venmo request asks for exactly the figure on screen.

### Nine-hole layouts

- A nine-hole Nassau settled front nine, back nine AND overall against the same
  nine holes — three bets for one match, paying 3× what it should. It is now a
  single bet; eighteen holes still settles front + back + double overall.
- Skins, Wolf, Bingo Bango Bongo, Tee Ball and Markey Match all iterated a
  hardcoded 18 holes. Every one now sizes off the course being played, and a
  nine-hole Markey Match no longer spawns a turn press it never reached.

### Handicap strokes and auto-pops

- **Pops are now automatic.** Skins, Stableford, Pass the Money and Bingo Bango
  Bongo scored gross unless someone remembered to tap "POP?" on the right holes.
  Strokes are now allocated at round setup from each player's course handicap
  (slope, rating and the chosen tee) off the low ball, and every hole stays
  editable.
- **Pop flags carry a stroke count**, not a yes/no — a 27-handicap off scratch
  gets a second stroke on the hardest nine. Rounds saved before this still read
  correctly (`true` = one stroke).
- **Nassau auto-pops work for 2v2**, not just singles, and come off course
  handicaps rather than raw index difference. The pop grid sizes to the layout.
- **Plus handicaps work.** `getHoleStrokes` returned −1 on *every* hole for a
  plus player; it now hands strokes back from the easiest hole down. The profile
  form no longer clamps a handicap index at zero.

### Small fields and solo rounds

- Wolf with two players paid the wolf a phantom win (the "field" summed to zero).
  Too small a field is now a push.
- **Rounds can have one player.** Setup required two. A solo practice round with
  "Just the scorecard" now works, and money games that need a field are disabled
  with the reason shown rather than silently producing nothing.
- Verified every screen at 1, 2, 3 and 4 players in portrait and landscape.

### Portrait and landscape

- The scorer now re-lays-out on rotation instead of reading the viewport once at
  mount, lays player cards out in columns when there is width for them, and
  shrinks the card on short screens so a player still fits.
- The PWA manifest no longer locks the app to portrait.

### Post-round summary, email and Venmo

- **One report builder** (`SharingService.roundReport`) drives the screen, the
  email and the share sheet: leaderboard, net scores, every game with its money
  and its result, per-player stats, the whole-round ledger, the settle-up list
  and Venmo links — plus the hole-by-hole grid in the full version.
  Engine games were previously absent from the email entirely.
- **The email now fits.** A full 18-hole ASCII card blew past what a `mailto:`
  URL carries and iOS Mail silently truncated it. The mail body is assembled at
  the richest level that fits the budget, the money always survives the trim,
  and the complete card goes to the clipboard so it can be pasted in.
- Missing email addresses and missing Venmo handles are now named on screen
  instead of silently dropping people from the send.
- Venmo no longer force-opens a second browser tab 1.2 seconds after the app
  link; the web fallback is a visible link on the row.

### App Store blockers

- **The GHIN posting was fake.** "POST SCORES TO GHIN" ran a 2.2-second timer
  and reported "Scores posted to GHIN ✓" having posted nothing (App Review 2.3.1).
  Replaced with an honest export: it copies every player's hole-by-hole scores,
  tees, rating and slope to paste into GHIN's own score entry, and says plainly
  that PlayPal cannot post on your behalf.
- **All synced data lived in one global namespace.** Every anonymous user of a
  public build would have read and overwritten every other user's player
  profiles — including email addresses and Venmo handles — and `players.set()`
  wiped the previous roster on each save. Data is now namespaced by a 130-bit
  **group** code created on the device and shared with your playing partners;
  Home gained a group panel (show, copy, join, start fresh) and join links carry
  the group. Firestore and RTDB rules were rewritten to match. Installs that
  predate this keep their data on the reserved `LEGACY` group.
- **No more sample personal data.** The app shipped four player profiles
  carrying names, GHIN numbers, email addresses and Venmo handles. A fresh
  install now starts empty and prompts for the first player.
- **The EGT Cup is gated.** Its seed carries four named people, their photos and
  their money; it is no longer on the tab bar of a fresh install. Devices that
  already hold Cup data keep it, and tapping the version line seven times
  unlocks it.
- `Info.plist`: `armv7` → `arm64` (no iOS 13+ device is 32-bit), plus camera and
  photo-library usage strings for the scorecard photo picker.
- Privacy policy and support pages updated for groups, scorecard photos, the
  email/Venmo behaviour, and the GHIN correction.

### Added — a course from a scorecard photo

- New Round → Course → ADD A COURSE takes a photo or screenshot of a scorecard,
  pins it above the entry grid with zoom and rotate, and keeps it entirely on
  the device — no upload, no OCR service, no network call.
- **Paste the numbers** reads par, yardage and stroke-index rows in whatever
  shape they arrive — labelled or not, one row of 18 or two rows of 9, with
  OUT/IN/TOTAL subtotals mixed in — and fills the grid. It says what it could
  not read rather than guessing.

### Fixed

- A custom course added while offline vanished from the list: the screen waited
  for Firebase to echo it back instead of using what it had just saved.
- `roundMeta.formats` crashed on an unknown format type and omitted engine games.

### Tests

- `tests/moneyAudit.test.mjs` — 37 new tests covering payouts for every engine
  format, zero-sum settlement, nine-hole layouts, small fields, plus handicaps,
  auto-pops, money formatting, the report builder, the scorecard parser and
  group codes. Suite: 259 passing.
- Browser verification: 16 viewport × player-count combinations, three complete
  18-hole rounds through to the settlement and send tabs, the photo import flow,
  and a true first-run install.


## [1.15.0] — 2026-07-27

The recap book on paper: a PDF of every page.

### Added
- **`recap/pdf/` — one PDF per page**, 25 of them, mirroring the book's folder
  layout (`recap/pdf/rounds/r3.pdf`, `recap/pdf/matches/…`, `recap/pdf/players/…`).
  146 sheets in all, printed through Chrome's own PDF engine by
  `npm run recap:pdf` (`scripts/gen-recap-pdf.mjs`), so the paper matches the
  browser exactly. `recap/pdf/print.pdf` is the whole book in one file.
- Chrome is located from `$CHROME`, then the Playwright browsers the repo's
  tooling already installs, then the usual system paths — with a clear error if
  none is found.
- Each page links to its own PDF (screen only), and the cover lists the
  whole-book PDF.

### Fixed
- **Wide scorecards would have been clipped on paper.** On screen a 23-column
  card scrolls inside its own box; printing that box drops everything past the
  edge, so the last holes, the totals and the net column would have been
  *absent* from the PDF rather than merely cut off. Print rules now let the
  table overflow visibly and shrink it to the printable width of a Letter page,
  and the whole card lands on one sheet. Table heads repeat across page breaks
  and rows no longer split.
- **A money figure could break after its sign.** Printed narrow, `−$31.25`
  wrapped to leave `$31.25` alone on the next line — reading as money owed *to*
  a player rather than *by* him. Every signed figure now sits in a nowrap span,
  including the ones inside the engine's own "how each stake was decided" prose.
- The cover's player tiles rendered escaped markup (`&lt;span class="amt"&gt;`)
  in their subtitles.

## [1.14.0] — 2026-07-26

The 2026 trip, memorialized: a recap book of standalone pages under `recap/`.

### Added
- **`recap/` — one page per thing worth keeping.** 25 standalone HTML pages
  generated by `npm run recap` (`scripts/gen-recap.mjs`):
  - **a page per round** (`recap/rounds/r1–r6.html`) — the full 18-hole
    scorecard with pop dots and score-to-par marks, every game the round
    decided hole by hole (BBB awards, The Nines splits, the four-ball, Wolf's
    per-hole units, aggregate Stableford, the round robin, the singles), the
    course handicaps and every pop with its basis, what the round paid in Cup
    points, the money with its settle-up, and the carts;
  - **a page per match** (`recap/matches/`, 10 of them) — the Ballyowen
    four-ball, the Wild Turkey side Nassau, all six Cascades round-robin
    matches and both Black Bear singles, each walked hole by hole with the
    best net ball, the running match state, front/back/overall, the cash and
    the Cup points;
  - **a page per player** (`recap/players/`) — round by round, every match,
    every Cup point traced to where it was won, every dollar including the
    off-course ledger, and his numbers against the field;
  - **the standings** (`recap/standings.html`) — the final board with
    tiebreakers, the night-by-night climb, where all 33 points come from, and
    every player's full points ledger;
  - **the awards** (`recap/awards.html`) — the five season awards with the
    stat race behind each, every title won on the trip, and The Rock's ledger;
  - **the money** (`recap/money.html`) and **the whole book on one sheet**
    (`recap/print.html`) for printing or saving as a PDF.
- Every page is self-contained — styles inlined, no scripts, no fetches — so a
  single page can be saved, mailed or printed on its own and still reads.
- Every figure is recomputed by the tournament engine from
  `fixtures/egt-2026-seed.json` + `fixtures/egt-2026-results.json`, the same
  replay the settlement board and the money audit run. The generator refuses to
  write the book if its per-round points attribution does not add up to the
  engine's totals, or if the money fails to net to zero.
- `npm run recap` and `npm run settlement` script aliases.

### Fixed
- **The GitHub Pages deploy left out `settlement.html` and `packlist.html`.**
  Both are in the service worker's precache list, and `cache.addAll()` rejects
  as a whole if any entry 404s — so the worker never installed on the deployed
  site and the PWA had no offline shell. Both are now copied, along with
  `recap/`.

## [1.13.0] — 2026-07-25

Three more shared costs, split evenly across the four of them.

### Added
- **Costs can be stated as the whole bill instead of the per-man share.** A
  `collect` item in `tripExtras` now accepts `total` alongside `perPlayer`; given
  a total it splits evenly across everyone who shared it — **the man who fronted
  it included**, so he carries his own quarter and collects the other three. The
  seed records the real receipt ($85) rather than a hand-computed share ($21.25),
  which is the number anyone checking the ledger actually has.
- Three costs on the 2026 ledger, each split four ways:
  **custom jerseys** $30 a piece / $120 all in (Brian fronted),
  **the steak night** $85 (TJ), and **three trays of food** $40 (Mike).

### Changed
- **The settle-up now spends prepaid cash against every bill, not just the
  pot's own winners.** Brian's $40 poker buy-in clears what he owes TJ ($6.25)
  and Mike ($17) outright; the $16.75 left over goes against what he owes John,
  because cash already handed over settles whatever its payer owes — the pot
  holder simply passes it on. Previously the remainder bounced back as a refund,
  which was correct but made for an extra round trip. A payer whose float
  outruns every bill still gets the true remainder back.
- **Money renders to the cent where a split lands on one.** Shares of an odd
  total ($85 over four is $21.25) no longer round to whole dollars on the
  settlement board or the SportsCenter cards. The ticker's own bankroll figures
  still round, as before.
- A bill the pot has already covered reads **"paid from the pot"** rather than
  "$0" on both the board and the broadcast.

### The 2026 bottom line, restated
John **+$48.75** · TJ **+$17.75** · Mike **−$18.25** · Brian **−$48.25**.
Settle: Brian → John $8.25 · TJ → John $8.75 · Mike → John $15 · Mike → TJ $20.25
(Brian's obligations to TJ and Mike are covered by his buy-in already in the pot).

## [1.12.0] — 2026-07-25

The tournament money summary, on every screen that shows the Cup.

### Added
- **`components/egt/egtMoneySummary.js` — one description of the money**, shared
  by the three surfaces that show it so they can never disagree: the final
  standing per player (with golf and off-course split out), the netted
  who-pays-whom, a row per round plus the off-course costs, and a plain-language
  line for every stake that changed hands ("TJ v John — front TJ by 5 · back
  John by 1 · overall TJ by 4 → TJ +$4"). Degrades cleanly: called mid-trip it
  reports the rounds finalized so far and a golf-only bottom line.
- **A Money tab on the EGT Cup screen.** Standing cards, the settle-up, the full
  ledger, and how each stake was decided — the whole reckoning without leaving
  the app. Empty until a round is finalized.
- **Money on the SportsCenter.** Two new broadcast cards: `money-ledger` (every
  round and cost as one grid, sized off the row count so six rounds plus the
  extras still fit a TV) and `money-settle` (who hands what to whom, with player
  logos). Both play in the post-round rotation and in **THE REVEAL**, as a new
  act — *THE DAMAGE* — right after By the Numbers.
- `settlement.html` now renders from the same shared summary rather than its own
  copy of the logic.

### Fixed
- **A prepaid pot credit could be applied against the wrong item.** Cash already
  handed over was matched to every off-course item where the payer was down, so
  Brian's $40 poker buy-in was also being credited against the banner and gas
  John fronted — crediting $80 of a $40 float and turning one settlement
  negative. Each item now carries its own `prepaid` map and the credit only ever
  applies to that item's winners. (`egtMoney.tripExtrasSettlement`.)
- **A pot credit can no longer reverse a bill.** If the pot holds more of
  someone's cash than that pairing ends up owing, the credit clamps at the
  amount owed and the remainder is reported as `refund` — money owed back to
  them — instead of producing a transfer running the wrong way.

## [1.11.0] — 2026-07-25

The EGT 2026 money audit — the settlement the trip actually ended on.

### Fixed
- **Round 4's Stableford was scored on the wrong handicap basis, and paid
  nobody.** Crystal Springs ran at the seed's 85% full-dot allowance
  (John 14 / Brian 19 / TJ 24 / Mike 24), which landed on a **39–39 tie** — so
  the round settled $0 despite a clear result on the course. Every other net
  game on the trip runs off the low ball, and so does this one now: 100% course
  handicap off the low player, John scratch (0 / 5 / 11 / 11). The real result
  is **Brian + Mike 26, John + TJ 18**, worth $10 a side.
  (`egtImporter.js` `GAME_RULES.teamStableford`, seed `strokeAllocations.R4`.)
- **Three rounds' side wagers settled for $0 unless someone opened the match
  editor.** R3's TJ v John $2 Nassau, R5's six-match round robin, and R6's two
  $2 Nassaus are the wagers the group actually played, but the engine only ever
  read matches from `events.roundMatches` — configured by hand, per device. The
  seed now ships them (`rounds[].sideMatches`) and the engine falls back to them
  when nothing is configured, so the money is right out of the box. Between them
  they move **$29** that was previously never settled.
  (`egtEngine.js` `buildRoundCtx`, `egtBridge.js` `toNativeRound`.)
- **Pass the Money settled cash nobody wagered.** The Rock's ledger is derived
  from the scores, so it always produced a final holder and quietly moved
  **$129** to John at season settlement. It now settles only when the seed says
  the game was in play (`sideGames.passTheMoney.played`, default `false`); the
  ledger is still derived for display.

### Added
- **Off-course money on the same ledger** (`model.tripExtras` →
  `EgtMoney.tripExtrasSettlement`). Shared costs and the poker game settle with
  the golf, so the running bankroll is the real bottom line: the EGT banner
  ($30 to John from each), gas ($20 to John from each), and the $120 poker pot
  (70/30 — Mike $84, TJ $36). Two item shapes — `collect` (one player fronted a
  cost) and `pot` (buy-ins in, payouts out) — both zero-sum. Cash already handed
  over rides along as `prepaid` so the settle-up doesn't double-charge it. Folds
  in at final settlement only, so the mid-trip bankroll stays golf-only.
  `EgtMoney.compute` now also returns `golfOnly` and `extras` alongside `total`.
- **`settlement.html` — a one-screen final money board**, in the SportsCenter's
  own livery: each player's final position, the netted who-pays-whom, the
  round-by-round ledger, and how every stake was decided. Generated from the
  engine (`node scripts/gen-settlement.mjs`), never hand-typed, so it cannot
  drift from what the app computes.
- **`fixtures/egt-2026-results.json`** — every score posted on the trip,
  recovered from the rounds the app synced, including the manually entered
  Bingo-Bango-Bongo and Wolf events.
- **`tests/egtAudit.test.mjs`** — 14 tests that replay the real trip and pin
  every round's payout, the off-course ledger, and the final settlement
  (John +$110 · Brian −$107 · TJ −$6 · Mike +$3), so a future scoring change
  can't silently move a number the group already settled on.

## [1.10.0] — 2026-07-24

The post-tournament results show for the EGT SportsCenter.

### Added
- **THE REVEAL — a systematic, built-up results ceremony on the SportsCenter.**
  A new broadcast mode (press **R**, or the **REVEAL** button) plays a paced,
  post-tournament reveal that deliberately **saves the Final EGT Standings for
  the very end**. The arc: a cold-open title (*THE FINAL WORD*) → **By the
  Numbers** (scoring average, greens, money leaders) → **The Hardware** (season
  award winners — Birdie King, Par King, Bogey God, Flat Stick) → **Round by
  Round** (every round recapped in the order it was played) → **The Final
  Standings**, counted down **in reverse** — last place first, one dramatic
  full-screen position at a time, up to the **Champion** hero card, closing on
  the full Cup standings board. Reveal is manual-only; the auto rotation never
  jumps to it, so it's there when you want to run the reveal and never before.
- **Presenter controls for driving the reveal by hand.** A **HOLD** toggle
  (**H** key / HOLD button) freezes the stage on the current card so you can
  reveal each place on your cue; **←/→** step between cards; reveal cards dwell
  a little longer than the live rotation for gravitas. (The Bottom Line ticker's
  own pause moved to the **TICKER** button / **Space**.)

### Notes
- New broadcast module renderers (`reveal-title`, `reveal-standing`,
  `champion`, `award-winners`) and the `reveal` mode are pure additions to
  `bottomLineProvider.js` / `BottomLine.jsx`; the existing PRE / LIVE /
  SPORTSCENTER modes are unchanged. All data is the same cached facts the rest
  of the broadcast reads — the reveal is entirely an ordering of them.

## [1.9.1] — 2026-07-24

### Removed
- **Sand-save input from the scorer.** The group isn't tracking sand saves, so
  the `SAVE / MISS` toggle added to each player card in 1.9.0 is gone, along
  with the `sand` stat definition and its EGT-round default. The rest of the
  1.9.0 vertical scoring redesign is unchanged.

## [1.9.0] — 2026-07-24

Vertical, touch-first in-round scoring — rebuilt for the EGT Cup final round.

### Added
- **Sand-save tracking is back** as an opt-in per-hole stat (a big `SAVE / MISS`
  toggle on each player card) and is on by default for EGT Cup rounds, so the
  bunker up-and-downs the tournament's stats engine already counts can finally
  be entered while you play. (Removed in 1.5.1 for density; density is no longer
  the constraint.)
- **Head-to-head "Settle up" on the Money tab.** Alongside the per-player net,
  the EGT app now shows the **pairwise settlement** — who owes whom, each
  matchup netted on its own (e.g. after R1: *TJ owes John $8, Mike owes John
  $11, Mike owes TJ $5*) rather than a globally-minimized transfer list, so it
  matches how the group settles at the bar. The money engine tracks the
  head-to-head flows and exposes `money.settlements` per round and for the trip.

### Changed
- **Redesigned the in-round scoring screen as a vertical stack of full-width
  player cards — one golfer per section, scrolled top to bottom.** Replaces the
  compressed multi-player grid that scaled everything down to cram four players
  onto one non-scrolling screen. Now every card spans the full width with large
  score steppers, big `1·2·3·4` putt buttons, and full-width `HIT / MISS`
  toggles for FIR, GIR, Sand and Up-&-down — built for speed, visibility and
  touch accuracy in bright sunlight and one-handed play, never for information
  density. There is **no horizontal scrolling** and nothing to pinch, zoom or
  hunt for. Every per-hole interaction (score, putts, FIR, GIR, sand, penalties,
  up-&-downs, BBB awards, pop strokes, Wolf picks) lives on the card; read-only
  match/bet status is tucked into a per-card **"Matches & bets"** disclosure
  (collapsed by default, with a strokes-total glance) plus the full **Games**
  sheet, so match visualization never competes with score entry. The old
  ResizeObserver auto-scaling engine and its `sz`/`narrow` scaling props are
  gone.
- **The whole EGT money model is now flat stakes — no per-point or per-unit
  settlement anywhere, across the app and the SportsCenter broadcast.** Every
  cash game pays a flat `$5` (Rounds-tab editable per game):
  - **BBB, The Nines, Wolf and the individual Stableford (R6)** each pay the
    **winner `$5` from every other player** — so the winner nets `$15` in a
    foursome; a tie for first splits the pot. (Was: BBB/Nines `$1`/point, Wolf
    `$2`/unit.)
  - **Four-ball (R2) and 2v2 aggregate Stableford (R4)** — the **winning team
    takes `$5` off each opponent** (each winner `+$10`, each loser `−$10` in a
    2v2), a single flat result with no Nassau segments. (Was: team Nassau at
    `$5`/point across front/back/overall.)
  - **Individual Nassau side matches** are unchanged — settled per segment
    (front 1 · back 1 · overall 2 units), so a `$2` Nassau is `$2` front / `$2`
    back / `$4` overall; a halved segment pays nothing. Stakes set per match.
  - New money defaults `wolfWinner`, `fourballWinner`, `teamStablefordWinner`,
    `stablefordWinner` (all `$5`); `bbbNinesWinner` reused for R1/R5 BBB and R1
    Nines. Removed `bbbNinesPerPointDiff`, `wolfPerUnit`, `skinsAnte`, `ctpLd`.
- **Skins are removed everywhere** — no skins money on any round, no skins
  tracker in scoring, no Skins King race on the broadcast, and the **Skins King
  season award and the total-skins tiebreaker are gone** (per-player Cup ceiling
  drops from 35 to 33; five season awards remain). The internal net-stroke
  allocation that Pass-the-Money and net-birdie stats rely on is unchanged.
- **No CTP or Long Drive** — both are removed from the money engine, the seed
  side games, and the SportsCenter feed.
- **Pass-the-Money is now a `$5` bill** (was `$20`); the `$1`-per-3-putt pot and
  net-birdie steal are unchanged.
- Tests updated across the board (flat winner/team settlements, tie splits,
  no skins/CTP/LD money, the 33-point ceiling, the recovered flat stakes on the
  broadcast) and `dist/` rebuilt.

### Fixed
- The money engine falls back to the baseline flat stakes when a persisted model
  predates a defaults key, so a stale/rehydrated install can never compute
  `NaN` (team rounds) or `$0` (winner games) money.
- The SportsCenter broadcast now recovers an overridden **R2 four-ball** stake
  (it rides on the synthetic team match inside the Nassau format, not the
  top-level stake).

## [1.8.2] — 2026-07-21

### Fixed
- **EGT Cup rounds finalized on one device now show as submitted on every
  device.** The tournament store (entered scores, side-game events, and the
  `finalized` list that drives standings + money) had only ever lived in each
  device's `localStorage`, so a round scored and finalized ("submitted") on a
  phone did not appear as submitted — and its scores were missing — when the
  Cup was opened on the web. The native scorer already streams each EGT round's
  hole scores to Firestore; the new **`EgtSync`** module pulls those synced
  rounds into the local store (merging scores non-destructively, plus BBB/Wolf
  events, overlay match play, and per-round stake overrides) and reconciles the
  finalized list, then stays live while both devices are open. Finalizing or
  reopening a round now also broadcasts an explicit `egtFinalized` flag on the
  round's doc, so the "submitted" state propagates immediately — even before
  all 18 holes are entered — and a reopen propagates too.
- **EGT SportsCenter honors the same explicit finalize flag.** The broadcast
  already derived "submitted" from score completeness; it now also respects an
  explicit finalize/reopen from the Cup screen, so the TV, the app, and every
  device agree on which rounds have been submitted (and therefore on the
  standings, money, and champion).

### Changed
- `EgtBridge` split its native→EGT translation into `mergeNativeScores`
  (non-destructive) and `bridgeEvents`, so the cross-device pull can replay a
  synced round without wiping holes entered elsewhere; the finalize path keeps
  the original authoritative-overwrite `bridge`. `RoundSyncService` gained
  `writeMeta`, `fetchDocs`, and `subscribeDocs` for targeted per-round doc I/O
  by deterministic sync code (no full-collection scan).

## [1.8.1] — 2026-07-18

### Fixed
- **SportsCenter's NEW TRIP LEADER breaking-news card no longer shows raw
  float points.** When the EGT Cup lead changed hands on a split award (e.g. a
  3-way champion tie worth ⅓ pt each), the alert printed the unformatted value
  (`0.6666666666666666 pts`) — the one points display that bypassed the v1.7.3
  `fmtPoints` sweep, and it fires exactly when everyone is watching the TV.
  Regression test drives a real Cup lead change through `diffAlerts`.
- **Printable packet scorecard headings now use friendly format names** —
  "R5 · Cascades — Bingo-Bango-Bongo + Match Play" instead of the machine key
  `bingoBangoBongo+matchPlay`. All six rounds mapped; test asserts no raw
  camelCase keys print.
- **R4 cart/pairings rationale corrected in the seed** — the Rounds-tab text
  still claimed R4 used "new teams" and completed the cart rotation, which
  stopped being true when John+TJ became the fixed R2/R4 partnership. It now
  says the R2 teams repeat by request and that the rotation completes in R5
  (which matches the actual cart schedule).
- Removed a dead, duplicated allowance table from `egtImporter.js`
  (`GAME_RULES` is the single source of truth).

## [1.8.0] — 2026-07-17

### Changed
- **The EGT Cup season awards grew from 4 to 6 and the per-player ceiling is
  now 35** (24 round points + 11 award points). This entry documents the award
  restructuring that shipped without a release: **Par King** (most pars, 2 pts)
  and **Bogey God** (most bogeys, 1 pt) are real point-bearing season awards
  for the high-handicap crew, and **Birdie King now settles on GROSS birdies
  for 4 pts** — the net version is demoted to an honorary bragging-rights
  race. Skins King (2), Flat Stick (1) and Iron Man (1) are unchanged. The
  engine, the app's "Where the points come from" table, Award Races,
  printable packet and the SportsCenter broadcast all read the same seed
  `pointsConfig`, and the Max column recomputes on every boot, so installs
  that already have a persisted model pick up the new ceiling automatically.

### Added
- **BIRDIE KING RACE page on the SportsCenter rotation ranks gross birdies**
  — the paying award (4 pts) had no full-screen leaders page while the
  honorary net race did. The net page stays, retitled
  `BIRDIE KING RACE (NET · HONORARY)`.
- **Trip packing checklist** (`packlist.html`) — a standalone, offline-first
  checklist page (add items, check them off, saved to the phone). Now also in
  the service-worker precache so it genuinely works offline on first launch.

### Fixed
- Season-award settlement regression test: Par King, Bogey God and Birdie
  King (gross) are asserted to pay 2/1/4 to the right stat leaders at final
  settlement, so the award values can't silently drift from the seed config.

## [1.7.6] — 2026-07-16

### Added
- **Cup-points explanations on the EGT screen** — every round now says exactly
  what it's worth and how. Each round card gets a chip in its header
  (`🏆 4 CUP PTS · TEAM 2v2`, `INDIVIDUAL`, or `💵 CASH ONLY` for R1) and an
  expanded **Cup Points** section with an itemized how-to-earn-them table
  (e.g. R2: front-9 match 1 · back-9 match 1 · 18-hole match 2). The Standings
  tab adds a **"Where the 30 points come from"** table: R2 Ballyowen 4 (team),
  R3 Wild Turkey 4 (individual), R4 Crystal Springs 5 (team), R5 Cascades 4
  (individual), R6 Black Bear 7 (individual) = 24, plus the four season awards
  (Skins King 2 · Birdie King 2 · Flat Stick 1 · Iron Man 1) = 30 max per
  player. All values come from `EgtPoints.roundPointsBreakdown` /
  `seasonAwardsBreakdown`, which read the seed's `pointsConfig` with the same
  fallbacks the scoring engine uses — a test asserts the displayed maxes match
  the engine's `ROUND_MAX_POINTS` and reproduce the 30-point ceiling, so the
  explanation can never drift from what actually gets scored.

### Fixed
- **R5 no longer shows stale "Teams"** — the Rounds-tab card displayed the
  seed's leftover R5 team entries even though R5 is an individual round
  (full-18 BBB + round-robin match play); the Teams row now only renders on
  rounds where teams actually compete for points (R2, R4).

## [1.7.5] — 2026-07-14

### Removed
- **Pairings tab on the EGT Cup screen** — the fairness-analysis breakdown
  (partner/opponent/cart frequency matrices, handicap-balance table, scorecard
  stats) served its purpose as proof the schedule was balanced and is no
  longer needed day-to-day. Cart pairings and the per-round rationale remain
  on each round's card in the Rounds tab; the written analysis lives on in
  `docs/EGT_PAIRINGS.md`.

## [1.7.4] — 2026-07-14

### Fixed
- **SportsCenter per-round payout cards ignored the tournament engine** — the
  money segment builder read `live.money.byRound`, a key the money engine has
  never produced (its per-round map is `live.money.rounds`), so a finalized
  round's "PAYOUTS" card always fell back to the native live-payout
  calculation. For R1 (Minerals, flat/stakes-only) that fallback silently
  dropped The Nines money entirely — the native scorer has no Nines engine —
  and on any round it bypassed CTP/LD prizes and recovered stake overrides, so
  the per-round cards could contradict the running bankroll shown right next
  to them. The card now reads the engine's authoritative per-round totals.
- **Home screen version label** — stuck at v1.7.2 through the 1.7.3 release;
  now tracks the app version again.

### Added
- Regression tests locking in the R1 money rule: R1 is excluded from EGT Cup
  points/standings, but its stakes (BBB, The Nines, skins, side matches) are
  always captured in the overall money tracker — in the engine, the running
  bankroll, and the broadcast's per-round payout card.

## [1.7.3] — 2026-07-14

### Fixed
- **EGT match-play pops were auto-filled from the wrong handicap basis** — the
  Rounds-tab match editor fed the native players' raw handicap **index** into
  its stroke auto-fill, while the tournament rule (and the engine's own
  fallback) is the **course-handicap** difference off the low within each
  match. Because auto-filled pops count as manual overrides everywhere, a
  configured R5 match would settle a stroke short in the app, the native
  tracker, and the SportsCenter alike (e.g. John v TJ at Cascades: 10 pops
  instead of the correct 11 — CH 17 v 28). The editor now receives each
  player's derived course handicap for that round, and a one-time repair
  (`EgtBridge.repairMatchPops`) clears any stored, untouched legacy auto-fill
  so the engine live-derives the correct CH-based pops; manually edited pop
  holes are preserved.
- **SportsCenter never ran the final-night season settlement** — the broadcast
  rebuilt the Cup from synced rounds but called the engine without the
  `season` flag, so once R6 finished the TV standings were missing all four
  season awards (Skins King 2 · Birdie King 2 · Flat Stick 1 · Iron Man 1 —
  up to 6 of a player's 36 points) and the money board omitted the
  Pass-the-Money settlement. The broadcast could crown a different champion
  than the app at the moment it mattered most. It now passes
  `season: finalized.includes('R6')` exactly like the app (both the live pass
  and the climber/dropper comparison pass).
- **Raw float points on screens** — a split champion pool (e.g. a 3-way R5 BBB
  tie at 2 pts) produced `0.6666666666666666 pts` rendered verbatim in the app
  standings table, the printable packet, the Bottom Line ticker, and the
  SportsCenter standings/player cards. All points displays now go through one
  shared `EgtStandings.fmtPoints` (2-decimal, trailing-zero-free: `0.67`).
- **Flat Stick could be "won" with zero tracked putts** — a player who entered
  gross scores but never recorded putts totaled 0 putts and beat everyone who
  actually tracked. `trackedStats`/`seasonStats` now count `puttHoles`, and
  both the season-award engine and the Award Races tab treat a player with no
  recorded putt holes as ineligible (shown as —) rather than the leader.
- **TV pre-round cards for R4/R5/R6 showed mangled formats with no rules** —
  the seed's `fourBallAggregateStableford`, `bingoBangoBongo+matchPlay`, and
  `championshipSingles+stableford` keys had no `FORMAT_RULES` entry, so the
  "TODAY'S GAME" stage fell back to auto-labels like "Bingo Bango
  Bongo+match Play" over an empty rules panel, and the schedule ticker printed
  the raw key. All three now have proper labels + one-line rules, and the
  schedule segment uses the resolved label.

### Changed
- **EGT cart pairings — John & TJ prioritized** — the trip's riding assignments
  now pair John and TJ together as much as possible: **4 of the 6 rounds** (R1,
  R2, R4, R6), including Ballyowen (R2) and Crystal Springs (R4), where they
  also partner as a team. Every pair still shares a cart at least once — the
  R3 (John+Brian / TJ+Mike) and R5 (John+Mike / Brian+TJ) cart splits cover the
  remaining four pairings, which is the maximum John+TJ ridealong achievable
  while keeping cart coverage complete. R2 teams flip to John+TJ vs Brian+Mike
  (still a balanced 36-vs-41 course-handicap split) so carts follow teams.
  Updated in `fixtures/egt-2026-seed.json` (source of truth), the regenerated
  seed, the Rounds/Pairings tabs, the SportsCenter engine, and the pairings
  docs. Fairness tests updated for the new R2 teams.

## [1.7.2] — 2026-07-13

### Fixed
- **EGT screen input focus loss** — the EGT Cup screen defined its tab and card
  renderers as inline component types, so every keystroke re-created them and
  React remounted the whole subtree: score-grid and stake inputs dropped focus
  after each digit, and the Individual Matches editor lost its in-progress
  state on any parent re-render (e.g. a toast). Renderers are now invoked as
  plain functions and the stateful pieces (SI editor, stake input) are hoisted
  to module scope — typing flows normally and match setup survives re-renders.
- **Stake fields snapped back to the default when cleared** — the dollar inputs
  on the Rounds tab committed on every keystroke, so emptying a field instantly
  re-showed the tournament default and you couldn't retype a new rate. The
  input now buffers its text while focused and still commits each keystroke.
- **SportsCenter ran money at default stakes** — the broadcast rebuilds the Cup
  from synced rounds with a fresh state, so stake overrides set on the Rounds
  tab never reached its money engine and the TV bankroll could disagree with
  the app. The provider now recovers each round's rates from the synced format
  objects (skins ante, BBB/Nines, Wolf unit, Nassau per-point) — broadcast and
  app money now settle at the same stakes. Regression tests added.

### Added
- **Award Races on the Standings tab** — live leaders for all four season award
  categories (Skins King, Birdie King net, Flat Stick, Iron Man) with the full
  field's numbers, so every Cup category has a visible leader before final
  settlement — not just points, stats and money.
- **Skins King & Birdie King pages on SportsCenter** — the post-round stat
  rotation now includes both season-award races alongside scoring average,
  fairways, greens, putts, birdies and money, completing the "leaders in every
  category" set on the TV.
- **SportsCenter keyboard remote** — F fullscreen · Space pause/resume ticker ·
  → / N next stage module · +/− ticker speed · A/P/L/S broadcast mode, with an
  on-screen key legend and a pause/resume button in the hover controls. Built
  for the laptop-connected-to-TV setup where the keyboard is the remote.
- **SportsCenter screen wake lock** — the page now requests a screen wake lock
  (re-acquired when the tab regains visibility) so the laptop driving the TV
  doesn't sleep mid-broadcast.
- **Landscape-aware app chrome** — on short viewports (rotated phones) the top
  NavBar and bottom tab nav compact themselves (~40px reclaimed), keeping the
  scorer and EGT screens usable in landscape.

## [1.7.1] — 2026-07-10

### Fixed
- **Stale schedule on the Rounds tab** — the EGT Cup screen loaded a persisted
  tournament model from localStorage and never refreshed schedule metadata, so
  installs that already had saved state kept the old tee times and showed no
  cart pairings. Boot now always re-imports the embedded seed (idempotent —
  entered scores/events/finalized/stakes are preserved, only the derived model
  is swapped), so tee times, cart pairings, teams and formats always reflect the
  seed. Cache version bumped so the fix ships past the service worker.

### Changed
- **Crystal Springs (R4) tee time corrected** to **7:50 AM** (was 7:30 AM).
- **Cart partners shown at a glance** on each round card (collapsed header), so
  riding partners are visible before starting the round.

## [1.7.0] — 2026-07-10

### Added
- **Official pairings, from a single source of truth** — every round in
  `fixtures/egt-2026-seed.json` (regenerated into `egtSeedData.js` via
  `scripts/gen-seed.mjs`) now carries structured `teeTimes`, cart pairings, and
  a tournament-director rationale, so tee times and pairings propagate to the
  Rounds page, EGT SportsCenter, Bottom Line ticker and printable packet with no
  stale references.
- **Pairings tab** on the EGT Cup screen — a fairness analysis proving the
  schedule is balanced: partner, opponent and cart-partner frequency matrices,
  per-round handicap-balance table, and a scorecard (teammate/opponent spread,
  cart coverage, average team Δ). Every player rides with all three others; both
  team rounds are balanced (avg team Δ 5 course-handicap strokes).
- **Individual Nassau matches on every round (R1–R6)** — the pre-round match
  overlay, previously R5-only, is now available on all rounds. Layer optional
  1v1/2v2 Nassau matches on top of any format; they reuse the existing Nassau
  engine and share the same hole-by-hole scores (no duplicate entry).

### Changed
- **Official tee times updated** for all six rounds (Minerals 10:00 AM / 12:36
  PM, Ballyowen 7:30 AM, Wild Turkey 1:45 PM, Crystal Springs 7:30 AM, Cascades
  2:02 PM / 4:08 PM, Black Bear 8:36 AM).
- **R2 teams rebalanced** to John + Mike vs Brian + TJ (from John + Brian vs
  TJ + Mike) to avoid a low-low super-team; with R5 now individual, both team
  rounds (R2, R4) use a balanced split.
- **Rounds page redesign** — consistent card structure, tee-time chips, a
  Pairings & Logistics block (tee time, teams, carts, rationale), and unified
  section headers, typography and spacing across mobile and desktop.

## [1.6.3] — 2026-07-10

### Added
- **EGT SportsCenter** — `/bottomline` is now a full broadcast production, not
  just a ticker. A mode-driven full-screen stage sits above the Bottom Line and
  transitions automatically from the live data:
  - **Pre-Round** — rotating cards for the next round: course, tee time, day,
    format + rules, team matchups / pairings, the full schedule, previous-round
    winner, and a first-tee card.
  - **Live** — leaderboard, running bankroll, per-format standings (Skins,
    Nassau, Wolf, BBB, Stableford, Pass the Money…), who's on the course and on
    which hole, and Cup standings — all updating in realtime.
  - **Post-Round (SportsCenter)** — Cup standings with movement arrows + money,
    a round recap (low round, best net, low front/back), Player of the Round,
    format winners, rotating player cards, and a cycling stats dashboard
    (scoring average, fairways, greens, putts per round, birdies, money).
  - Auto mode selection with manual override controls (AUTO / PRE / LIVE / POST),
    ticker-speed and fullscreen controls, and a live clock.
- **Player identities & logos** — each golfer's logo and alias is integrated
  throughout: Brian = Birdman, John = Gadget, TJ = Straight T, Mike = H7. Logos
  appear on leaderboards, standings, player cards, recaps, winner reveals, and
  pairings.

### Fixed
- **Ticker rendering** — the Bottom Line strip now stays filled two viewports
  past the right edge with consistent gap spacing and font-load–gated
  measurement, so items enter fully laid out from the right with no gaps,
  pop-in, clipped text, or jitter, and the loop is seamless.

## [1.6.2] — 2026-07-09

### Changed
- **R5 match play is now configurable before the round** — no more default
  round-robin. Set the matches on the Rounds tab with the native Nassau match
  config (up to six, any mix of 1v1 and 2v2, any players — e.g. one 2v2, or a
  player in just two 1v1s), each with its own stake. Strokes auto-fill from
  course handicaps (off the low within each match); tapping holes in a match
  overrides them. The scorer, Cup points (best match record), money, and the
  head-to-head tiebreaker all honor exactly the configured matches; with no
  matches set, R5 runs BBB + skins only.

## [1.6.1] — 2026-07-09

### Changed
- **EGT Bottom Line is now EGT-only.** The ticker aggregates data exclusively
  from EGT Cup tournament rounds (R1–R6). Casual rounds and other golf trips
  synced to the same project are ignored entirely — every leaderboard, money
  card, stat, format board, fun fact, record, spotlight, and alert is sourced
  only from scores/stats entered in EGT rounds.
- **Money is single-source-of-truth.** The running bankroll comes straight from
  the EGT tournament engine (cumulative over finalized rounds, including
  Pass-the-Money and stake overrides), topped up with live native money for any
  EGT round still in progress — so per-round cards can never contradict it. The
  redundant "EGT CUP MONEY" card was removed (the bankroll already reflects it),
  and a "Current Last Place" card was added from the Cup standings.
- Dropped the generic trip-leaderboard code path from the provider.

### Fixed
- Publish `bottomline.html` to GitHub Pages (the deploy step's file allowlist
  was missing it, so `/bottomline` 404'd).

## [1.6.0] — 2026-07-09

### Added
- **EGT Bottom Line (`/bottomline`)** — an always-on, ESPN-style broadcast
  ticker built for TV displays (75"–98", landscape). A full-width strip
  scrolls right-to-left forever with no visible seam, telling the story of
  the trip: live round status (course, current hole, who's on the course),
  round and trip leaderboards (gross/net/nines/high-low), live money for
  every format (Skins, Nassau, Wolf, BBB, Stableford, Pass the Money,
  Tee Ball), every stat the stats engine computes (putts, 1-/3-putts,
  FIR/GIR, sand saves, penalties, scrambling, par-3/4/5 scoring, longest
  drive/putt), EGT Cup standings + money + award races, fun stats (streaks,
  blowups, recoveries, worst hole), the record book, player spotlights, and
  the round schedule.
- **Realtime, no refreshes** — the page subscribes to the same Firestore/RTDB
  sync the app writes; scores entered anywhere appear on the ticker within
  seconds, changed cards flash, and breaking-news alert cards (birdies,
  eagles, doubles, meltdowns, lead changes, new records, money swings) are
  injected into the stream and flashed on a banner.
- **`BottomLineProvider`** — a modular, pure data provider that aggregates
  every scoring model into one unified feed through a registry of segment
  builders (new stats added later surface automatically); the ticker renders
  from cached computed facts and only recomputes when data changes.
- Ticker niceties: category rotation (money → leaderboard → stats → format →
  fun → spotlight → records → …), configurable speed, fullscreen toggle,
  pause-on-hover (desktop only), 60 fps transform-only animation.

## [1.5.4] — 2026-07-07

### Changed
- **R5 (Cascades) format replaced:** scramble/alternate shot are gone. R5 now
  plays full-round Bingo-Bango-Bongo (gross, 3 pts/hole) plus round-robin 1v1
  match play — every player plays every other, the higher handicap receives the
  CH difference on the lowest-index holes, and each match settles Nassau-style
  (front/back/overall) via the existing Nassau engine in the scorer.
- R5 Cup points: BBB champion 2 + match-play champion 2 (best overall record,
  ties split) — the round stays worth 4 toward the 30-point ceiling.
- R5 stakes editable on the Rounds tab (BBB per point, match play per point,
  skins); head-to-head tiebreaker now counts R5 match wins.

## [1.5.3] — 2026-07-07

### Added
- **Tourney stats on the standings page** — cumulative putts, fairways hit, and
  greens in regulation across R2–R6 (live from entered scores; R1 excluded),
  shown on the EGT standings tab and in the printable packet.

## [1.5.2] — 2026-07-06

The EGT Cup is worth 30 points, period — Tuesday (R1) is fully out.

### Fixed
- **Max column showed stale seed ceilings (36) on installed devices** — the
  adjustment only ran on fresh imports. It now recomputes from first principles
  on every rehydrate, so all four players show a 30-point max.
- **R1 no longer leaks into the tourney:** its skins are out of the Skins King
  award and the total-skins tiebreaker, and its stats are out of the season
  awards (Birdie King / Flat Stick / Iron Man). R1 stays cash-only.
- Standings tab notes the scoring basis: 30 pts max, R2–R6 count.

## [1.5.1] — 2026-07-05

Scoring density + EGT stakes/standings tweaks.

### Changed
- **Removed Sand-save tracking** from the scorer, round setup, defaults, and the
  stats screen.
- **Denser player tiles** — no per-tile scrolling, a smaller "HOLE #" header, and
  a lower size floor so four players fit on one screen (built for one-handed use).
- **Editable per-format stakes** on the EGT Rounds tab, flowing into the money
  engine and the native scorer's format trackers.
- **R1 (Minerals) is now flat / stakes-only** — it pays out cash but awards no
  EGT Cup points and is excluded from the standings (Max caps at 30).

## [1.5.0] — 2026-07-05

The EGT Cup tournament feature.

### Added
- **EGT 2026 Cup** (new bottom-nav tab): imports the trip definition and runs
  live scoring across six mixed-format rounds (Bingo-Bango-Bongo, The Nines,
  four-ball match + Nassau, Wolf, team & individual Stableford, scramble,
  alternate shot, championship singles, gross/net skins), with an EGT Cup
  points engine, a zero-sum money engine, standings with night-over-night
  deltas, a stroke-index entry flow, and a printable packet.
- **Score EGT rounds in the native scorer** — each round opens PlayPal's real
  hole-by-hole scorer, prefilled from the seed, with its format engines
  triggering (BBB, Nassau, Wolf, Stableford, Skins); results bridge into the
  Cup standings on finalize.
- Rounds tab shows a plain-English format note per round and each game's
  strokes/pops with its basis.

## [1.4.0] — 2026-07-03

App Store submission readiness: a fully self-contained bundle and a
committed native iOS project. No user-facing feature changes.

### Added
- **Native iOS project (`ios/`)** generated with Capacitor 8 (Swift Package
  Manager — no CocoaPods step on the Mac): bundle id `com.playpal.golf`,
  marketing version 1.4.0, brand app icon and launch screen installed,
  `PrivacyInfo.xcprivacy` privacy manifest registered in the build, light
  status bar over the brand header, and `ITSAppUsesNonExemptEncryption=false`
  so uploads skip the export-compliance questionnaire.
- `npm run build:www` assembles the self-contained `www/` bundle that ships
  inside the binary; `npm run ios:sync` builds + syncs it into the iOS
  project. `assets-native/` holds the 1024px icon / 2732px splash sources.

### Changed
- **All runtime dependencies are now vendored** (`vendor/`): React 18.3.1,
  Firebase 11.9.0 compat SDKs, the QR library, and Plus Jakarta Sans
  (latin + latin-ext woff2). The app makes **zero CDN requests** — faster
  first load, no third-party availability risk, full offline capability,
  and no remote-URL shell inside the iOS binary (App Review guideline 4.2
  mitigation). The only external traffic left is Firebase's own data API.
- Service worker precaches the vendored files and drops the now-unused CDN
  cache branch.
- `docs/IOS_APP_STORE_PATH.md` rewritten as a beginner-grade, click-by-click
  submission guide matching the in-repo project;
  `APP_STORE_READINESS.md` re-scored (12 pass / 2 mitigated cautions / 1
  fail — the $99 Apple membership + Mac, which code cannot fix).


One-screen score entry. The in-round screen now always fits the viewport —
no scrolling, ever — and scales itself to the player count and device.

### Added
- **Adaptive one-screen score entry:** the player grid is measured live
  (ResizeObserver) and every control scales to fit — 1-column and generous
  for 2–3 players, a 2×2 grid for 4+, side-by-side columns in landscape.
  The scale respects readability floors and accounts for stat-row wrapping
  and wolf/PTM warning strips, so nothing clips on small phones.
- **Always-visible primary action** in a new bottom action bar: it walks the
  golfer through the round — ENTER SCORES → PICK WOLF / ENTER PUTTS →
  NEXT HOLE → FINISH ROUND — with EXIT, CARD and GAMES utilities beside it.
- **Game trackers bottom sheet:** trackers (and the round tracker) moved
  from an inline drawer into a slide-up sheet, keeping the score surface
  clean. Escape key and backdrop tap close it.
- **Offline banner:** a slim status strip appears under the nav when the
  connection drops, and live scores are re-pushed automatically when it
  returns.
- **Micro-interactions:** score-change pop animation, sheet slide-up and
  fade-in transitions (all respect `prefers-reduced-motion`), and light
  haptic feedback on score/putt taps where the platform supports it.

### Changed
- Hole header is more compact (and denser still in landscape); the
  SCORECARD chip moved into the bottom action bar as CARD.
- Putts / FIR / GIR / penalties / sand / up-&-downs now share one wrapping
  stat row; the pop pill joined the format-pills row.
- The manual POP toggle only renders when a game format that uses pops is
  active — casual stat-only rounds no longer show it.
- Font payload trimmed to Plus Jakarta Sans only (Inter and Playfair
  Display were fallback-only and never rendered); added `preconnect` hints
  for all CDNs used at startup.

### Fixed
- Score entry (and the wolf picker) now respect the bottom safe-area inset,
  so controls no longer sit under the iPhone home indicator.
- Hole-progress dots are real buttons — keyboard-accessible with proper
  labels; stepper, putt and stat buttons gained descriptive `aria-label`s.
- The sync pulse indicator no longer overlaps the Dynamic Island.

## [1.2.0] — 2026-06-12

Customizable stat tracking, a more compact score-entry tile, and proper
iPhone safe-area handling.

### Added
- **Select Stats to Track** (pre-round, in Setup): choose exactly which
  per-hole stats to record. Putts, FIR and GIR are pre-selected; Penalties,
  Sand saves and Up & downs are opt-in. The selection is remembered locally
  and pre-populated for future rounds.
- `StatsService` stat registry (`STAT_TRACK_DEFS`) plus pure
  `normalizeStatsConfig`/`resolveRoundStatsConfig` helpers — new stats can be
  added in one place without touching the selection screen or in-round
  plumbing. Covered by new unit tests.

### Changed
- In-round stat tracking is now driven by the per-round selection: disabled
  stats are hidden entirely. Putts remain available automatically when a
  Pass-the-Money game is in play (its holder is derived from putts).
- **Compact player tile:** PUTTS, FIR and GIR now share a single horizontal
  row (wrapping only on very narrow screens) with tighter controls; opt-in
  short-game stats sit in a compact second row. Header and stepper padding
  trimmed — more players fit on screen, less scrolling hole-to-hole.
- **iPhone safe area:** the top navigation now respects
  `env(safe-area-inset-*)` so the logo, QR button and sync code always clear
  the Dynamic Island / status bar; side insets keep the top and bottom bars
  clear of the notch in landscape. No hardcoded device offsets.

### Removed
- Dead `PlayerCard.jsx` (superseded by `PlayerScoreCard` in `ScoreEntry`;
  it had no references) and its build/script/cache entries.

### Migration / compatibility
- Saved rounds are unaffected: the stat data model (FIR/GIR/extra arrays) is
  unchanged; the new config only governs which inputs render. Rounds saved
  before this release fall back correctly — legacy `trackStats` rounds show
  all stats, trip rounds show Putts/FIR/GIR, others show Putts.

## [1.1.1] — 2026-06-12

Hardening release: closes every remaining OPEN item from `AUDIT.md` that is
fixable in software (H7, H8, M3, M4, M6, M7).

### Fixed
- **Stale live-score listener race (AUDIT H8):** live payloads are tagged
  with the round id; receivers drop payloads for other rounds and late
  callbacks after unsubscribe. v1.1.0 clients (untagged payloads) still sync.
- **Trip dashboard full-collection read (AUDIT H7):** trip rounds are now
  fetched with a `where('round.tripId','==',tripId)` Firestore query
  (automatic single-field index; legacy scan kept only as an error fallback).
- **Unencoded URL parts (AUDIT M3):** Venmo handles and recipient emails are
  `encodeURIComponent`-ed in the Venmo deep/web links and scorecard `mailto:`.

### Added (accessibility, AUDIT M4)
- Programmatic form labels: `Label htmlFor` + input `id`s on the player
  profile, join-code, and course-builder forms; `aria-label` on tee-set,
  hole-grid, trip, search, allowance, override, and compare inputs.
- Dialog semantics: `Modal`/`QRModal` announce as `role="dialog"` with
  `aria-modal`, accessible names, Esc-to-close, and labeled close buttons.
- Player-form hand/color pickers are real `<button>`s with `aria-pressed`.

### Removed
- Vestigial `sync-config.js` (config truth lives in `index.html`) (AUDIT M7).
- Last two stray `console.log`s in the round sync service (AUDIT M6).

## [1.1.0] — 2026-06-12

The match-format release: a modular scoring engine, real handicaps, richer
courses, stats, and sharing — while keeping every existing money game intact.

### Added
- **MatchEngine** (`components/matchEngine.js`): registry-based scoring engine
  with 22 formats — Stroke Play, Individual Gross/Net, Match Play, Four Ball,
  Best/Better Ball, Scramble, 2-Person Scramble, Shamble, Alternate Shot,
  Foursomes, Chapman (Pinehurst), Team Gross/Net, Stableford, Quota, Skins,
  Nassau, Sixes, Wolf, Bingo Bango Bongo. New formats register without
  touching existing logic.
- **Setup → Games catalog**: category picker, handicap-balanced auto teams
  (serpentine), gross/net toggle, per-format allowance defaults
  (USGA-recommended), strokes-off-low-ball, per-game manual handicap overrides.
- **HandicapService**: WHS Course Handicap (HI × Slope ÷ 113 + CR − Par),
  playing-handicap allowances, stroke-index allocation (9/18, wraps, plus
  handicaps), net scoring, and a provider interface for handicap-network sync
  that degrades gracefully when not configured (↻ SYNC in profiles).
- **CourseService**: multi-tee course model with per-tee rating/slope/yardages,
  9- and 18-hole layouts, course favorites (⭐), recently-played cache, and a
  provider interface for external course databases.
- **Course builder**: 9/18-hole toggle and additional tee sets.
- **Live game trackers**: generic standings cards for every engine game
  (match status like “2 UP thru 7 · dormie”, skins carryovers, quota pace).
- **Stat tracking rounds**: penalties, sand saves, up-and-downs per hole
  (FIR/GIR now available outside trips), synced live like scores.
- **Stats screen (📈 tab)**: scoring average/trend, distribution, par-3/4/5
  splits, FIR/GIR/putts, personal bests, lifetime totals, and hole-by-hole
  round comparison — built from locally saved rounds.
- **Profiles**: preferred tees, dominant hand, home course, career view.
- **Round history**: “Round In Progress” resume card on Home; completed
  rounds feed Stats automatically.
- **Sharing**: 📤 share-sheet text scorecard (standings, game results, money)
  and ⬇️ hole-by-hole CSV export on the Summary screen.
- **Summary**: final game results with winners, gross + net totals.
- Versioned localStorage migrations (`pp_schema_version` → 2) that preserve
  all existing data; 60 new unit/integration tests (suite: 85).
- Docs: `docs/FEATURE_GAP_ANALYSIS.md`, `docs/DEVELOPER_GUIDE.md`,
  `docs/USER_GUIDE.md`, `docs/SCHEMA_CHANGES.md`.

### Changed
- Score entry, trackers, and finish flow now size off the course's hole count
  (9-hole rounds fully supported).
- Setup step 3 renamed “Games & Formats”; legacy formats grouped under
  “Money Games”; rounds can start with engine games, money games, or both.
- Service-worker cache bumped to v1.1.0 with the new modules precached.

## [1.0.0] — 2026-06-11

First production release candidate.

### Added
- Build pipeline (`npm run build`): esbuild precompiles all JSX → `dist/`; in-browser Babel removed.
- Error boundary with branded recovery screen.
- PWA support: `manifest.webmanifest`, service worker with offline shell, full iOS home-screen icon set.
- Test suite (`npm test`): 18 tests incl. the 25-assertion engine regression harness, now enforced in CI.
- GitHub Actions: CI (build/test/audit/secret-scan), GitHub Pages deploy, tag-driven releases; Dependabot; issue/PR templates.
- Legal & support pages (`privacy.html`, `terms.html`, `support.html`) linked from the Home screen footer.
- Hardened Firebase security rules (`firebase/`) with deploy instructions.
- App Store submission kit (`appstore/`, `docs/IOS_APP_STORE_PATH.md`).

### Changed
- React 18.3.1 development builds → production builds, SRI hashes verified against npm tarballs.
- Bottom tab bar: accessible buttons (`aria-label`, `aria-current`), higher label contrast, 48px targets.
- Viewport allows pinch zoom; safe-area aware (`viewport-fit=cover`).
- `join.html`: round codes sanitized, console logging removed, restyled to brand palette.
- Course setup copy now reflects manual entry as the add-course path.

### Removed
- Broken "Scan Scorecard" feature (made a credential-less browser call to a paid API; could never work safely client-side).
- `mockup-homepage.html` (dead design mockup).

### Fixed
- Unguarded `JSON.parse` of stored player profiles could crash-loop the app on corrupted storage.
- Global animations now respect `prefers-reduced-motion`.
