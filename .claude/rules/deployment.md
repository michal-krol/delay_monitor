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
„Wdrożenie” (keep internal details — keys, costs, environment names — out of it).

- One Railway project, two environments: `main` → production (`live`, real key), `dev` →
  staging (`live`, a **separate second PKP key** — independent 100/h + 1000/day budget, #3).
  Railway deploys automatically on push from the `Dockerfile` (`output: 'standalone'`).
- Railway waits for CI (`checkSuites=true`): a deploy shown as WAITING after a push means
  "waiting for CI", not a lost deploy. Don't force it with an empty commit.
- `/api/health` is the healthcheck and returns 200 even with a bad key
  (`pollerStatus: "configError"`) — deliberate: the app keeps serving the last known data;
  restarting would only hurt. The state is in the body.
- `dev` has App Sleep (sleeps after 10 min idle); waking up looks like a cold start
  (`FAST_RETRY_DELAYS_MS` in `useBoard.ts`).
- Railway `dev` runs `GTFS_DATA_SOURCE=live`; default is `mock` (#13).
- `data/` and `fixtures/` are traced into `.next/standalone` (read via `process.cwd()`).
- One replica only (#5): never scale horizontally.
- `E2E=1` disables `output: standalone` (because `next start` doesn't work with standalone);
  Railway/production unaffected.

# #11 `docs/` is not published

`docs/` (technical design, plans, session handoffs) is in `.gitignore` on purpose. Don't add it
back. Handoffs live only in the main checkout (`E:\Claude_Code\delay_monitor\docs\`), not in
worktrees — use the `handoff` skill.
