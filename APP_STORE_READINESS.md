# App Store Readiness

> **This file is superseded by [`APP_STORE_AUDIT.md`](APP_STORE_AUDIT.md).**
> Go there for the current verdict, the submission checklist, the Firebase plan,
> what to do with the data already in the project, and the pricing model.

## Why this file changed

Up to v1.15.0 this document said:

> **Verdict: ✅ ALL CODE-SIDE WORK IS DONE … the submission path is a
> ~30-minute copy-paste on a Mac.**

That was wrong, and it is worth recording why so the claim is not made again.
The 23 August 2026 audit found three things that would each have stopped a
submission on their own:

1. **Twenty of the twenty-eight game formats settled no money at all.** Every
   MatchEngine format — stroke play, match play, four-ball, the scrambles,
   Stableford, Quota, Nassau, skins — computed a winner and then moved $0.
2. **The GHIN button reported "Scores posted to GHIN ✓" having posted nothing.**
   App Review guideline 2.3.1.
3. **All synced data lived in one global namespace.** Every user of a public
   build would have read and overwritten every other user's player profiles,
   including their email addresses and Venmo handles.

Plus: nine-hole rounds were scored as eighteen-hole rounds, stroke pops were
manual so half the games silently scored gross, the money on screen did not
match the money in the Venmo request, and the round email omitted the same
twenty formats.

All of the above is fixed in v1.16.0. The lesson for this file: "code-side work
is done" is a claim that needs a test suite and a browser behind it, not a
checklist of guidelines with ticks next to them.

## Current status

See [`APP_STORE_AUDIT.md` §7 Still open](APP_STORE_AUDIT.md#7-still-open). In
short — the remaining blockers are money ($99/year), hardware (a Mac with Xcode)
and five minutes of `firebase deploy`. None of them are code.
