# Security Policy

PlayPal is a personal-use app. If you find a security issue — especially
anything that lets a non-group member read or write the Firebase data —
please email **jchristadore@gmail.com** rather than opening a public issue.

## Scope notes

- The Firebase web config in `index.html` (API key, project ID) is **public by
  design** — Firebase web API keys are identifiers, not secrets. Access control
  comes from the security rules in `firebase/`.
- The trust model is one friend group: every app user can read/write the
  group's shared scoreboard data. Reports about group members affecting each
  other's scores are working-as-intended; reports about **unauthenticated**
  access are critical.
