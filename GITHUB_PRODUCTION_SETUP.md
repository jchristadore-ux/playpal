# GitHub Production Setup

What now exists in the repo, plus the few switches only you can flip in the
GitHub UI (settings aren't files, so they can't be committed).

## Added to the repository ✅

| Item | File |
|---|---|
| CI: build, dist-freshness check, tests, dependency audit, secret scan | `.github/workflows/ci.yml` |
| Continuous deployment to GitHub Pages | `.github/workflows/deploy-pages.yml` |
| Release automation: tag → test → changelog → GitHub Release + site tarball | `.github/workflows/release.yml` |
| Dependabot: weekly npm + Actions updates | `.github/dependabot.yml` |
| Issue templates (bug / feature) + contact link | `.github/ISSUE_TEMPLATE/` |
| PR template with test/build checklist | `.github/PULL_REQUEST_TEMPLATE.md` |
| Security policy | `SECURITY.md` |
| Changelog | `CHANGELOG.md` |
| `.gitignore` (node_modules etc.) | `.gitignore` |

## Versioning & releases

Semantic versioning, driven by git tags:

```bash
# after merging changes to main:
git tag v1.0.1
git push origin v1.0.1
```

The release workflow builds, runs tests, generates a changelog from commit
messages since the previous tag, and publishes a GitHub Release with a
deployable `playpal-site.tar.gz`. Keep `CHANGELOG.md` updated for human-edited
notes; the generated release notes cover the commit level.

When you bump the version, also update it in: `package.json`,
the `?v=` query strings in `index.html`, `CACHE_VERSION` in `sw.js`, and the
footer in `components/Home.jsx` (then `npm run build`).

## One-time settings to flip in the GitHub UI (5 minutes)

1. **Enable Pages:** Settings → Pages → Build and deployment → Source:
   **GitHub Actions**. The next push to `main` deploys automatically.
2. **Branch protection:** Settings → Branches → Add rule for `main`:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass → select **build-and-test**
   - ✅ Require branches to be up to date before merging
3. **Security:** Settings → Code security and analysis →
   - ✅ Dependency graph, ✅ Dependabot alerts, ✅ Dependabot security updates
   - ✅ Secret scanning (free for public repos)
4. *(Public repos only, optional)* Code scanning → Set up CodeQL → Default.

## Day-to-day flow

```
branch → commit (remember: npm run build if you touched components/) →
push → PR → CI green → merge → Pages auto-deploys → tag when you want a release
```
