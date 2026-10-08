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
  - ".claude/hooks/filter-test-output.mjs"
  - "scripts/*filter-test-output*"
  - "scripts/lib/testOutputFilter*"
  - ".github/workflows/**"
  - "src/app/**/route.ts"
  - "src/app/**/page.tsx"
---

# Testing in this repo (#8, #12, #16)

General rules: `~/.claude/rules/testing-unit.md`, `testing-e2e.md`.

## #12 Gate commands

```bash
npm run check                               # typecheck && lint && test; green → gate stamp
npm run status                              # branch, HEAD, ahead/behind origin/dev, dirty, PR + CI
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
  assignable to never"). Put such state and helpers in a `src/lib/` module. The pre-push hook
  builds for you when the pushed range touches `src/app/**` (below); CI builds only in the e2e job.

### Pre-push hook and gate stamp (`.githooks/pre-push` → `scripts/pre-push.mjs`)

Token audit 2026-10-03: `npm run check` ran ~285×/week, mostly re-checking a tree that had
already passed. So:

- A green `npm run check` (`scripts/check.mjs`) writes `<git common dir>/gate-ok-<tree>`;
  `<tree>` = `git write-tree` of the working tree as checked (tracked + untracked, minus
  `.gitignore`, via a throwaway index — your staging is untouched). No stamp on failure, nor
  when files changed during the run. The common dir is shared by all worktrees; stamps older
  than 14 days are pruned.
- pre-push, in order: (1) `npm run deps:check` always; (2) `npm run check` unless every pushed
  commit's tree (`git rev-parse <sha>^{tree}`) has a stamp; (3) `npx next build --webpack` when
  the pushed range touches `src/app/**` — range = remote tip..pushed sha, for a new branch
  merge-base with `origin/dev` (else `origin/main`); unknown range → build.
- Workflow: run `npm run check` on the final working tree, commit everything, push — the gate
  is skipped. Commit only part of it, or edit after the check → different tree → gate runs.
- Pure logic: `scripts/lib/gate.mjs` (tested); don't re-derive it in shell.

### Filtered gate output (hook, token audit 2026-10-03 Q5)

`.claude/hooks/filter-test-output.mjs` (PreToolUse/Bash, `.claude/settings.json`) rewrites a
plain `npm run check` / `npm test` / `npm run test` / `npx vitest run` / `npm run e2e` /
`npx playwright test` (optional `VAR=value` prefixes, plain or quoted args) into
`(set -o pipefail; <cmd> 2>&1 | node scripts/filter-test-output.mjs)`. Output = npm step
headers, failing test names + assertion/diff lines (≤20 per block, `… N more lines`), tsc
and eslint errors, Vitest/Playwright summaries. First line names the full log
(`$TMPDIR/claude-test-output/*.log`, pruned after 24 h) — read it there instead of rerunning.

- Exit code: `pipefail` carries the gate's; the filter always exits 0.
- Raw output: any operator opts out (`npm run check 2>&1 | cat`, `> /tmp/x.log`); so do
  `$VAR`, `$(...)` and other non-plain args. Pre-push hook output is not filtered.
- Coexists with `block-push-main.mjs` / `block-bash-writes.mjs`: hooks run in parallel on the
  ORIGINAL input (hooks docs), so `bashGuard` judges the command as written; the rewritten
  form also passes it (test). The hook returns `allow` only for these commands — deny/ask
  rules are still evaluated on the rewritten input.
- Logic: `scripts/lib/testOutputFilter.mjs` (pure), tests on real outputs in
  `scripts/lib/fixtures/test-output/` (green check, tsc, eslint, failing Vitest + jsdom DOM
  dump, failed suite, Playwright with retries). Format changed after a Vitest/Playwright/eslint
  bump → recapture the fixture, don't hand-edit it. Unrecognized output falls back to its
  last 60 lines.

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
CI (outside the fast `quality` job: one `e2e-<project>` matrix job per Playwright project, aggregated by the job named `e2e` — the name the ruleset requires, do not rename).

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
- **During UI work** run only `E2E_PORT=<free> npm run e2e -- --project=mobile-chromium e2e/<touched>.spec.ts`
  (the cheapest project, ~1/3 of the suite); the full 3-project run is CI's job, locally only before a risky push.
- Specs that render a map import `test` from `e2e/helpers/test.ts`: it caches OpenFreeMap style/tile responses
  per worker (real tiles, fetched once per worker instead of once per test). A test that blocks tiles
  with its own `page.route` still wins. Measured 2026-10-07: map.spec on mobile-chromium, 1 worker, 83 s → 77 s;
  per-test cost is CPU (software WebGL), not network — tests alone take ~1 s, the 5 s ones are sheet animations.
- `ponytail:` visual snapshots (`toHaveScreenshot`) skipped until a real visual regression.
