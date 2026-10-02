---
paths:
  - "**/*.test.{ts,tsx,mts}"
  - "e2e/**"
  - "fixtures/**"
  - "src/lib/pkp/mock*"
  - "playwright.config.ts"
  - "vitest.config.mts"
  - "vitest.setup.ts"
  - ".githooks/**"
  - ".github/workflows/**"
  - "src/app/**/route.ts"
  - "src/app/**/page.tsx"
---

# Testing in this repo (#8, #12, #16)

General rules: `~/.claude/rules/testing-unit.md`, `testing-e2e.md`.

## #12 Gate commands

```bash
npm run check                               # typecheck && lint && test (pre-push hook)
TZ=UTC npm run test                         # time logic (#1); CI runs Europe/Warsaw + UTC
npm run e2e                                 # UI changes (#16)
PKP_CONTRACT=1 npm run test -- contract     # touching src/lib/pkp/schema.ts or query params in client.ts
GTFS_CONTRACT=1 npm run test -- gtfs/contract
```

- Contract tests hit the public schema (network, no key, no cost). `contract.test.ts` only
  checks presence of fields/params — their disappearance causes silent failures
  (2026-08-30: `withPlanned`/`fullRoute`).
- Coverage thresholds in `vitest.config.mts` (branches 87, lines 91), enforced by `test:coverage` in CI.
- Vitest runs with `pool: 'threads'` and per-file isolation. Do not set `isolate: false`
  despite Vitest's hint: measured 2026-09-28 it failed 117, 190 and 125 tests in three runs
  (a different set each time: jsdom DOM, `vi.mock` and module state leak between files).
  Threads kept isolation and cut the suite from ~75 s to ~48 s.
- `npm run deps:check` (pre-push, before `check`): exit 1 when `node_modules` differs from
  `package-lock.json`. Worktrees use the main checkout's `node_modules` → `npm ci` there when
  its lockfile matches; a branch that changes the lockfile (Dependabot) → `npm ci` in the worktree.
- `npm run check` does NOT run `next build`, and `tsc` does not see Next's route/page export
  rules. Files under `src/app/**` (`route.ts`, `page.tsx`, `layout.tsx`) may export only the
  fields Next allows (HTTP methods / route config, the default page, `metadata`…); a test-only
  helper exported from `route.ts` passed the gate and failed `next build` (TS2344 "not
  assignable to never"). Put such state and helpers in a `src/lib/` module. After changing
  anything in `src/app/**`, run `npx next build --webpack` (worktree) before pushing — CI builds
  only in the e2e job.

## #8 Fixtures don't reflect live API scale

The mock has **real** station IDs (Warszawa Centralna `33605`, Kraków Główny `80416`, Gdańsk
Główny `7500`), but only 15 hand-written trains (`orderId` 101–115) and 6 carrier codes
instead of 22. For UI work — not for inferring production traffic.

Variants covered: on time, small/large delay, ~6 h delay still en route (`104`), fully
cancelled (`105`), partially (`106`), not yet departed (`107`, `trainStatus S`), freshly
confirmed departure (`108`), disruptions (`109` dictionary code, `110` PKP text), after
midnight (`112`, `arrivalDay: 1`), no matched route (`113`), no realization with timetable
mid-route (`115`, `isScheduleProjection` in `board/trainDetail.ts`). Map `orderId`→case:
comments in `src/lib/pkp/mock.test.ts`. `105` (upcoming departure from `33605`) also carries the
only live-length „przez …" list (67 chars) — the board-width e2e (`aside-layout.spec.ts`) needs
it; the other via lists are short, unlike live data.

Mock switches and extras (additive, tests hard-code the base data): `MOCK_BUDGET=low|unknown`
(`config.ts` → `createMockClient({ budget })`) shows a near-exhausted / unknown budget in
`PollerDiagnostics`; `WEATHER_DATA_SOURCE=mock` serves canned weather from the server (e2e sets it;
`page.route` cannot stub it — the fetch is server-side). Mock GTFS Warszawa has one bus line per kind
(`128`/`190` regular, `712` zone with a request-only mid stop, `L-1` local, `Z1` replacement, `N16`,
`521`), 4 extra alerts (date text, long body, 2nd on `20`, unknown effect) and one stale vehicle
(`{{STALE}}`, `190/1`; the fresh `20-wd-0-1` stays first). Only OpenFreeMap tiles still hit the network.

Check response shape in the public schema, don't guess from fixtures (no key, no cost):
`curl -s https://pdp-api.plk-sa.pl/swagger/v1/swagger.json`

## #16 E2E

`npm run e2e` = versioned UI regression suite (`@playwright/test`), mock mode, zero network:
server via `webServer` without a PKP key, `GTFS_DATA_SOURCE=mock`. Locally on UI changes + in
CI (separate `e2e` job, outside the fast `quality` job).

- Projects: `desktop-chromium`, `mobile-chromium` (`Pixel 7`), `mobile-safari`
  (`iPhone 15`). New viewport = entry in `playwright.config.ts`.
- Outside CI `playwright.config.ts` builds with `--webpack` (Turbopack fails when
  `node_modules` is above `turbopack.root`). Don't junction `node_modules` into the worktree.
- `next.config.ts` roots file tracing (`outputFileTracingRoot` = `turbopack.root`) where
  `node_modules/next` lives, so a worktree's standalone build stays in its `.next` (guard:
  `next.config.test.ts`). Builds before 2026-10-02 left `.claude/worktrees/node_modules/{next,styled-jsx}`
  — it shadows `next` for all worktrees (`next/og` prerender fails): delete those two, keep `.vite-temp`.
- Locally `reuseExistingServer` attaches to ANY server on port 3123 — also another worktree's or
  session's build (seen 2026-09-29: a different branch's old UI, 14 false failures). Run
  `E2E_PORT=<free port> npm run e2e` in a worktree; `CI=1` does not help there (Turbopack build fails).
- Locally `retries: 1` (as in CI): under full load 2 tests failed per run and passed on retry;
  now they show as "flaky". Missing browsers after a Playwright bump → the config prints
  `npx playwright install chromium webkit` and exits.
- `ponytail:` visual snapshots (`toHaveScreenshot`) skipped until a real visual regression.
