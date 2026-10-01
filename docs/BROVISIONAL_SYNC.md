# The Brovisional handicap auto-sync (1.22.0)

[The Brovisional](https://brovisional.vercel.app) is an unofficial handicap app.
It is **not** GHIN, and it is separate from the PlayPal Index, which stays
tracking only. When a round is saved, PlayPal posts each player's
hole-by-hole gross to The Brovisional. The Brovisional decides what counts and
answers with each player's differential and Brovisional index.

The receiver contract is `BROVISIONAL_INGEST.md` (OUHS, final 2026-10-01). It
is summarized below.

## Flow

```
handleSaveRound → RoundSyncService.saveRound (Firestore round doc)
   └─ on success: BrovisionalService.onRoundSaved(groupId, round)    [client, fire-and-forget]
        └─ POST /api/handicap/post {groupId, roundId}  + Firebase ID token
             └─ lib/brovisional.mjs syncRound():
                  re-read the round doc with Admin (client card data is never trusted)
                  → buildCard() → HMAC-sign → POST brovisional /api/ingest/playpal
                  → write round doc field `brovisional`
Summary "THE BROVISIONAL" block ← local cache + round doc `brovisional`
Daily Vercel Cron → GET /api/cron/brovisional → runCron() retries failed/never-sent/unlinked
```

- **Edit hook:** the hook sits in `RoundSyncService.saveRound`. Every save of a
  finished round (a doc with `round.holeScores`) re-posts it, including the
  first save and any re-save after an edit. The receiver is idempotent per
  roundId + player id, so a re-post comes back `updated`. In-progress writes
  (no `holeScores`) and EGT Cup rounds never post.
- **EGT Cup rounds** are skipped with `egt_round`. They were imported into
  The Brovisional separately (`egt2026:<R>:<player>`), so posting them under
  the round id would double-count.
- **Throttle:** a second call for the same round within 5 s returns the
  stored result without re-sending. Retry and the cron bypass this.

## Endpoints (PlayPal)

| Endpoint | Auth | Body | Result |
|---|---|---|---|
| `POST /api/handicap/post` | Firebase ID token (anonymous OK) | `{groupId, roundId, retry?}` | `{status, brovisional}`; 409 if the round isn't finished |
| `POST /api/handicap/delete` | as above | `{groupId, roundId}` | `{status:'deleted'\|'failed'\|'disabled'}` |
| `GET /api/cron/brovisional` | `Authorization: Bearer $CRON_SECRET` (sent by Vercel Cron) | — | `{eligible, attempted, results}` |

**Group membership** works the same way as `firebase/firestore.rules`.
Holding the group code (about 130 bits) is the capability. So "in the group"
means the caller is signed in and the round exists in that group's collection
(`g_<gid>_rounds`, LEGACY = `playpal_rounds`). For delete, when the doc is
already gone, the caller must be linked to the group through the account:
`users/{uid}.groupId == gid` or `group_meta/{gid}.ownerUid == uid`.
LEGACY rounds are as open as their rules: any signed-in user who knows a
LEGACY sync code. The server only ever re-sends Firestore data, idempotently.

**Disabled:** if `PLAYPAL_INGEST_SECRET` is unset, every endpoint returns
`{status:'disabled'}` and nothing is read, sent or written. The client then
hides the summary block (`pp_brov_disabled`, re-checked on every save).

**Cron:** `vercel.json` runs it daily at `0 10 * * *` (10:00 UTC, 6 AM ET;
Hobby allows daily). It fails closed: 503 when `CRON_SECRET` is unset, 401 on
a wrong bearer. Each run:

- scans every `g_*_rounds` collection plus `playpal_rounds` for docs saved in
  the last 14 days, newest first, at most 25 rounds per run;
- retries `failed` rounds that are retryable or pending a delete, until 8
  attempts;
- sends rounds with no result yet, but only when `round.postToHandicap ===
  true`. 1.22+ clients always write that field, so the cron never back-fills
  history that was imported by hand. Checked against the full Firestore dump:
  0 of 222 existing docs are eligible;
- re-checks `partial`/`skipped` rounds that have an `unlinked` player, at most
  once every 20 h, in case an admin has linked them since.

## Signing

- `X-PlayPal-Timestamp`: Unix **seconds**.
- `X-PlayPal-Signature`: `sha256=` + hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`).
- The body is stringified once, then signed and sent as those exact bytes.
  DELETE has an empty body, so the signed string is `"${timestamp}."`.
- The receiver allows a 300 s window.

## Card (export shape of `playpal-full-history.json`)

`roundId` (sync code), `egtRoundId` (null), `playpalRoundId` (`round.id`),
`date` (YYYY-MM-DD in America/New_York, taken from `round.date`, then the
round start, then `savedAt`), `courseId`, `course` (≤100), `location` (≤120),
`tee {name ≤40, rating, slope, par, yards}`, `front9`/`back9` (null, since
PlayPal stores no nine ratings), `holesCount`, `holes [{hole 1..n, par, si}]`,
`format` (the same label as saved_rounds),
`players [{id, sourcePlayerIds, name, scores, gross, holesPlayed, out/in (18), toPar (complete), post}]`.

- `scores` has one entry per hole: an integer from 1 to 20, or `null` for an
  unplayed hole. Anything else is also sent as null, never clamped. The 9/18
  rules are applied by The Brovisional: exactly 1–9 or 10–18 complete gives a
  9-hole score, 18 complete gives 18, anything else is `incomplete`.
- `rating`/`slope` are **null** unless real. The rules mirror
  `IndexService.teeRating`: `rated:false`, missing values, or a custom course's
  72/113 placeholder all give null, and The Brovisional skips the round with
  `missing_rating`.
- Cards that can never validate are skipped locally without sending:
  `unsupported_holes` (not 9 or 18 holes), `no_players`, `too_many_players` (>50).
- Checked against the real data: the 11 non-EGT export cards rebuilt from the
  Firestore dump match the export field for field. The only difference is
  that `format` uses labels. All 11 pass the final-spec validation in the mock
  receiver.

## Player-id mapping (`lib/brovisionalPlayers.mjs`, server only)

| id | Golfer | Known PlayPal roster ids (`sourcePlayerIds`) |
|---|---|---|
| `john` | John Christadore | john, p1, p1781226599386, p1790599477726 |
| `tj` | TJ Quimby | p1777172757933, p1790599525424, tj |
| `mike` | Mike Clark | mike, p1776970421535, p1790599587462 |
| `brian` | Brian Plick | brian, p1790599546071, p2 |
| `james` | James Markey | p1780574112997 |
| `rob` | Rob Kraly | p1780574134170 |

These are the ids from `playpal-full-history.json`, the same ids The
Brovisional's history import used (`playpal:<roundId>:<player>`). That keeps a
re-post of an imported round matched to the same golfer.

1. Only **JD's groups** map to these ids: `LEGACY` and
   `CB4BYS07373NJPF63PBJ7F803M`, plus any ids in env `PLAYPAL_BROV_GROUPS`
   (comma-separated). Roster ids like `p1`/`p2` are generic, so a stranger's
   `p1` must never become John.
2. Within those groups, a player maps by roster id (any known alias), then by
   exact full name (case and spacing ignored). The card then carries all of
   that golfer's aliases as `sourcePlayerIds`, because The Brovisional matches
   a link on `id` or on any `sourcePlayerId`.
3. Everyone else gets a stable opaque id, `pp-<sha256(groupId)[0..8]>-<rosterId>`,
   with `sourcePlayerIds: []`. The id is stable across rounds, unique across
   groups, and doesn't reveal the group code. These players come back
   `unlinked` until an admin links that id in The Brovisional. The next re-post
   (a re-save, Retry, or the daily cron re-check) then posts them.

To add a golfer, append a row with their PlayPal roster ids (Home → player).
Brovisional admins should link canonical ids or `pp-…` ids, **never a bare
`p1`/`p2`**.

## Round doc field `brovisional`

```js
{ status: 'posted'|'partial'|'failed'|'skipped',   // 'disabled' is never written
  reason,            // round-level skip: opted_out | deleted | egt_round | unsupported_holes | no_players
  attempts, lastAttemptAt, postedAt, lastError, retryable, httpStatus, pendingDelete, deletedAt, source,
  players: { [rosterId]: { status, reason, brovisionalId, group, holes, gross, adjustedGross, differential, index, groups? } } }
```

- `posted`: every player who wasn't opted out was posted or updated.
- `partial`: some players posted, others were skipped (unlinked, incomplete,
  missing_rating, duplicate, rejected).
- `skipped`: nobody posted.
- `failed`: the HTTP call failed. 5xx and network errors are retryable;
  401 and 400 are not.
- A player linked in several Brovisional groups comes back once per group.
  They count as posted if any group posted, and every entry is kept in `groups`.

## Toggles

- **Round:** `round.postToHandicap` is set in round setup ("Post to
  handicap"). It is on by default and off for `SHARED_SCORE_FORMATS` (scramble,
  scramble2, alternateShot, foursomes, chapman), where partners share one
  ball. Markey Match, best ball and shamble are entered per player, so they
  stay on. A crew that typed one team number, like YK7209, can turn it off.
  The setting can be changed on the summary. Turning it off after a post
  sends DELETE for the round.
- **Player:** `round.handicapPost[rosterId] = false` is sent as `post:false`.
  The Brovisional skips that player (`opted_out`) and deletes their score for
  the round.

## Client (`components/brovisionalService.js`)

- No secrets and no id mapping.
- Failed posts go into the `pp_brov_queue` queue. Backoff is 1 min × 2^(n−1),
  capped at 6 h. The queue is drained on app launch (4 s after mount) and
  whenever the device comes back online. After 6 failures the client gives up
  and the daily cron takes over.
- Display reasons:
  - `unlinked`: "not linked in The Brovisional yet"
  - `incomplete`: "incomplete round"
  - `missing_rating`: "no course rating"
  - `opted_out`: "opted out"
  - `duplicate of existing score …`: "already in The Brovisional from another source"
  - `rejected: …`: "rejected by The Brovisional"
  - The informational "9-hole score held until 54 holes" is shown next to
    the posted score.

## Testing locally

`tests/brovisional.test.mjs` uses `tests/helpers/mockBrovisional.mjs`, a real
HTTP receiver that verifies the HMAC and the 300 s window and implements the
final-spec rules. For a manual check:

```bash
PLAYPAL_INGEST_SECRET=throwaway node scripts/brovisional-mock.mjs 8787
# then run the API with BROVISIONAL_INGEST_URL=http://127.0.0.1:8787/api/ingest/playpal
```
