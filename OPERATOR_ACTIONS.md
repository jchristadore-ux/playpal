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
