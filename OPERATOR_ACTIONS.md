# PlayPal — Operator actions

Human-only steps that cannot live entirely in git: Firebase / Stripe / Vercel
console clicks, GitHub secrets, and how to deploy Firestore rules.

| | |
|---|---|
| Live app | https://playpal-nine.vercel.app |
| Health check | https://playpal-nine.vercel.app/api/health |
| Firebase project | `playpal-sync` |
| Webhook URL | `https://playpal-nine.vercel.app/api/stripe-webhook` |

> Never commit secrets. `.env*`, `.secrets/`, and box-secrets stay local /
> gitignored. Stripe keys and the Firebase service account live in **Vercel
> environment variables** (and, for rules deploy CI, GitHub Actions secrets).

---

## Honesty — what is already live (~2026-09-08)

This is **not** a greenfield Stripe setup. Around **2026-09-08** the live
PlayPal deployment already had:

| Item | Status (as of WS2 docs) |
|---|---|
| Stripe product **PlayPal Pro** (one-time **$9.99**) | **Already created** in Stripe Dashboard |
| Stripe Price id | **Already created** — value lives in Vercel `STRIPE_PRICE_ID` (never in git) |
| Stripe webhook endpoint → `/api/stripe-webhook` (`checkout.session.completed`) | **Already pointed** at `https://playpal-nine.vercel.app/api/stripe-webhook` |
| Vercel env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` | **Already set** on the production project (verify, do not blindly recreate) |
| Client Checkout + webhook grant of `users/{uid}.pro` + Auth claim | **Already in repo** since the live-auth/Stripe PR |

**What WS2 adds in git (no Dashboard required to merge):**

1. `GET /api/health` — boolean config flags only (never echoes secrets)
2. Client **honest degrade** when health says payments are unset
3. Soft **Pro gates** behind `window.PLAYPAL_CONFIG.enforceProGates` (default `false`)
4. This runbook (Stripe + Vercel click-paths + verified-vs-remaining)

**What may still need a human click (verify in Dashboards):**

- Confirm webhook signing secret in Vercel still matches Stripe’s endpoint
- Confirm live vs test keys are the ones you intend
- Flip `enforceProGates` to `true` in `index.html` when you want Trips / Stats / export soft-locked
- Optional: rotate keys if anything was ever pasted into chat/logs

---

## 1. Stripe Dashboard — product / price / webhook

### 1a. Product + price (already done ~2026-09-08 — verify)

1. Open [Stripe Dashboard → Products](https://dashboard.stripe.com/products).
2. Confirm product **PlayPal Pro** exists (one-time, **$9.99** USD).
3. Open the price → copy **Price ID** (`price_…`).
4. Vercel → Project → Settings → Environment Variables → `STRIPE_PRICE_ID` should match.

If you ever need to recreate (only if missing):

1. Products → Add product → name `PlayPal Pro`.
2. Pricing: One-time, `$9.99` USD → Save.
3. Copy Price ID into Vercel `STRIPE_PRICE_ID` (Production + Preview as needed).
4. Redeploy so serverless functions pick up the env.

### 1b. Webhook (already done ~2026-09-08 — verify)

1. [Stripe → Developers → Webhooks](https://dashboard.stripe.com/webhooks).
2. Endpoint URL must be:

   `https://playpal-nine.vercel.app/api/stripe-webhook`

3. Event: `checkout.session.completed` (minimum).
4. Reveal **Signing secret** (`whsec_…`) → Vercel env `STRIPE_WEBHOOK_SECRET`.
5. API keys: [Developers → API keys](https://dashboard.stripe.com/apikeys) →
   Secret key → Vercel `STRIPE_SECRET_KEY` (`sk_live_…` for production).

### 1c. Quick live test

1. Sign in on https://playpal-nine.vercel.app (email/Google, not anonymous).
2. Account → Unlock Pro → complete Checkout (or use Stripe test mode + test keys).
3. Webhook should write `users/{uid}.pro = true` and set Auth custom claim `pro: true`.
4. `GET /api/health` should show `"paymentsConfigured": true` when all four server envs are present.

---

## 2. Vercel — environment variables

Project that serves `playpal-nine.vercel.app`:

| Env var | Where it comes from | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe → API keys | `sk_test_…` / `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_…` |
| `STRIPE_PRICE_ID` | Stripe Price for PlayPal Pro | `price_…` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase → Project settings → Service accounts → Generate new private key | **Single-line JSON string** |

Steps:

1. Vercel Dashboard → Project → **Settings → Environment Variables**.
2. Confirm all four exist for **Production** (and Preview if you test Preview deploys).
3. Values are **never** committed — see `.env.example` for **names only**.
4. After any change: **Deployments → … → Redeploy** (env changes do not hot-reload serverless).

### Health check

```text
https://playpal-nine.vercel.app/api/health
```

Expected shape (booleans only — no secret material):

```json
{
  "ok": true,
  "service": "playpal",
  "paymentsConfigured": true,
  "stripeSecretKey": true,
  "stripePriceId": true,
  "stripeWebhookSecret": true,
  "firebaseAdmin": true,
  "checkedAt": "…"
}
```

If `paymentsConfigured` is `false`, the client **must not** pretend Checkout works
(WS2 honest degrade).

---

## 3. Client flag — `enforceProGates`

In `index.html`:

```js
window.PLAYPAL_CONFIG = {
  apiBaseUrl: '',
  stripePublishableKey: '',
  enforceProGates: false   // set true to soft-block Trips / Stats / export
};
```

| Value | Behavior |
|---|---|
| `false` (default) | Current free access — gates are no-ops |
| `true` | Trips, Stats (season/career), and CSV/printable export require Pro |

Scoring during a round is **never** gated.

---

## 4. Deploy Firestore rules (from WS1 runbook)

Rules source: `firebase/firestore.rules` (RTDB: `firebase/database.rules.json`).

**Already live** (~2026-09-08): `users/{uid}` with no client self-grant of `pro`,
plus group-scoped `g_{GROUP}_rounds` / `g_{GROUP}_trips`.

### CLI

```bash
cd firebase
npx firebase-tools login
npx firebase-tools use playpal-sync
npx firebase-tools deploy --only firestore:rules
```

### GitHub Action (when WS1 workflow lands on main)

Workflow: `.github/workflows/deploy-firestore-rules.yml`

| Secret | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Preferred — JSON for Rules Admin on `playpal-sync` |
| `FIREBASE_TOKEN` | Fallback from `firebase-tools login:ci` |

---

## 5. Related docs

| Doc | Role |
|---|---|
| `docs/LIVE_LAUNCH.md` | Shorter Auth + Stripe checklist — **prefer this file for Stripe/Vercel clicks** |
| `firebase/README.md` | Rules semantics + manual deploy |
| `SECURITY.md` | Vulnerability reporting |
| `.env.example` | Names of server env vars (no values) |

---

## Remaining operator clicks (checklist)

- [ ] Stripe → Products: confirm PlayPal Pro + $9.99 price still exists
- [ ] Stripe → Webhooks: confirm URL `https://playpal-nine.vercel.app/api/stripe-webhook`
- [ ] Stripe → Webhooks: signing secret matches Vercel `STRIPE_WEBHOOK_SECRET`
- [ ] Vercel → Env: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`
- [ ] Hit `/api/health` → all flags `true`
- [ ] Optional: set `enforceProGates: true` when ready to soft-lock Pro features
- [ ] Optional: one live Checkout smoke test on a real (or test-mode) account
