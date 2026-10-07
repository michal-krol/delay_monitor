---
paths:
  - "Dockerfile"
  - "railway.json"
  - ".github/**"
  - "src/lib/config.ts"
  - ".env.example"
  - "src/app/api/health/**"
  - "next.config.ts"
---

# Deployment in this repo (Railway)

General rules: `~/.claude/rules/deployment.md`, `versioning.md`. Public summary: README
„Wdrożenie” (keep internal details — keys, costs, URLs, platform settings — out of it).

- One Railway project, two environments: `main` → production (`live`, real key), `dev` →
  staging (`live`). **As of 2026-10-01 both use ONE shared PKP key** — one 100/h + 1000/day
  budget (#3): measured 2026-10-01 16:02–16:10 UTC, both `/api/health` `budget` values moved on
  one counter. A separate staging key is planned; until then every staging request (poller
  included) spends the production budget, so keep staging click-QA short.
  Railway deploys automatically on push from the `Dockerfile` (`output: 'standalone'`).
- `main` is protected by the GitHub ruleset `branch-protection`: PR only, required checks
  `quality` and `e2e`, no force-push or deletion. Renaming a CI job = update the ruleset.
- Railway waits for CI (`checkSuites=true`): a deploy shown as WAITING after a push means
  "waiting for CI", not a lost deploy. Don't force it with an empty commit.
- `/api/health` is the healthcheck and returns 200 even with a bad key
  (`pollerStatus: "configError"`) — deliberate: the app keeps serving the last known data;
  restarting would only hurt. The state is in the body.
- `dev` has App Sleep (sleeps after 10 min idle); waking up looks like a cold start
  (`FAST_RETRY_DELAYS_MS` in `useBoard.ts`).
- Railway `dev` runs `GTFS_DATA_SOURCE=live`; default is `mock` (#13).
- `data/` and `fixtures/` are traced into `.next/standalone` (read via `process.cwd()`).
- `metadataBase` for `og:image` comes from Railway's `RAILWAY_PUBLIC_DOMAIN` (`src/lib/share/metadata.ts`);
  without it Next would emit `http://localhost:PORT` image URLs. Check on staging after changing domains.
- One replica only (#5): never scale horizontally.
- `E2E=1` disables `output: standalone` (because `next start` doesn't work with standalone);
  Railway/production unaffected.

# #11 `docs/` is not published

`docs/` (technical design, plans, session handoffs) is in `.gitignore` on purpose. Don't add it
back. Handoffs live only in the main checkout (`E:\Claude_Code\delay_monitor\docs\`); from a
worktree, write to its `docs/` and hand the user an `mv` to the main checkout — see the `handoff` skill.
