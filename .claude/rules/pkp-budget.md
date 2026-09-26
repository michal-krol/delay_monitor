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
  - `/api/train` — synchronous fetch when clicking a train not yet seen, own 90 s cache
    (`createTtlCache()`).
  - `/api/rail-stations` — polled every 90 s by EVERY open city-map tab (automatic, cyclic,
    unlike `/api/cities`, called once per page load). `resolveCityRailStations()`
    (`board/railStations.ts`) caches the station lookup per city for 10 min — including `[]`
    after a station-dictionary failure, otherwise a sustained failure would retry every poll
    instead of once per TTL.
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
