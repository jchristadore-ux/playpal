# Free Stack Report

Requirement: **no paid SaaS, no recurring costs.** Good news — the existing
stack was already free; nothing had to be replaced. This documents each piece,
its free-tier limits, and the one cost that cannot be engineered away.

## Current stack (all $0/month)

| Concern | Service | Tier & limits | Headroom for a friend group |
|---|---|---|---|
| Database & sync | Firebase Firestore + Realtime DB (Spark plan) | 1 GiB storage, 50k reads/20k writes per day, 100 simultaneous RTDB connections | Years of rounds; a busy golf day is a few thousand operations |
| Auth | Firebase Anonymous Auth | Unlimited on Spark | ✅ |
| Hosting (web/PWA) | **GitHub Pages** (workflow added: `.github/workflows/deploy-pages.yml`) | 100 GB bandwidth/mo, public repos free | ✅ |
| CI/CD | GitHub Actions | 2,000 min/mo free (private) / unlimited (public) | CI run ≈ 1 min |
| JS libraries | unpkg / cdnjs / gstatic CDNs | Free | ✅ |
| Build tooling | esbuild, sharp (open source, dev-time only) | Free | ✅ |
| Error tracking | Console + ErrorBoundary (no SaaS) | Free | See note below |
| Analytics | **None — deliberately** | Free | Personal app; analytics adds privacy-label burden for zero value |

## Things checked for hidden costs

- **Anthropic API call in Setup.jsx** — the scorecard scanner called a *paid*
  API (and was broken anyway: no key). **Removed.** This was the only paid
  service referenced anywhere in the codebase.
- **Firebase Blaze upsell** — not needed; the app uses no Cloud Functions,
  no Storage, no FCM.
- **Fonts** — Google Fonts, free.

## Optional free upgrades (not installed, on purpose)

| Tool | Free tier | Why it's not added now |
|---|---|---|
| Sentry (error tracking) | 5k events/mo | Adds a third-party data processor → privacy-label changes; ErrorBoundary + Firebase console cover a personal app |
| PostHog / GA4 (analytics) | Generous | Same privacy trade-off, no decision it would inform |
| Cloudflare Pages | Unlimited bandwidth | GitHub Pages is sufficient and one less account |

## The one unavoidable cost

**Apple Developer Program: $99/year** — required for App Store distribution,
full stop. The zero-cost alternative shipped in this pass is the **PWA**:
GitHub Pages serves it over HTTPS, iPhones install it via Share → Add to Home
Screen, and the service worker gives it offline behavior. No replacement
exists that puts an app in the App Store for free.
