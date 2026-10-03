# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code (in a worktree: `../../../node_modules/next/dist/docs/` — `node_modules` lives in the main checkout). Heed deprecation notices.

# Delay monitor — project index and invariants

Public Next.js app (no auth): PKP train delays per station (PKP PLK API, key-limited) + urban
transit timetables from GTFS (Warsaw) with live vehicle positions and alerts. Single Railway
replica, state in memory. Product and architecture overview: `README.md` (Polish, public — no
internal details, limitations or roadmap); decisions: `adr/`.

**How this file works.** Numbered invariants `#N` are stable — code, CI, and `CHANGELOG` cite
"AGENTS.md #N". Each stub below holds the core rule; details live in `.claude/rules/<file>.md`.
Claude Code loads those automatically when you read matching files. **Other agents (Codex
etc.): read the linked rule file before changing code in its area.** General working rules
(process, review, tests, security, versioning) are global, in `~/.claude/CLAUDE.md` and
`~/.claude/rules/`.

## Repo map

| Path | What |
|---|---|
| `src/lib/pkp/` | PKP edge client (`client.ts`), Zod schema, time normalization, mock |
| `src/lib/board/` | poller, board transform, realization logic, station stats, caches |
| `src/lib/gtfs/` | GTFS domain: loader/index (`schedule.ts`), city registry, vehicles, alerts |
| `src/lib/weather/` | Open-Meteo edge client + pure formatting |
| `src/lib/validation.ts`, `urlState.ts`, `cache.ts`, `config.ts` | input patterns, URL view state, `createTtlCache()`, env schema |
| `src/app/(app)/` | pages (station, connection, city, lines, map) |
| `src/app/api/` | route handlers (board, train, gtfs/*, weather, health, …) |
| `src/components/`, `src/hooks/` | UI (flat, transport map in `components/map/`), client hooks; icons only via `components/icons.tsx` (`ui-icons.md`) |
| `fixtures/`, `data/` | mock payloads (PKP, GTFS per city), static station coordinates |
| `e2e/` | Playwright suite |
| `adr/` | architecture decision records (Polish) |
| `.github/workflows/` | CI (`ci.yml`), nightly contract (`contract.yml`), prod health (`health.yml`) |

## Commands

```bash
npm run dev            # mock mode, no key
npm run check          # typecheck && lint && test — pre-push gate
TZ=UTC npm run test    # time logic
npm run e2e            # UI changes
PKP_CONTRACT=1 npm run test -- contract       # PKP schema/query params
GTFS_CONTRACT=1 npm run test -- gtfs/contract # GTFS feed
```

## Invariants

### 1. No API time goes through bare `new Date()` → `pkp-time.md`
Zoneless PKP timestamps are Warsaw time; parse via `normalizeApiTimestamp()` (`src/lib/pkp/time.ts`)
at the Zod boundary. "Today" = `warsawDateString()`. `/schedules` "HH:mm:ss" read as strings.
Test also under `TZ=UTC`. Reached production once.

### 2. "Actual time" ≠ "already happened" → `pkp-board-data.md`
PKP copies planned time into `actual*` before departure. The only signal is `isConfirmed`, per
stop. All realization logic lives in `src/lib/board/realization.ts` — never duplicate it.
`hasTrainStartedFromStatus()` is the one deliberate `trainStatus` reader.

### 3. The PKP request budget is critical → `pkp-budget.md`
100/h and 1000/day; poller ≈ 40/h. Compute cost/h before adding any call (also outside the
poller: `/api/train`, `/api/network-stats`; the map's `/api/rail-stations/*` costs 0). Missing `X-RateLimit-*` =
"unknown", never "zero". New indicators: derive from data the poller already has.
Staging shares production's key as of 2026-10-01 (`deployment.md`) — keep staging QA short.

### 4. Input from outside the app is always hostile → `security.md`
Validate format at entry **and** encode before calling PKP; patterns only in
`src/lib/validation.ts`. Client input never decides upstream queries. `localStorage` via schema.
Bad URL params ignored silently. Security headers guarded by `next.config.test.ts`.

### 5. One replica, state in memory → `security.md`
No horizontal scaling. Long-lived caches use `createTtlCache()` (TTL + limit), never a bare `Map`.

### 6. Network only at the edges → `maps.md`
HTTP only in edge clients: `src/lib/pkp/client.ts`, `src/lib/weather/client.ts` and the GTFS feed
clients (`src/lib/gtfs/client.ts`, `vehicleClient.ts`, `alertClient.ts`); domain logic is pure.
Deliberate exception: map tiles from `tiles.openfreemap.org` (the only foreign CSP origin).
MapLibre traps (worker URL in prod builds, popup toggling, `pinsKey`, container positioning):
read `maps.md` before touching any map component.

### 7. UI is never empty → `ui-states.md`
Last good snapshot + age on failure. Three states for every number; `null` never renders as `0`.

### 8. Fixtures don't reflect live API scale → `testing.md`
15 hand-written trains with real station IDs — for UI, not for traffic inference. Check shapes
against the public swagger, not fixtures.

### 9. `/operations` and `/schedules` are not limited to "today" → `pkp-board-data.md`
Filter by `operatingDate`. Route lookup via `indexRoutesByTrain()`/`findRouteForTrain()`, never
`new Map(routes.map(...))`; counting iterates the raw route list.

### 10. The timetable defines the connection list, realization enriches it → `pkp-board-data.md`
Rows come from `/schedules`; a row without realization is normal ("unknown"). The
`BOARD_SOURCE` switch was removed 2026-09-23; `scheduleSource` is required.

### 11. `docs/` is not published → `deployment.md`
`docs/` is gitignored on purpose. Don't add it back.

### 12. Quality gate and flow → `testing.md`
local → `dev` → `main`: feature branch (worktree) → PR to `dev` (Railway staging, click-QA) →
PR `dev`→`main` (production). Never push a feature to `main`. `npm run check` before every push
(hook: `git config core.hooksPath .githooks`, set by `npm install`). Commits/PRs in English
(Conventional Commits). Language of files: agent-facing (this file, `.claude/rules/`, skills)
in English; human-facing (README, CHANGELOG, handoffs, ADRs) in Polish.

### 13. GTFS is a separate domain, not an extension of PKP → `gtfs.md`
No delay field anywhere — always „rozkład", never „na czas". GTFS IDs never go into outgoing
URLs; `city` validated against the registry. Load once, index at load. Many feed quirks
(`wheelchair_boarding`, depot runs, day categories): read `gtfs.md` before changing GTFS code.

### 14. Process for a change → global `~/.claude/CLAUDE.md`
Sized by change: trivial = fix + test + gate; normal/architectural = questions first, TDD,
gate, review + independent verification (`~/.claude/rules/verification.md`), proposals. Cite sources used in analysis
(swagger, GTFS schema, `node_modules/next/dist/docs/`, README, memory, handoffs).

### 15. Economy of context → global `~/.claude/rules/workflow.md`
Cost ≈ context size × turns (measured 2026-10-03: 83% of context tokens were in calls >200k).
- New topic or merged PR → handoff, then `/clear` or a new session. One PR per session.
- Big outputs never stay in context: CI logs via `gh run view --log-failed | tail -200`;
  browser checks via `read_page`/`get_page_text`, screenshots only when layout matters.
- Long automated runs (subagent-driven plans, many tasks): start with `/autocompact 300k` and
  keep progress in the plan file (see "Compact instructions" below).
- One fact lives in one file; others link to it (duplicated facts drift — `gtfs.md` did).
- Economy never suppresses questions or proposals (`~/.claude/rules/collaboration.md`).
- Subagents: a hook blocks Bash file writes and `git stash`/`reset`/`restore`/`checkout --`
  (`.claude/hooks/block-bash-writes.mjs`) — use Edit/Write or a WIP commit.

### 16. Automated UI tests (e2e) → `testing.md`
`npm run e2e`: Playwright, mock mode, zero network, projects `desktop-chromium`,
`mobile-chromium`, `mobile-safari`. New view/flow → smoke desktop+mobile + axe scan.

### 17. Plugins pinned in `.claude/settings.json`
Enabled for every session in this repo: `superpowers`, `ponytail`, `caveman`, `codex`.
Disabled here on purpose (0 uses in 7 days, measured 2026-10-03; duplicates of `impeccable`,
the handoff skill or the built-in browser): `taste-skill`, `ui-ux-pro-max`, `claude-obsidian`,
`playwright`, `playwright-skill`. User-level extras (not pinned here): `impeccable` (the one UI
plugin), `claude-mem`, `typescript-lsp`, `claude-md-management`, `railway`. First session after
cloning = one-time trust prompt for third-party marketplaces. Cost: every enabled plugin's skill
descriptions ride in every session and subagent start (~63–77k tokens of fixed prefix) — count
before enabling; narrow per session via `/plugin`. `.claude/settings.local.json` (gitignored)
for private overrides. Design-skill routing: `~/.claude/rules/frontend-ui.md`.

## Compact instructions

When compacting, keep: the plan file path and the current task, branch + HEAD SHA, open review
findings, user decisions from this session, failing test names. Drop: tool outputs, diffs, logs,
file contents (re-read them). Path-scoped `.claude/rules/*` are lost on compaction — re-read the
rule for the area you work in.

## Project skills

- `handoff` (`.claude/skills/handoff/`) — end-of-session handoff note in the main checkout's `docs/`.
