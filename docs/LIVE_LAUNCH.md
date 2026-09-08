# PlayPal — Live launch guide (Auth + Stripe Pro)

Operator checklist for public users with real accounts and a $9.99 one-time PlayPal Pro unlock (APP_STORE_AUDIT.md section 5).

## Architecture (in-repo)

| Layer | What |
|---|---|
| Client | Vanilla React/JSX PWA + Capacitor. New: AuthService, ProService, AuthScreen. |
| Auth | Firebase Email/Password + Google primary; Anonymous guest kept for foursome sync. |
| Entitlement | Firestore users/{uid} (pro, Stripe refs). Webhook writes via Admin SDK. Client caches; fail-open. |
| Payments | Vercel api/ — Checkout Session create + Stripe webhook. |
| Multi-tenant | Groups stay code-scoped. Signed-in users get ownerUid + users/{uid}.groupId. |

## Env vars

### Client (public) — window.PLAYPAL_CONFIG in index.html

| Key | Purpose |
|---|---|
| apiBaseUrl | Vercel API origin. Blank = same origin. |
| stripePublishableKey | pk_test_ / pk_live_ |
| enforceProGates | Default false. true soft-blocks Trips/Stats behind Pro. |

### Server (Vercel env)

| Key | Purpose |
|---|---|
| STRIPE_SECRET_KEY | sk_test_ / sk_live_ |
| STRIPE_WEBHOOK_SECRET | whsec_ |
| STRIPE_PRICE_ID | One-time price id |
| FIREBASE_SERVICE_ACCOUNT_JSON | Service-account JSON string |

See .env.example. Never commit real values.

## Human clicks (outside this repo)

### Firebase Console (playpal-sync)

1. Authentication - Sign-in method: enable Email/Password, Google, keep Anonymous.
2. Authorized domains: add Vercel and custom domain.
3. Service accounts - Generate private key - put JSON in Vercel FIREBASE_SERVICE_ACCOUNT_JSON.
4. Deploy rules from firebase/ with firebase-tools (firestore:rules,database).

### Google OAuth consent

Publish the OAuth consent screen (or add test users) and confirm authorized domains.

### Stripe

1. Create product PlayPal Pro, one-time 9.99 USD; copy Price id to STRIPE_PRICE_ID.
2. Add webhook endpoint at /api/stripe-webhook for checkout.session.completed; copy signing secret.
3. Set STRIPE_SECRET_KEY on Vercel (test then live).

### Vercel

1. Import repo; set the four server env vars; deploy.
2. If the static PWA is not on the same host, set PLAYPAL_CONFIG.apiBaseUrl.
Extra note: full operator steps live with the Firebase and Stripe console checklists above.
