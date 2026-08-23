# PlayPal — App Store Submission Audit

**Audited:** 23 August 2026 · **Against:** v1.15.0 · **Delivered:** v1.16.0
**Verdict:** the app was **not** submittable. Two findings would have failed
review outright and a third would have been a privacy incident on day one. All
three are fixed. What remains is money, hardware and paperwork — see
[§7 Still open](#7-still-open).

The previous readiness report claimed *"ALL CODE-SIDE WORK IS DONE."* That was
wrong. This document replaces it.

---

## 1. What was actually broken

Ranked by consequence, not by effort.

### 1.1 · Twenty of the twenty-eight game formats paid out nothing — **fixed**

PlayPal has two parallel game systems:

| System | Formats | Money before | Money now |
|---|---|---|---|
| **Money games** (`FORMAT_INFO`) | Wolf, Nassau, Stableford, Pass the Money, Skins, Bingo Bango Bongo, Tee Ball, Markey Match | ✅ settled | ✅ settled |
| **Match formats** (`MatchEngine`) | Stroke Play, Individual Gross/Net, Stableford, Quota, Match Play, Four Ball, Nassau, Skins, Sixes, Best/Better Ball, Shamble, Team Gross/Net, Scramble, 2-Person Scramble, Alternate Shot, Foursomes, Chapman, Wolf, Bingo Bango Bongo | ❌ **nothing** | ✅ settled |

The Match formats computed standings, a winner and a status line — and then no
money changed hands. There was no stake input in Setup, `calcAllPayouts` never
saw `round.games`, and the one place a stake was read (`game.config.stake` in
`GameStandingsCard`) was never written by anything.

The practical effect: a group could set up a $20 four-ball, play eighteen holes,
and reach a results screen that showed the match won 3&2 and **$0 owed**.

**Fixed.** Each format now declares how a stake settles:

| Mode | Rule | Formats |
|---|---|---|
| `pot` | Losing players ante the stake; winners split the pot | stroke play, net, Stableford, Quota, and all team formats |
| `unit` | Per skin/point, settled pairwise against every other player | Skins, Sixes, Wolf, Bingo Bango Bongo |
| `match` | The losing side pays the stake per player; a halved match pays nobody | Match Play, Four Ball |
| `nassau` | Front, back and overall settle independently; overall counts double | Nassau |

Setup gained a stake control per game (with a **NO MONEY** option), and
`calcRoundPayouts(round, data)` now settles the money games *and* the engine
games in one call. Every one of the 19 concrete formats is verified zero-sum.

### 1.2 · The GHIN button lied — **fixed** *(App Review 2.3.1)*

```js
const postToGhin = () => {
  setGhinStep('logging');
  setTimeout(() => { setGhinStep('posted'); showToast('Scores posted to GHIN ✓'); }, 2200);
};
```

That was the entire implementation. It waited 2.2 seconds, said *"Scores posted
to GHIN ✓"*, listed every player with a green tick beside their GHIN number, and
posted nothing anywhere. Guideline 2.3.1 ("Performance — Accurate Metadata")
covers exactly this, and a reviewer with a GHIN number would have caught it in
under a minute.

**Fixed.** Replaced with an honest export that copies each player's hole-by-hole
scores plus tees, rating and slope for pasting into GHIN's own score entry, and
says plainly that PlayPal cannot post on your behalf — there is no public GHIN
API a client app may use.

### 1.3 · Every user of a public build shared one database — **fixed** *(5.1.1, 5.1.2)*

All synced data lived at fixed global paths:

```
RTDB       players/ · courses/ · saved_rounds/
Firestore  playpal_rounds/{CODE} · golf_trips/{id}
```

with rules that allowed any signed-in client to read and write them. Anonymous
auth is free to anyone who downloads the app, so on the App Store:

- Every install would read **every other user's player profiles**, including the
  email addresses and Venmo handles stored on them.
- `PlayerSyncService.save()` calls `players.set(obj)` — a **full overwrite**. The
  next user to edit a profile would wipe the entire global roster.
- The repo's own `firebase/README.md` said so: *"anyone who runs the app is
  inside the trust boundary… If you ever open the app to strangers, per-user
  auth and ownership rules would be the next step."*

**Fixed.** Every synced path is namespaced by a **group** — a 26-character
(~130-bit) random code generated on the device on first run, shared with your
playing partners as a code or embedded in a join link. Home gained a *Your Group*
panel: show it, copy it, paste someone else's to join theirs, or start a fresh
empty one. Firestore and RTDB rules were rewritten to match, and never permit
listing groups — only addressing one whose id you already hold, the same model
the round share codes already used.

> **This is not per-user authentication.** Knowing the group code is what grants
> access. For a friend-group app with no sign-in that is a reasonable and
> defensible model, and it is an enormous improvement on one shared bucket. If
> PlayPal ever needs real ownership boundaries, Sign in with Apple plus
> uid-scoped rules is the next step — and it would change the privacy story from
> "no account" to "account", so it is a product decision, not a patch.

### 1.4 · Nine-hole rounds were scored as eighteen-hole rounds — **fixed**

A nine-hole Nassau settled **front nine, back nine and overall against the same
nine holes** — three bets for one match, paying 3× what it should. Skins, Wolf,
Bingo Bango Bongo, Tee Ball and Markey Match all iterated a hardcoded `i < 18`.
Every calculation now sizes off the course being played, and a nine-hole Markey
Match no longer spawns a turn press it never reaches.

### 1.5 · Stroke pops were manual, so half the games scored gross — **fixed**

Skins, Stableford, Pass the Money and Bingo Bango Bongo all read `popFlags`, a
per-hole boolean the golfer had to tap on the right holes for the right players.
Nobody does that mid-round, so in practice those games settled **gross** while
the app presented them as handicapped.

**Fixed.** Strokes are now allocated at round setup from each player's course
handicap — slope, rating and the chosen tee, off the low ball — and seeded into
the round. Every hole stays editable. Related fixes:

- Pop flags now carry a **stroke count**, not a yes/no, so a 27-handicap off
  scratch gets a second stroke on the hardest nine. Rounds saved before this
  still read correctly (`true` = one stroke).
- **Nassau auto-pops now work for 2v2**, not only singles, and come off course
  handicaps rather than raw index difference. The pop grid sizes to the layout.
- **Plus handicaps work.** `getHoleStrokes(-2, …)` returned −1 on *every* hole,
  giving a plus-2 eighteen strokes back instead of two. The profile form also
  clamped the index at zero, making a plus handicap impossible to enter.

### 1.6 · The money on screen was not the money in the Venmo request — **fixed**

Every figure was rendered `toFixed(0)` while `openVenmo` charged `toFixed(2)`. A
$12.50 debt displayed as **$13** and requested **$12.50**. With three-way splits,
2v2 Nassau halves and per-skin carryovers, non-integer amounts are routine. All
money now goes through one formatter that shows cents only when there are cents,
and the settlement is rounded to cents while staying zero-sum.

### 1.7 · The round email left out half the round and was silently truncated — **fixed**

`buildScorecardEmail` covered the money games only — the twenty MatchEngine
formats appeared nowhere. It also produced a fixed-width 18-hole grid that pushed
the `mailto:` URL past ~2,500 encoded characters; iOS Mail truncates around 2 KB
without telling anyone, so the money section fell off the bottom.

**Fixed.** One report builder (`SharingService.roundReport`) now drives the
screen, the email and the share sheet, covering leaderboard, net scores, every
game with its result *and* its money, per-player stats, the whole-round ledger,
the settle-up list and Venmo links — with the hole-by-hole grid in the full
version. The mail body is assembled at the richest level that fits the budget,
the money always survives the trim, and the complete card goes to the clipboard
to be pasted in. Players missing an email address or a Venmo handle are now named
on screen instead of being silently dropped.

### 1.8 · Solo rounds were impossible; landscape was untested — **fixed**

Setup required two players. There is now a **Just the scorecard** option (no
game, no money) that works with one, money games that need a field are disabled
with the reason shown, and the scorer re-lays-out on rotation, uses columns when
there is width, and shrinks cards on short screens.

Verified in a real browser: **16 combinations** — 1/2/3/4 players × phone
portrait, phone landscape, small landscape, tablet portrait — no page errors, no
horizontal overflow, no control pushed off-screen.

### 1.9 · Smaller things found and fixed

- Wolf with two players paid the wolf a phantom win: the "field" summed to zero,
  which always beat the wolf's score. Too small a field is now a push.
- A custom course added **offline vanished from the list** — the screen waited
  for Firebase to echo it back instead of using what it had just saved.
- `roundMeta.formats` threw on an unknown format type and omitted engine games.
- Profiles without a GHIN number rendered "GHIN undefined".

---

## 2. What to do with the app data currently in there

Three separate piles. They need three different decisions.

### 2.1 · The four seeded player profiles — **removed**

The app shipped with:

```js
{ name: 'Thatch Adams', ghin: '1234567', email: 'tadams@gmail.com', venmo: 'thatch-adams', … }
```

…and three more. On a public build these read as real people's contact details,
and the first thing a new user would do is email a stranger their scorecard. A
fresh install now starts with an **empty roster** and prompts for the first
player. Nothing is lost for existing installs — their roster is in local storage
and in Firebase, not in this constant.

### 2.2 · The EGT 2026 Cup — **gated, and excluded from the public build**

`components/egt/egtSeedData.js` is 3,289 lines carrying four named individuals
(John, Brian, TJ, Mike), their handicaps, their hole-by-hole scores across six
rounds and the money between them. `icons/players/*.png` are their photographs.
The Cup was a permanent tab on the bottom nav.

That is one private group's tournament shipping to the public App Store under
four real people's names. Two changes:

1. **Gated.** The tab no longer appears on a fresh install. Devices that already
   hold Cup data keep it exactly as before, and tapping the version line on Home
   seven times unlocks it. Nothing is lost.
2. **Excluded from the release bundle.** `npm run build:www -- --public` (and
   `npm run ios:sync:public`) leaves the seed and the profile photos out of the
   binary entirely. The Cup *engine* is generic code and stays; without a seed
   there is simply no tournament to show.

> **Submit the public build.** `npm run ios:sync` still produces the full
> version — use it for the group's own TestFlight builds, not for the App Store.

**Residual:** `components/bottomLineProvider.js` still hardcodes the four names
and aliases for the SportsCenter broadcast. `bottomline.html` is not part of the
native bundle, so this is unreachable dead weight rather than a privacy exposure
— but if you want it gone, that file needs its roster moved into the seed too.

### 2.3 · The live Firebase data — **keep it, move it, then lock the old paths**

The `playpal-sync` project currently holds your group's real rounds, trips,
profiles and courses at the old unscoped paths. Do not delete it.

Existing installs adopt the reserved **`LEGACY`** group, whose paths *are* the old
unscoped ones, so the upgrade is invisible to your phones — everything keeps
working with no migration. New installs get their own group.

**Recommended sequence:**

| Step | What | Why |
|---|---|---|
| 1 | Deploy the new rules (§3) | Closes the hole before anyone else installs |
| 2 | Ship v1.16.0 to your group | Everyone lands on `LEGACY`, nothing changes for them |
| 3 | On one phone: Home → Your Group → **NEW GROUP**, copy the code, have the others **JOIN GROUP** with it | Moves your group off the legacy paths onto its own namespace |
| 4 | Re-add player profiles and any custom courses in the new group | Profiles and courses do not follow you across groups by design |
| 5 | Once nobody is on `LEGACY`: delete the root `players`, `courses`, `saved_rounds` nodes and the `playpal_rounds` / `golf_trips` collections, then delete the four legacy blocks from both rules files | Removes the last shared surface |

Step 3–4 costs one evening of retyping four profiles. Skipping it is survivable —
`LEGACY` is still walled off from every new install — but it leaves your group on
the one namespace that any pre-1.16 client could still reach.

**Round history does not move between groups.** Rounds already saved on a phone
stay on that phone. If you want the old rounds in the new group, keep a device on
`LEGACY` (or export them with the CSV button) before switching everyone.

### 2.4 · What each user can delete

Already supported, and now accurate in the privacy policy:

- **A profile** — open it in the app and tap Delete; removed from the synced group.
- **This device's link to everything** — Home → Your Group → **NEW GROUP**.
- **Everything local** — clear the app's website/app data.
- **Everything, everywhere** — email the address in `privacy.html`; 30 days.

---

## 3. Firebase

### 3.1 · What to deploy

Both rule files were rewritten. **Nothing else in this audit matters until these
are deployed** — the app's data is only as private as the rules allow.

```bash
cd firebase
npx firebase-tools login
npx firebase-tools use playpal-sync
npx firebase-tools deploy --only firestore:rules,database
```

Then confirm in the Console that **Firestore → Rules** and **Realtime Database →
Rules** show the new contents.

| Path | Who | Guard |
|---|---|---|
| RTDB `groups/{id}/players` · `courses` · `saved_rounds` | any signed-in client | `id` matches `^[0-9A-Z]{8,40}$`; group ids are ~130 bits |
| Firestore `g_{id}_rounds/{CODE}` | any signed-in client | `CODE` matches `^[A-Z0-9]{4,12}$`, doc under 50 fields |
| Firestore `g_{id}_trips/{id}` | any signed-in client | `id` matches `^trip_[0-9]+$` |
| The four legacy root paths | any signed-in client | temporary — delete after §2.3 step 5 |
| Everything else | nobody | — |

### 3.2 · Anonymous auth stays

Firebase Console → Authentication → Sign-in method → **Anonymous → Enabled**. This
is what keeps App Review guideline 4.8 (Sign in with Apple) out of scope: there
is no third-party login, so there is nothing Apple requires you to offer
alongside it.

### 3.3 · Cost

| Tier | Limit | Realistic use |
|---|---|---|
| **Spark (free)** | 1 GB RTDB storage, 10 GB/mo transfer; 50k Firestore reads/day, 20k writes/day, 1 GiB storage | A four-player round writes a debounced live-score document roughly every few seconds while scoring — call it ~500 writes and a few thousand reads per round per device. |

A single group is nowhere near the ceiling. **Spark stays free until roughly the
low hundreds of daily active groups.** The number that bites first is Firestore
*reads*, because every device watching a live round re-reads the document on each
change. If you get traction, the fix is not Blaze — it is moving live scores to
the Realtime Database (charged by bandwidth, not per operation), which is what
RTDB is for and where the player/course data already lives.

**Set a budget alert before launch:** Firebase Console → Usage and billing →
Details & settings → Modify plan. On Spark you cannot be billed, but you *can* be
throttled without warning; the alert is how you find out before your users do.

### 3.4 · What is still shared inside a group

By design, and stated in the privacy policy: everyone in a group sees the same
profiles, courses and rounds. Within a group, anyone holding a round's 6-character
share code can view that round. That is the sync feature working. It is a
statement about the *group*, not about the internet.

---

## 4. Everything else needed to submit

### 4.1 · Code and configuration — done in v1.16.0

- [x] No fabricated functionality (2.3.1) — GHIN posting replaced
- [x] Multi-tenant data isolation — groups + rules
- [x] No third-party personal data in the binary — roster emptied, Cup excluded
- [x] `Info.plist`: `UIRequiredDeviceCapabilities` **`armv7` → `arm64`** (no iOS 13+ device is 32-bit)
- [x] `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` for the scorecard photo picker
- [x] `ITSAppUsesNonExemptEncryption = false` (already present — HTTPS only, exempt)
- [x] `PrivacyInfo.xcprivacy` present
- [x] Portrait and landscape both declared and both working
- [x] Privacy policy, terms and support pages updated to match actual behaviour
- [x] Crash boundary, offline operation, all assets vendored (no CDN — 4.2)

### 4.2 · Outside this repository — your move

- [ ] **Apple Developer Program — $99/year.** Nothing in code substitutes for it.
- [ ] **A Mac with Xcode.** Building and signing an `.ipa` requires one. Steps in
      `docs/IOS_APP_STORE_PATH.md`; budget ~30 minutes.
- [ ] **Deploy the Firebase rules** (§3.1). Five minutes, and the single most
      important item on this page.
- [ ] **Enable GitHub Pages** (Settings → Pages → Source: GitHub Actions) so
      `privacy.html` and `support.html` have public HTTPS URLs to paste into App
      Store Connect. Both are required fields.
- [ ] **Exclude `recap/` from the Pages deploy** if you publish it — those 25
      pages are the same four people's names, scores and money on the open web.

### 4.3 · Build the binary

```bash
npm run ios:sync:public     # public bundle → www/ → Xcode project
open ios/App/App.xcworkspace
```

In Xcode: pick your team under Signing & Capabilities (Automatically manage
signing), set the version to 1.16.0, then Product → Archive → Distribute →
App Store Connect.

### 4.4 · App Store Connect

Copy from `appstore/APP_STORE_LISTING.md`. Update it first — the description
still says *"EIGHT GAMES"*, and the app now settles money on twenty-eight.

- **Name / subtitle / keywords / description / promo text** — from the listing pack
- **Support URL** → `https://<pages-domain>/support.html`
- **Privacy Policy URL** → `https://<pages-domain>/privacy.html`
- **Category** — Sports (primary), Utilities (secondary)
- **Age rating** — all "No" **except Simulated Gambling → Infrequent/Mild**
- **Privacy nutrition labels** — from `appstore/PRIVACY_NUTRITION_LABELS.md`.
  Still accurate after this pass, with one clarification worth knowing:
  **Photos → No** remains the correct answer. Apple's "collect" means transmitted
  off the device; a scorecard photo is displayed from local memory, never
  uploaded, never stored, and discarded on leaving the screen. The *permission
  strings* are required; the *label* is not.

### 4.5 · Screenshots (Simulator, free)

6.9" iPhone (1320 × 2868), four minimum. Suggested set, all of which now show
real behaviour:

1. **Live scoring** — four players, a pop showing on a card
2. **Payouts** — a money game and a match format side by side, both with money
3. **Settle up** — the net settlement with Venmo requests
4. **Add a course from a scorecard photo** — the photo above the entry grid

Add 13" iPad (2064 × 2752) only if you enable iPad support; otherwise mark the
app iPhone-only.

### 4.6 · Review notes — paste this

> PlayPal is a golf scorekeeping calculator. It records strokes and computes the
> arithmetic of traditional golf side games (Wolf, Nassau, Skins, match play,
> scrambles and others) for a group playing together.
>
> The app never holds, transfers or processes money. "Payout" figures are
> arithmetic on stakes the users enter themselves; any settlement between players
> happens privately between them. Where a player has saved a Venmo handle, the
> app can open a pre-filled request link in Venmo, which the user confirms inside
> Venmo. There are no purchases in the app.
>
> There is no account and no sign-in. Sync uses Firebase Anonymous Authentication
> and is scoped to a randomly generated group code held on the device, so data is
> visible only to the people that code is shared with. No data is sold, and
> nothing is used for tracking.
>
> The camera and photo-library permissions are used in one place: adding a golf
> course, where you may photograph its scorecard to read the numbers off while
> typing them in. The image is never uploaded or stored.

### 4.7 · The gambling question (5.3) — read this before you submit

This is the one guideline where PlayPal sits in a grey area, and it is worth
being deliberate rather than hopeful.

**Why it should pass:** the app is a calculator. It never holds funds, never
processes a payment, never takes a rake, and does not connect strangers. The
wagers are private arrangements between people standing on the same fairway —
the same thing a paper scorecard and a pencil does.

**Where the risk is:** the Venmo request links are the closest the app comes to
moving money, and a reviewer skimming the Results screen will see dollar amounts
next to a payment button.

**What to do:**
- Describe the app in review notes as a **scorekeeping calculator** (§4.6), never
  as a betting or wagering app.
- Set **Simulated Gambling: Infrequent/Mild** in the age rating questionnaire and
  accept Apple's computed rating (typically 12+, higher in some regions).
- Keep the disclaimer in `terms.html` — it already says PlayPal does not hold,
  transfer or process money.
- Keep the same wording in the App Store description. Contradicting your own
  review notes in the public listing is how this gets rejected.
- If rejected, the resolution path is almost always the description and the age
  rating, not the code.

### 4.8 · Minimum functionality (4.2)

Web-wrapper apps get extra scrutiny. The mitigations already in place: every
asset vendored inside the binary (no remote shell), full offline operation,
native-feel one-screen scoring, haptics, safe-area layout. This pass adds real
substance to the argument — the app now does the thing it claims to do, across
28 formats and 9- and 18-hole layouts. Residual risk cannot be engineered to
zero.

---

## 5. Pricing model

### 5.1 · The recommendation

**Ship free. Add one non-consumable in-app purchase — "PlayPal Pro", $9.99, a
one-time unlock — once you have users.**

Do not launch with it. Launch free, watch what people actually use, then put the
paywall where the value turned out to be.

### 5.2 · Why not the alternatives

| Model | Verdict | Why |
|---|---|---|
| **Paid up front** ($4.99) | ✗ | Golf side-game apps are a low-trust purchase. Nobody pays before they have seen it settle a round correctly, and you have no reviews yet. It also kills the group dynamic: your app is worth more when four people in a foursome have it, and a paywall stops three of them. |
| **Subscription** ($2.99/mo) | ✗ | Golf is seasonal, and a subscription for a scorecard reads as greedy. Expect high churn every October, chargebacks, and one-star reviews about the subscription rather than the app. Apple also scrutinises subscriptions that gate features rather than deliver ongoing service. |
| **Free, no monetisation** | ~ | Perfectly legitimate, and the right answer if this stays a tool for your group. It leaves nothing on the table only if nobody outside the group ever wants it. |
| **Free + one-time Pro unlock** | ✅ | Matches how the app is used: the free tier has to be genuinely good so a whole foursome installs it, and the person who organises the trips is the one who happily pays once. |
| **Ads** | ✗✗ | Would destroy the privacy story that currently makes this app easy to review, require an ATT prompt, and add a third-party SDK to a binary whose main defence under 4.2 is that it is entirely self-contained. |

### 5.3 · Where the line goes

**Free — everything a foursome needs on a Saturday:**
- Every one of the 28 game formats, with money
- 1–6 players, 9 or 18 holes, live sync across the group
- Post-round summary, email, Venmo requests
- Custom courses, scorecard photo import
- Full round history on the device

**Pro — $9.99 once, for the person who organises:**
- **Multi-round trips** — the trip dashboard, cumulative money across a trip,
  and trip awards
- **Season standings** — the tournament engine that already exists behind the
  EGT Cup gate, generalised so any group can run their own cup
- **Stats history** — trends, career numbers, round comparison
- **Export** — CSV and a printable recap book (the `recap/` generator already
  produces exactly this)

That split is deliberate: it never takes away the thing the group needs *during*
a round. The paywall sits on the things one organiser wants *between* rounds,
which is where willingness to pay actually lives — and it is unlocked once, per
Apple ID, family-shareable.

**Price it at $9.99, not $4.99.** This is bought by someone who spends $80 on a
green fee and $60 on side bets. $4.99 signals "toy"; $9.99 signals "tool" and
doubles the revenue per install for identical conversion at this price point.

### 5.4 · What it would take to build

Not in this pass — it is a product decision, not an audit finding. When you want it:

1. **StoreKit 2** via `@capacitor-community/in-app-purchases`, or a small native
   plugin. One non-consumable product id, e.g. `com.playpal.golf.pro`.
2. **Restore Purchases** is mandatory (guideline 3.1.1) — a button in the profile
   screen, non-negotiable.
3. A `ProService` mirroring `GroupService`: cache entitlement locally, verify on
   launch, **fail open** if verification cannot reach Apple. Never lock a paying
   golfer out of their trip dashboard because the clubhouse wifi is down.
4. Product page, price tier and the IAP review screenshot in App Store Connect.
5. Budget: about a day of work, plus a review cycle for the IAP itself.

### 5.5 · Realistic expectations

Be honest with yourself about the numbers. A niche golf utility with no marketing
does low hundreds of downloads in its first year. At a 3–5% conversion on $9.99,
that is **$60–$250 gross**, before Apple's 15% (Small Business Program) and
before the $99 developer fee.

**This does not pay for itself in year one.** Ship it because you want the app to
exist and because your group uses it every trip. Treat any revenue as
confirmation, not as a business case. The moment that changes is if a golf
community picks it up — and the free tier being genuinely complete is what makes
that possible.

---

## 6. Verification

Everything above was checked, not assumed.

**Automated — 259 tests, all passing** (`npm test`). 37 new in
`tests/moneyAudit.test.mjs`:
- Every MatchEngine format settles a stake and nets to zero
- Engine skins settles identically to the built-in skins game
- A halved match pays nobody; engine Nassau pays the overall double
- `calcRoundPayouts` = money games + engine games, and the parts sum to the whole
- Nine-hole Nassau is one bet; skins, Wolf and Markey size off the layout
- Wolf with two players is a push; a solo round settles to zero
- Plus handicaps, second strokes past 18, nine-hole wrap
- Pop flags read both stroke counts and legacy booleans
- `fmtMoney`, zero-sum cent rounding, settlement, Venmo amount parity
- The report covers every section; the mail body fits a `mailto:` URL
- The scorecard parser across five real card shapes; group code round-tripping
- A fresh install ships an empty roster

**In a real browser** (Chromium, `playwright`):
- 16 combinations — 1/2/3/4 players × 4 viewports including two landscape — no
  page errors, no horizontal overflow, no control off-screen
- Three complete 18-hole rounds driven hole by hole through to the Payouts and
  Send tabs, confirming engine-game money reaches the settlement
- The scorecard photo import end to end: photo → zoom/rotate → paste → grid →
  save → the course appears in the picker
- A true first run: empty roster, no sample personal data, no EGT tab, a group
  created, a player added, the Cup unlock working

---

## 7. Still open

Nothing here is code. Ordered by what blocks what.

| # | Item | Owner | Notes |
|---|---|---|---|
| 1 | **Deploy the Firebase rules** | you | 5 min. Do this before anyone else installs the app — it is what makes §1.3 actually fixed rather than merely written. |
| 2 | Decide: PWA (free, ready today) or App Store ($99/yr + a Mac) | you | The PWA path needs only item 1 and GitHub Pages. |
| 3 | Apple Developer Program enrolment | you | $99/year |
| 4 | Build and sign on a Mac | you | `npm run ios:sync:public`, then Xcode. ~30 min. |
| 5 | Enable GitHub Pages for the privacy and support URLs | you | Required App Store Connect fields |
| 6 | Move your group off `LEGACY` (§2.3 steps 3–5) | you | One evening. Optional but recommended. |
| 7 | Update `appstore/APP_STORE_LISTING.md` — it still says "eight games" | either | Say the word and I'll rewrite it |
| 8 | Screenshots in Simulator | you | Needs the Mac from item 4 |
| 9 | Decide on Pro (§5) | you | Not before launch |
| 10 | `bottomLineProvider.js` still hardcodes four real names | either | Unreachable in the native bundle; cosmetic unless you publish `bottomline.html` |

---

*Audit and remediation: v1.16.0. Full change list in `CHANGELOG.md`.*
