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
  - `/api/train` — synchronous fetch when clicking a train not yet seen, plus a background
    refresh while the connection page stays open (every 5 min + on focus/visibility, throttled
    to 90 s — same 90 s response cache makes a tighter poll pointless anyway). Layered caches
    (`createTtlCache()`): 90 s response cache (route.ts), 24 h route cache inside
    `getTrainDetail` (`client.ts` `fetchRoute` — the operation/realization call is never
    cached, only the static schedule route), 10 min "not found" cache for a PKP 404 so a
    repeated click on a dead link doesn't refetch. Hourly cache-miss cap: `HOURLY_MISS_CAP = 21`
    (module-state counter keyed by epoch hour, single replica — AGENTS.md #5). A cache hit, a
    remembered 404, or joining an already in-flight request never counts toward the cap or
    calls PKP; only starting a genuine new fetch does. The last `FOREGROUND_RESERVE = 7` misses
    of the hour are reserved for foreground requests (first load or a user-initiated retry —
    `background` query param absent or not exactly `'1'`); a background refresh (interval,
    focus, visibility — `background=1`) gets a 503 once the count reaches
    `HOURLY_MISS_CAP − FOREGROUND_RESERVE`, so a page left open in a background tab can't starve
    a new user's first click. Allowed background misses still count toward the same counter.
    Arithmetic: one miss costs 2 PKP requests when the 24 h route cache is already warm for
    that train (`/operations/train/...`, always uncached, + `getDisruptions(...)`, whose cache
    key is this train's own stations + a single day so it's effectively always a fresh call),
    but 3 when the route cache is cold (adds `/schedules/route/...`) — the same as a made-up
    scheduleId/orderId, which costs 2 (operation 404 + route 404, no disruptions call since
    `stationIds` is empty). OWNER DECISION (2026-09-27): the cap stays at 21 even though the
    worst case (all 21 misses cold, 3 requests each) is 21×3 + ~40 poller + ~7 network-stats ≈
    110/h, over the hard 100/h limit — accepted deliberately while a higher-limit PKP key is
    pending. If the key stays at 100/h, lower the cap to `floor((90 − 40 − 7) / 3) = 14`.
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
