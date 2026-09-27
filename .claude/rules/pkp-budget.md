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
- **Outside the poller cycle, count separately:**
  - `/api/train` — synchronous fetch when clicking a train not yet seen. Layered caches
    (`createTtlCache()`): 90 s response cache (route.ts), 24 h route cache inside
    `getTrainDetail` (`client.ts` `fetchRoute` — the operation/realization call is never
    cached, only the static schedule route), 10 min "not found" cache for a PKP 404 so a
    repeated click on a dead link doesn't refetch. Hourly cache-miss cap: 21 (module-state
    counter keyed by epoch hour, single replica — AGENTS.md #5). A cache hit, a remembered
    404, or joining an already in-flight request never counts toward the cap or calls PKP;
    only starting a genuine new fetch does. Arithmetic: one miss in steady state costs 2 PKP
    requests — `/operations/train/...` (always, uncached) + `getDisruptions(...)` (its cache
    key is this train's own stations + a single day, so it's effectively always a fresh
    call; the `/schedules/route/...` call is 0 in steady state, since the 24 h route cache
    is warm after the first-ever miss for that train). Target ≤ 90/h worst case (10 below
    the hard 100/h limit) minus the poller (~40/h) and `/api/network-stats` (~7/h):
    `floor((90 − 40 − 7) / 2) = 21`.
  - `/api/rail-stations/list` + `/status` (nationwide rail layer of the map) — **0 PKP
    requests**: the list comes from `data/station-coordinates.json` (once per visit), statuses
    ONLY from `getSnapshot` of stations the poller already has — asked only while a station
    card is open, every 90 s. Never `registerInterest` — the country map would pull thousands
    of stations into the budget. `resolveCityRailStations()` (`/api/cities`) caches the
    station lookup per city for 10 min — including `[]` after a dictionary failure.
  - `/api/network-stats` — `getOperationsStatistics` (15 min), `getDisruptionCount` (20 min),
    `getDailyCarrierCounts` (24 h), `getNameDictionaries` (shared). One global widget, cache in
    `board/networkStats.ts` → ~7/h regardless of traffic.
  - `/api/weather` → Open-Meteo, **not PKP** — zero PKP budget cost. Own cache 25 min/station +
    in-flight dedup.
- Station KPI tiles, „najpopularniejsze kierunki", traffic intensity, „przez…" in a row
  **cost 0 requests** — computed in the poller tick from what it already has: full-day
  `/operations` + `/schedules` routes (24 h cache, `fullRoute=true`). Arithmetic in
  `src/lib/board/stationStats.ts`, pure functions once per tick. New indicator → first check
  whether it can be computed from the same data.
