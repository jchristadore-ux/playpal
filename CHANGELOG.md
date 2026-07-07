# Changelog

All notable changes to PlayPal. Format follows [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

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
