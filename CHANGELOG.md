# Changelog

All notable changes to PlayPal. Format follows [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

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
