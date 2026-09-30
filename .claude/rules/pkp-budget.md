---
paths:
  - "src/lib/pkp/**"
  - "src/lib/board/**"
  - "src/lib/weather/**"
  - "src/app/api/**"
  - "src/hooks/**"
---

# #3 The PKP request budget is a critical resource

Basic key: 100/h **and** 1000/day. Poller @90 s ≈ 40/h — real headroom, not large.

- Don't add requests to the poller without computing the cost per hour.
- A new data source is cached by default; no cache = a deliberate decision.
- Missing `X-RateLimit-*` header = "unknown", never "zero" (treating it as zero once pushed the
  poller permanently onto the emergency interval).
- **One budget for all keyed requests.** The live client records the `X-RateLimit-*` headers of
  every response that carries the API key (`fetchJson` `onResponse`, before the status check —
  a 429's headers count) and exposes the lowest `hourly`/`daily` seen this clock hour via
  `PkpClient.getLastBudget()`; `null` = unknown, and a previous hour's value is dropped, not
  reused. `apiKey: null` public endpoints (dictionaries) are another pool and never update it.
  The poller takes `mergeBudgets(res.budget, client.getLastBudget())` (min remaining) for its
  interval, `PAGINATION_MIN_HOURLY_BUDGET` and `getBudget()`, so `/api/train`, `/schedules` and
  network-stats consumption is no longer invisible to it. The hour window is approximated by the
  clock hour; if PKP's window is rolling, the min can stay pessimistic until the hour changes.
- **Outside the poller cycle, count separately:**
  - `/api/train` — synchronous fetch when clicking a train not yet seen, plus a background
    refresh while the connection page stays open (`usePolling`, every 5 min on a visible tab
    only; a tick that fell due while the tab was hidden fires once on return; no fetch on window
    focus; a failed background refresh retries after 5 min — the 90 s response cache makes a
    tighter poll pointless anyway). Layered caches
    (`createTtlCache()`): 90 s response cache (route.ts), 24 h route cache inside
    `getTrainDetail` (`client.ts` `fetchRoute` — the operation/realization call is never
    cached, only the static schedule route), 10 min "not found" cache for a PKP 404 so a
    repeated click on a dead link doesn't refetch. Hourly cache-miss cap: `HOURLY_MISS_CAP = 21`,
    tracked in `src/lib/pkp/trainMissBudget.ts` (module-state counter keyed by epoch hour, single
    replica — AGENTS.md #5) — kept out of `route.ts` itself because a Next.js route module may
    only export route fields (`GET`, ...); a test-only export there broke `.next/types` and
    `next build`. A cache hit, a
    remembered 404, or joining an already in-flight request never counts toward the cap or
    calls PKP; only starting a genuine new fetch does. The last `FOREGROUND_RESERVE = 7` misses
    of the hour are reserved for foreground requests (first load or a user-initiated retry —
    `background` query param absent or not exactly `'1'`); a background refresh (interval,
    return-to-tab — `background=1`) gets a 503 once the count reaches
    `HOURLY_MISS_CAP − FOREGROUND_RESERVE`, so a page left open in a background tab can't starve
    a new user's first click. Allowed background misses still count toward the same counter.
    Arithmetic: one miss costs 2 PKP requests when the train's route is already known — from
    the national timetable snapshot (below) or the 24 h route cache (`/operations/train/...`,
    always uncached, + `getDisruptions(...)`, whose cache key is this train's own stations + a
    single day so it's effectively always a fresh call) — and 3 only when neither has it (no
    snapshot yet, e.g. right after a cold start, or a train missing from the timetable: adds
    `/schedules/route/...`); a made-up scheduleId/orderId costs 2 (operation 404 + route 404, no
    disruptions call since `stationIds` is empty). OWNER DECISION (2026-09-27): the cap stays at
    21 even though the old worst case (all 21 misses cold, 3 requests each) was 21×3 + ~40
    poller + ~7 network-stats ≈ 110/h, over the hard 100/h limit. With the snapshot serving
    routes the realistic worst case is 21×2 + ~40 + ~7 ≈ 89/h; the 110/h case remains only right
    after a restart. If the key stays at 100/h and that matters, lower the cap to
    `floor((90 − 40 − 7) / 3) = 14`.
  - **National timetable snapshot** (`getSchedules` in `client.ts`): ONE `/schedules` request
    without `stations` (whole country, today+tomorrow, `fullRoute=true`), valid 12 h and per
    date window → 2–3 requests/day regardless of users or stations. Measured 2026-09-29: 43 MB,
    9 014 routes, 161 k stops, ~1.4 s download, ~1.7 s parse+index (blocks the event loop once per
    refresh), ~125 MB heap raw / ~230 MB in the process (replica limit 8 GB, weekly max 1.8 GB).
    `getSchedules(stationIds)` only filters the in-memory index (`byStation`), so station ids
    never reach the PKP query (#4). A failed refresh keeps the last snapshot of the same window
    and retries after 10 min (not every poller tick, it is 43 MB). Do NOT add a per-station or
    per-set `/schedules` call — that was the old cache keyed by the union of everyone's stations,
    where any change to the set (even someone leaving) refetched everything.
  - `/api/rail-stations/list` + `/status` (nationwide rail layer of the map) — **0 PKP
    requests**: the list comes from `data/station-coordinates.json` (once per visit), statuses
    ONLY from `getSnapshot` of stations the poller already has — asked only while a station
    card is open, every 90 s. Never `registerInterest` — the country map would pull thousands
    of stations into the budget. `resolveCityRailStations()` (`/api/cities`) caches the
    station lookup per city for 10 min — including a failed lookup (`null` →
    `railStationsUnknown: true` in `/api/cities`).
  - `/api/network-stats` — `getOperationsStatistics` (15 min), `getDisruptionCount` (20 min),
    `getDailyCarrierCounts` (24 h), `getNameDictionaries` (shared). One global widget, cache in
    `board/networkStats.ts` → ~7/h regardless of traffic.
  - `/api/weather` → Open-Meteo, **not PKP** — zero PKP budget cost. Own cache 25 min/station +
    in-flight dedup.
- Station KPI tiles, „najpopularniejsze kierunki", traffic intensity, „przez…" in a row
  **cost 0 requests** — computed in the poller tick from what it already has: full-day
  `/operations` + `/schedules` routes (national snapshot, `fullRoute=true`). Arithmetic in
  `src/lib/board/stationStats.ts`, pure functions once per tick. New indicator → first check
  whether it can be computed from the same data.
