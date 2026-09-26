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

## #8 Fixtures don't reflect live API scale

The mock has **real** station IDs (Warszawa Centralna `33605`, Kraków Główny `80416`, Gdańsk
Główny `7500`), but only 15 hand-written trains (`orderId` 101–115) and 6 carrier codes
instead of 22. For UI work — not for inferring production traffic.

Variants covered: on time, small/large delay, ~6 h delay still en route (`104`), fully
cancelled (`105`), partially (`106`), not yet departed (`107`, `trainStatus S`), freshly
confirmed departure (`108`), disruptions (`109` dictionary code, `110` PKP text), after
midnight (`112`, `arrivalDay: 1`), no matched route (`113`), no realization with timetable
mid-route (`115`, `isScheduleProjection` in `board/trainDetail.ts`). Map `orderId`→case:
comments in `src/lib/pkp/mock.test.ts`.

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
- `ponytail:` visual snapshots (`toHaveScreenshot`) skipped until a real visual regression.
