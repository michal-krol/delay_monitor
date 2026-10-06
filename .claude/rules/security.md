---
paths:
  - "src/app/api/**"
  - "src/lib/validation.ts"
  - "src/lib/urlState.ts"
  - "src/hooks/**"
  - "src/components/ThemeToggle*"
  - "src/lib/cache.ts"
  - "next.config*"
---

# #4 Input from outside the app is always hostile (project specifics)

General rules: `~/.claude/rules/security.md`. Public app, no auth. URL params, `localStorage`,
PKP responses = data from outside the system.

- Station IDs: format validation at the entry **and** encoding before the PKP request (without
  encoding, `stations=5100&pageSize=5000` appended parameters to someone else's request).
  Patterns live in `src/lib/validation.ts` — don't duplicate regexes.
- Nothing from the client decides what we ask PKP. Unknown IDs never reach the poller.
- Parse `localStorage` with a schema, not `JSON.parse(x) as T` (once gave a white page).
- Cache checked before `await` and written after = race. Deduplicate in flight.
- View state from the URL (`src/lib/urlState.ts`): a bad param is silently ignored, never a
  render failure. `patchUrlParams()` reads the current `window.location.search` and patches —
  it doesn't build from scratch (several modules write to the same URL).
- Link-preview cards and page titles (`src/lib/share/`) take names ONLY from the station dictionary
  and the loaded GTFS schedule, by route params — never `?name=` or other URL text; unknown or
  malformed id → generic card. `?name=` is display-only inside the client pages.
- Security headers from `next.config.ts` are guarded by `next.config.test.ts` — weakening the
  policy = update the test.
- Deliberately accepted risks and their rationale are kept out of the public README, in the
  main checkout's gitignored `docs/security-accepted-risks.md`. Adding or removing one =
  update that file. The README states principles only, never known weaknesses.

# #5 One replica, state in memory

Two replicas = two pollers = double quota use. Horizontal scaling deliberately excluded;
snapshots and the station-name registry live in process memory. Don't assume shared state.
Caches in a long-lived process must have a TTL and an entry limit → `createTtlCache()` from
`src/lib/cache.ts`, not a bare `Map`.
