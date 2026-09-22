# PlayPal — Operator actions

Human-only steps that cannot live entirely in git: Firebase / Stripe / Vercel
console clicks, GitHub secrets, and how to deploy Firestore rules. Code + CI for
rules live in this repo (WS1). Stripe / webhook expansion continues in later
workstreams.

| | |
|---|---|
| Live app | https://playpal-nine.vercel.app |
| Firebase project | `playpal-sync` |

> Never commit secrets. `.env*`, `.secrets/`, and box-secrets stay local /
> gitignored. Stripe keys and the Firebase service account live in **Vercel
> environment variables** (and, for rules deploy CI, GitHub Actions secrets).

---

## 1. Deploy Firestore rules

Rules source: `firebase/firestore.rules` (RTDB: `firebase/database.rules.json`).

**Already live** (deployed ~2026-09-08): `users/{uid}` with no client self-grant
of `pro`, plus group-scoped `g_{GROUP}_rounds` / `g_{GROUP}_trips`. This repo’s
WS1 work adds **CI deploy**, **emulator unit tests**, and this runbook — it does
not re-invent those rules.

### Option A — CLI (manual)

```bash
cd firebase
npx firebase-tools login          # once
npx firebase-tools use playpal-sync
npx firebase-tools deploy --only firestore:rules
# optional, same trust model for RTDB:
# npx firebase-tools deploy --only firestore:rules,database
```

Confirm in Firebase Console → Firestore → Rules that the file matches git.
A failed compile leaves the **previous** rules live — always read the CLI output.

### Option B — GitHub Action (preferred after secrets are set)

Workflow: `.github/workflows/deploy-firestore-rules.yml`

| Event | Behavior |
|---|---|
| Pull request touching `firebase/**` or the workflow | **Validate only** (static syntax + emulator unit tests) |
| Push to `main` | **Deploy** rules to `playpal-sync` |

#### Required GitHub secrets (Settings → Secrets and variables → Actions)

Set **one** of these auth methods (prefer the service-account JSON):

| Secret | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON of a Firebase/GCP service account with Firebase Rules Admin (or Editor) on `playpal-sync`. Used with `google-github-actions/auth`. |
| `FIREBASE_TOKEN` | Fallback: CI token from `npx firebase-tools login:ci`. Used only if `FIREBASE_SERVICE_ACCOUNT` is unset. |

Project id `playpal-sync` is hard-coded in the workflow.

If the **main** deploy job runs without either secret, it **fails clearly** with
an error naming the missing secret — it will not silently skip deploy.

---

## 2. Rules tests (emulator)

Static syntax guards (always in `npm test`): `tests/firebaseRules.test.mjs`.

Emulator unit tests: `tests/firestoreRules.emulator.test.mjs` via:

```bash
npm run test:rules
```

That script runs `firebase emulators:exec` (needs **Java** for the Firestore
emulator). If `FIRESTORE_EMULATOR_HOST` is unset, those tests **skip** so
`npm test` stays green offline; CI’s rules job installs Java and runs them for real.

Coverage locked by the emulator suite:

1. User A cannot read user B’s `users/{uid}`
2. Signed-in user cannot create/update with `pro: true` (or forge Stripe entitlement fields)
3. Group collections are path-isolated by group id; unauthenticated denied; bad shapes denied
4. Knowing the group id + signed-in allows read/write on that group’s rounds/trips

**Trust model:** group id in the collection name is the capability. Auth UID is
not bound to one group (foursome sync). See `firebase/README.md`.

---

## 3. Live Auth + Stripe Pro (pointer)

Full checklist: **`docs/LIVE_LAUNCH.md`** (kept; later WS folds more of it here).

Short version:

| Where | What |
|---|---|
| Firebase Console (`playpal-sync`) | Enable Email/Password + Google (+ Anonymous for guests); authorized domains; service account JSON for Admin SDK |
| Stripe | Product “PlayPal Pro” one-time $9.99; webhook `checkout.session.completed` → `/api/stripe-webhook` |
| Vercel (`playpal-nine.vercel.app`) | Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` — **values never in git** |
| Client | Public Stripe publishable key / API base via `window.PLAYPAL_CONFIG` in `index.html` |

Webhook writes `users/{uid}.pro` via Admin SDK (bypasses rules). Clients cannot self-grant.

See `.env.example` for env var **names** only.

---


## 4. Related docs

| Doc | Role |
|---|---|
| `docs/LIVE_LAUNCH.md` | Auth + Stripe + Vercel launch checklist |
| `firebase/README.md` | Rules semantics + manual deploy notes |
| `SECURITY.md` | Vulnerability reporting |
| `GITHUB_PRODUCTION_SETUP.md` | Broader GitHub Actions / Pages / release setup |
| `.env.example` | Names of server env vars (no values) |
| `scripts/migrate-legacy-group.mjs` | WS3 legacy → group-scoped Firestore copy |

---

## 5. Migration — legacy Firestore → group-scoped (WS3)

Pre-group installs wrote rounds/trips to unscoped collections. Current clients
namespace by group id via `_col()` in `index.html` / `GroupService`:

| Leaf | LEGACY (unscoped) | Group-scoped |
|---|---|---|
| rounds | `playpal_rounds/{syncCode}` | `g_{GROUPID}_rounds/{syncCode}` |
| trips | `golf_trips/{tripId}` | `g_{GROUPID}_trips/{tripId}` |

Script: `scripts/migrate-legacy-group.mjs`

### Auth for the script

Use **one** of (never paste keys into git or chat logs):

1. `FIREBASE_SERVICE_ACCOUNT_JSON` — stringified service-account JSON (same as Vercel)
2. `FIREBASE_SERVICE_ACCOUNT_PATH` — path to a downloaded JSON key file
3. `GOOGLE_APPLICATION_CREDENTIALS` — standard Google ADC path
4. `--credentials /path/to/sa.json` — CLI override

Firebase Console → Project settings → Service accounts → Generate new private
key. The key needs Firestore read/write on `playpal-sync`.

### Dry-run (default — safe)

```bash
# From repo root; prints would-copy / would-delete counts; writes nothing
FIREBASE_SERVICE_ACCOUNT_PATH=./path-to-sa.json \
  node scripts/migrate-legacy-group.mjs --group-id YOURGROUPIDHERE
```

`--group-id` must be a real group id (8–40 chars, Crockford-ish alphabet; not
`LEGACY`). Devices that should see the migrated data must already be joined to
that group (`GroupService.join` / join link).

Useful flags for staged dry-runs:

- `--rounds-only` / `--trips-only`
- `--limit N` — only first N docs per collection
- `--doc-id CODE` — single doc (repeatable)

### Confirm (mutates)

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=./path-to-sa.json \
  node scripts/migrate-legacy-group.mjs --group-id YOURGROUPIDHERE --confirm
```

Sequence per doc: **copy → verify dest exists → delete legacy**. Existing
destination docs are skipped (idempotent; no overwrite). Add `--keep-legacy`
to copy without deleting sources.

### Honesty / risk notes

- Devices still on the **LEGACY** group keep reading `playpal_rounds` /
  `golf_trips`. Deleting legacy after migrate will make those devices lose
  server-side rounds/trips until they join the destination group.
- This script does **not** migrate RTDB paths (`players`, `courses`, etc.) —
  only the Firestore collections above.
- Re-running with `--confirm` is safe: already-migrated docs are skipped.

Unit tests (no live Firebase): `tests/migrateLegacyGroup.test.mjs` (arg parsing
+ in-memory dry-run / confirm paths).

> **Note (WS1 carry-over):** `.github/workflows/deploy-firestore-rules.yml` may
> still be missing on `main` if the merge could not write workflow files
> (GitHub App `workflow` scope). See the Appendix below — do not block WS3 on
> that file.

---

## 6. GitHub Pages (legal / support URLs for App Store)

Public HTTPS pages used in App Store Connect and the listing pack
(`appstore/APP_STORE_LISTING.md`):

| Page | URL |
|---|---|
| Home | https://jchristadore-ux.github.io/playpal/ |
| Privacy | https://jchristadore-ux.github.io/playpal/privacy.html |
| Terms | https://jchristadore-ux.github.io/playpal/terms.html |
| Support | https://jchristadore-ux.github.io/playpal/support.html |

Source files live at the repo root (`privacy.html`, `terms.html`, `support.html`).
After merging changes to those files on `main`, confirm Pages has rebuilt
(Settings → Pages) before submitting a new App Store version.

In-app footer links remain relative (`privacy.html` etc.) so they work on
Vercel, Pages, and the Capacitor bundle alike.

---

## Appendix: workflow YAML (paste if CI cannot write `.github/workflows/`)

GitHub App tokens without the `workflow` scope cannot create files under
`.github/workflows/`. If this PR is missing
`.github/workflows/deploy-firestore-rules.yml`, create it on `main` (or this
branch) with the following contents:

```yaml
name: Deploy Firestore rules

on:
  push:
    branches: [main]
    paths:
      - 'firebase/**'
      - '.github/workflows/deploy-firestore-rules.yml'
      - 'tests/firestoreRules.emulator.test.mjs'
      - 'package.json'
      - 'package-lock.json'
  pull_request:
    paths:
      - 'firebase/**'
      - '.github/workflows/deploy-firestore-rules.yml'
      - 'tests/firestoreRules.emulator.test.mjs'
      - 'package.json'
      - 'package-lock.json'
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

jobs:
  validate-rules:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install Java (Firestore emulator)
        run: sudo apt-get update -qq && sudo apt-get install -y -qq openjdk-21-jre-headless

      - name: Install dependencies
        run: npm ci

      - name: Static rules syntax tests
        run: node --test tests/firebaseRules.test.mjs

      - name: Emulator rules unit tests
        run: npm run test:rules

  deploy-rules:
    needs: validate-rules
    if: github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main')
    runs-on: ubuntu-latest
    env:
      FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
      FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Require Firebase deploy credentials
        run: |
          if [ -z "$FIREBASE_SERVICE_ACCOUNT" ] && [ -z "$FIREBASE_TOKEN" ]; then
            echo "::error::Missing GitHub secret FIREBASE_SERVICE_ACCOUNT (preferred) or FIREBASE_TOKEN. See OPERATOR_ACTIONS.md — cannot deploy Firestore rules to playpal-sync."
            exit 1
          fi
          echo "Deploy credentials present."

      - name: Authenticate to Google Cloud (service account)
        if: ${{ env.FIREBASE_SERVICE_ACCOUNT != '' }}
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}

      - name: Deploy Firestore rules (ADC / service account)
        if: ${{ env.FIREBASE_SERVICE_ACCOUNT != '' }}
        working-directory: firebase
        run: npx firebase-tools deploy --only firestore:rules --project playpal-sync --non-interactive

      - name: Deploy Firestore rules (FIREBASE_TOKEN fallback)
        if: ${{ env.FIREBASE_SERVICE_ACCOUNT == '' && env.FIREBASE_TOKEN != '' }}
        working-directory: firebase
        run: npx firebase-tools deploy --only firestore:rules --project playpal-sync --non-interactive --token "$FIREBASE_TOKEN"
```
