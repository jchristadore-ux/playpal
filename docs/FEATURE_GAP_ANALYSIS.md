# PlayPal Feature Gap Analysis & Roadmap

**Date:** June 2026
**Scope:** Make PlayPal the best app for a foursome / small group of golfers to
organize and score rounds together. Tournament management, league management,
registration, brackets, and event administration are **explicitly out of scope**.

This analysis studies the *publicly observable* capabilities of Squabbit Golf
(marketing site, app-store listings, public help pages) as market inspiration.
No proprietary code, UI, branding, artwork, or protected content was copied —
every capability below is recreated as an **original implementation** designed
for PlayPal's existing architecture and design language.

---

## 1. Competitive snapshot (publicly observable)

Squabbit positions itself as free tournament & league software. The publicly
described capabilities relevant to PlayPal's small-group mission:

| Capability (public description) | Notes |
|---|---|
| 35+ game formats (stroke play, stableford, scramble, shamble, best ball, match play, Nassau, Wolf, skins, alternate shot, Chapman, quota, sixes, bingo-bango-bongo, low/high ball, Ryder-Cup style team events) | Formats are pre-configured before the round and scored live |
| Course database (30,000+ courses, 30+ countries), user-addable and editable courses | Auto-loads par / stroke index / yardage per tee |
| WHS/GHIN handicap linking, USGA course-handicap calculation from slope & rating, per-round handicap percentages (allowances), relative handicaps | Handicap refresh on app open; manual override supported |
| Pre-configurable scorecards, auto tee-time/matchup generation | Tee-time scheduling is a league feature (out of scope for PlayPal) |
| Live leaderboards with real-time updates | PlayPal already has live cross-device sync |
| GPS yardages, shot measurement, satellite imagery, watch apps | Native-app capability |
| Real-time fun stats (par streaks, blow-up holes, par-3 performance) | Social/engagement layer |
| CSV export of scorecards and results | Sharing/records |
| Group chat & photos | Social layer |
| Tournaments, leagues, season points, registration | **Out of scope for PlayPal by design** |

Sources: squabbitgolf.com (home + help pages), Apple App Store and Google Play
listings (public descriptions), third-party reviews.

---

## 2. Where PlayPal stands today

PlayPal (this repo) is a React PWA with:

* **8 money formats** (Wolf, Nassau multi-match, Skins, Stableford 5/3/2/1,
  Pass the Money, Bingo Bango Bongo, Tee Ball, Markey Match) with automatic
  payout math and zero-sum settlement.
* **Excellent score entry**: stepper + keypad, hole dots, putt tracking,
  pop (stroke) pills, live cross-device sync via Firestore, QR join codes.
* **Static course list** (~28 hard-coded courses + custom course builder with a
  single tee set), 18-hole only.
* **Players** with name/GHIN#/handicap/venmo/color — handicaps are manual
  numbers used only by Nassau pops & Markey pops.
* **Trips**: multi-round dashboards with aggregate stats (FIR/GIR/putts only in
  trip mode).
* **History**: last 20 round metas + local snapshots, read-only round viewer.

### Strengths to preserve
1. The score-entry UX (one screen, big targets, no accounts).
2. Real-money settlement (who pays whom) — rare among competitors.
3. Free-stack architecture (no backend code, anonymous auth, localStorage-first).
4. Per-file global-script architecture (`components/*.js[x]` → `dist/`, no bundler).

---

## 3. Gap analysis & recommended implementation

| # | Capability | PlayPal today | Gap | Recommendation (original implementation) |
|---|---|---|---|---|
| G1 | Broad format library | 8 money games hard-wired through `gameUtils.js` + bespoke UI per format | No stroke/match/team formats; adding a format touches 5+ files | **`MatchEngine`** (`components/matchEngine.js`): a registry of pure format definitions (`register(def)`), each declaring metadata (players, team shape, scoring basis, handicap allowance) and a pure `compute(ctx)` → normalized standings. New formats = one registered object + tests; zero changes to UI or existing formats. Ships 22 formats (see §4). |
| G2 | Match creation flow | 3-step wizard (players → course → formats) | No team builder, no net/gross choice, no allowances | Extend Setup step 3 with a **Games catalog** driven by `MatchEngine.list()` metadata: category chips, team auto-assign + tap-to-move UI, gross/net toggle, allowance % (defaulted per format), optional stake. Legacy money games remain untouched alongside. |
| G3 | Course database | Hard-coded array + custom builder (1 tee, 18 holes) | No search provider, favorites, recents, multi-tee, 9-hole | **`CourseService`**: provider interface (`registerProvider`) with built-in local provider (bundled + custom courses); favorites (⭐) and recently-played cache; normalized course model with `tees[]` (name/rating/slope/yardages) and `holeCount` 9/18. External APIs (e.g. a courses REST API) plug in behind the same interface later — no UI change required. |
| G4 | Handicaps | Manual index per player; pops only for Nassau/Markey | No course handicap, playing handicap, allowances, net scoring, GHIN sync | **`HandicapService`**: WHS math — Course Handicap = HI × (Slope ÷ 113) + (CR − Par); Playing Handicap = CH × allowance; stroke allocation by stroke index (supports >18 and plus handicaps); relative ("off low ball") mode; per-player manual overrides per round. **Provider interface** for GHIN-style sync — ships with a stub that gracefully reports "unavailable" (no credentials in a public client); index stays editable manually. |
| G5 | Score entry | Best-in-class gross entry | No net display, no team scores, no 9-hole rounds | Net strokes ride the existing pop-pill pattern (engine computes from playing handicap); team/game standings render in the existing **Game Trackers drawer** via one generic `GameStandings` component fed by `MatchEngine.compute()`; `ScoreEntry` generalized from fixed 18 to `course.holeCount`. |
| G6 | Round statistics | Putts; FIR/GIR in trip mode only | No penalties, sand saves, up/downs, no dashboards or trends | Optional **Stat tracking** toggle per round (FIR/GIR/penalties/sand/up-down per hole, one synced `extraStats` map). **`StatsService`** computes per-round and lifetime aggregates (scoring avg, distribution, par-3/4/5 splits, FIR%, GIR%, putts/round, streaks, personal bests). New **Stats screen** with dashboards, trends, and round-vs-round compare. |
| G7 | Player profiles | name/GHIN/handicap/venmo/color | No preferred tee, hand, home course, favorite formats, career stats | Extend the player object (backward compatible) + edit UI; **`ProfileService`** derives playing history, averages, and personal bests from round history. Profiles continue to sync through the existing `players` RTDB path — no schema migration server-side. |
| G8 | History & sharing | Recent list + read-only viewer | No resume card, compare, export, or share | **`RoundHistoryService`** (list/resume/compare from local snapshots) + **`SharingService`** (formatted text scorecard, CSV export, Web Share API with clipboard fallback). Share/Export buttons on the Summary screen; Resume card on Home. |
| G9 | Live leaderboard | Per-format trackers | Already strong | Engine standings join the same drawer; no regression. |
| G10 | GPS / maps | None | Native capability; PWA geolocation is battery-hungry and imprecise for yardages | **Defer.** Document as roadmap item R6: hole yardages by tee (shipped via multi-tee model) cover the highest-value need; GPS rangefinder needs the iOS wrapper (see `docs/IOS_APP_STORE_PATH.md`). |
| G11 | Group chat / photos | None | Social layer, server cost & moderation burden | **Defer deliberately** — keeps PlayPal account-free and free-stack. |
| G12 | Tournaments / leagues | None | — | **Out of scope by product decision.** |

---

## 4. Format library shipped by `MatchEngine` (Phase 2)

Individual: **Stroke Play (gross)**, **Individual Net**, **Stableford**
(WHS points, net-aware), **Quota** (36 − playing handicap, 1/2/4/8 points),
**Skins** (gross/net, carryover toggle), **Bingo Bango Bongo** (engine port),
**Wolf** (engine port).

Head-to-head / team match: **Match Play** (1v1 or teams, X&Y closeouts),
**Nassau** (front/back/overall), **Four Ball** (2v2 best ball match),
**Sixes** (rotating 2v2 every 6 holes, 4 players).

Team score-per-hole: **Scramble**, **2-Person Scramble**, **Shamble**,
**Best Ball / Better Ball** (1–4 count-best-balls), **Alternate Shot /
Foursomes**, **Chapman (Pinehurst)**, **Team Gross**, **Team Net**.

Aliases (Better Ball ≡ Best Ball variant, Foursomes ≡ Alternate Shot,
Individual Gross ≡ Stroke Play) are first-class registry entries so users find
the name they know — they share one implementation each.

Default handicap allowances follow published USGA/WHS recommendations
(e.g. individual 100 %, four-ball 85 %, foursomes 50 % combined, scramble
35/15 %, Chapman 60/40) and are editable per game.

---

## 5. Prioritized implementation roadmap

**Now (this change set)**
1. `MatchEngine` + 22 formats, pure & unit-tested (G1).
2. `HandicapService` with WHS math + provider stub (G4).
3. `CourseService` with tees, 9/18, favorites/recents, providers (G3).
4. Setup games catalog + team builder; tee & stat-tracking selection (G2).
5. ScoreEntry: engine standings drawer, net pills, 9-hole support, extra stats (G5, G6).
6. Summary: game results + winner determination + share/export (G8).
7. `StatsService` + Stats screen with trends & compare (G6).
8. `ProfileService` + extended profile editor (G7).
9. `RoundHistoryService` + `SharingService` + Home resume card (G8).
10. Versioned localStorage migrations preserving all existing data.
11. Tests for every service; developer + user documentation.

**Next (R-series, future PRs)**
* R1: Per-player tee selection within one round (engine already accepts per-player handicap inputs).
* R2: Remote course provider (community course API) behind `CourseService.registerProvider`.
* R3: Real GHIN provider once an official, permitted integration path exists (UI + storage already in place).
* R4: Scorecard image (canvas) export for richer sharing.
* R5: Presses for engine Nassau / match play.
* R6: GPS rangefinder in the native iOS wrapper.
* R7: Apple Watch score entry (native wrapper).

---

## 6. Non-goals (explicit)

* Tournament/league/registration/bracket features of any kind.
* Accounts, payments, ads, server-side code.
* Copying any Squabbit UI, artwork, wording, or code.
