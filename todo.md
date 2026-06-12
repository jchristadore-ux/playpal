# TODO — v1.1.1 hardening pass (open AUDIT.md items)

Work the milestones in order. Each milestone = code + rebuild dist + tests
green + AUDIT/report status flip + progress.md update, committed together.

- [x] M1 — Analyze project, write concrete plan (this file + progress.md)
- [ ] M2 — Fix AUDIT **H8**: stale live-score listener race
  - `components/ScoreEntry.jsx` (~line 660–711): add `roundId: round.id` to
    the live payload in `scheduleCloudWrite`; in the `subscribeRound`
    callback, ignore payloads where `livePayload.roundId` exists and
    ≠ `round.id` (presence-checked so v1.1.0 clients without the field keep
    syncing); add an effect-scoped `cancelled` guard so late callbacks after
    cleanup are dropped.
- [ ] M3 — Fix AUDIT **H7**: trip dashboard full-collection read
  - `index.html` `GolfTripSyncService.fetchTripRounds` (~line 424): replace
    full `.get()` + client filter with
    `.where('round.tripId','==',tripId)` (single-field auto-index, no
    composite needed; keep client-side `savedAt` sort). On query error, fall
    back to the legacy full scan so the dashboard never regresses.
- [ ] M4 — Fix AUDIT **M3** + **M7** + M6 leftovers
  - `components/Summary.jsx` `openVenmo` (~line 177): `encodeURIComponent`
    the venmo handle in deep link + web link; encode recipient emails in the
    `mailto:` build (~line 326).
  - Delete vestigial `sync-config.js` (nothing references it).
  - Remove the two stray `console.log`s in `index.html` RoundSyncService
    (subscribe/unsubscribe noise).
- [ ] M5 — Accessibility (AUDIT **M4** / ACCESSIBILITY_REPORT 🔴 form-labels
  row + 🟡 modal row)
  - `components/Shared.jsx`: `Label` accepts `htmlFor` (renders `<label>`);
    `Modal` gets `role="dialog"`, `aria-modal`, `aria-label={title}`, Esc to
    close.
  - Wire `id`/`htmlFor` (or `aria-label`) on the player-profile form
    (`Home.jsx` ~line 359 loop) and the course/trip forms in `Setup.jsx`.
- [ ] M6 — Release pass v1.1.1
  - Bump: `package.json`, `index.html` `?v=` query strings, `sw.js`
    `CACHE_VERSION` + PRECACHE versions, `Home.jsx:323` footer version.
  - `CHANGELOG.md` 1.1.1 entry; flip fixed rows in `AUDIT.md`; update
    `ACCESSIBILITY_REPORT.md` remaining-gaps table.
  - `npm run build` + full `npm test`; commit; push
    `claude/fervent-planck-alq54v`; open draft PR.

## Out of scope (deliberate, keep documented)

- AUDIT M2 (stringify-keyed memos) — accepted at current scale.
- AUDIT M8 (edit-mode postMessage panel) — kept deliberately.
- Clickable-div conversion across all content screens (a11y 🔴 row 1) — large
  refactor; remains inventoried in ACCESSIBILITY_REPORT.md.
- Dynamic Type / rem migration, focus trap — inventoried, not this pass.
