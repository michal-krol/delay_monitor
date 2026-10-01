---
paths:
  - "src/lib/gtfs/**"
  - "src/app/api/gtfs/**"
  - "src/app/*/city/**"
  - "src/app/*/lines/**"
  - "src/app/*/map/**"
  - "src/components/{Transit,Line,City,Alert,Mode}*"
  - "src/components/stopName*"
  - "src/components/map/**"
  - "src/components/transitMode*"
  - "fixtures/gtfs/**"
  - "e2e/gtfs-*"
---

# #13 GTFS is a separate domain, not an extension of PKP

`src/lib/gtfs/` lives next to the PKP layer and **inherits nothing from it**.

- **Zero delay field.** `src/lib/gtfs/types.ts` has no `delayMinutes`/`actualAt`/`predictedAt`,
  neither does any `/api/gtfs/*` response. Nobody publishes Warsaw urban delays (target,
  stage 5: vehicle positions). Missing field = control mechanism: the message is always
  „rozkład", **never „na czas"**.
- **Three independent rhythms:** PKP poller 90 s ↔ browser `/api/board` 30 s ↔ GTFS poller
  (once/day + idle TTL). GTFS loads **once** (~107 MB, ~3 s parse), then only from memory.
  `/api/gtfs/*` never wait — `ensureLoaded()` fire-and-forget, `getSchedule()` returns `null`
  until ready, the client retries. A failed load backs off server-side (30 s doubling to 1 h, reset on
  success or idle release, gate in `startLoad()`): client retries during the window don't refetch.
- **Warm-up at process start (`src/instrumentation.ts`).** `register()` (Node runtime only —
  `process.env.NEXT_RUNTIME === 'nodejs'`, dynamic import) calls `warmUpGtfsPollers()`
  (`gtfs/instance.ts`) fire-and-forget for every `enabledGtfsCities()`; it calls the poller's
  `preload()`, NOT `ensureLoaded()`: only the schedule load starts — no `onWake`, no
  `lastInterestAt`, no idle timer, so the vehicle/alert feeds are not polled with zero
  viewers (`ensureLoaded()` there polled the vehicle feed ~240×/boot) — owner decision: a
  configured city's schedule is resident from boot (~0.5 GB RSS accepted) instead of waiting
  for the first viewer. `register()` never awaits the load itself, only the (near-instant)
  dynamic import — Next.js requires `register()` to complete before the server serves.
  `createGtfsPoller`'s `keepSchedule` dep (set `true` for every poller created in
  `instance.ts`, since every poller there is for an enabled — i.e. warmed — city) keeps the
  schedule, `status` and the hourly `maybeRollDay` reload timer alive past `idleTtlMs`; only
  `onIdle()` still fires, so the vehicle/alert pollers stop without a viewer (no 24/7 upstream
  polling for those). `onWake` is fired ONLY from `ensureLoaded()` (a real viewer), never from
  the internal `startLoad()` that `maybeRollDay()` also calls — an unattended day-rollover
  reload of a kept schedule must NOT resurrect the vehicle/alert pollers (caught in review:
  wiring `onWake` into `startLoad()` made every idle-stopped warmed city's pollers restart
  forever at the next day boundary, with zero viewers). Module state (`pollers` Map) is
  shared between the instrumentation bundle and route handlers — verified empirically
  (`next build --webpack` + `next start`, `/api/health` before any GTFS request shows the
  warmed city loading/ready).
- **Feed fetch timeouts differ by feed.** Vehicles/alerts: 10 s for the whole request. Static
  feed range reads (`client.ts`): the timeout covers only time to response headers, not the
  streamed body — a 107 MB body can legitimately take longer than 30 s; a body stalling
  mid-stream is left to undici's default (accepted risk). Don't "fix" it back to
  `AbortSignal.timeout`.
- **City registry (`gtfs/cities.ts`) = the only place with per-city logic.** New city = one
  entry in `REGISTRY`, zero code (`cities.test.ts`). Slug = full name without Polish
  characters (`warszawa`, `krakow`), `[a-z]{2,24}`, fixture directory = slug. "wtp"/"ztm" don't
  exist outside that file and fixtures.
- **GTFS IDs (`stop`, `route`) never go into an outgoing URL** — they are in-memory `Map` keys.
  Trust boundary: `stopIndexById.get(id) === undefined` / `routeIndexById...` → `null` (200,
  not 400 — unknown-ID convention). Regexes `GTFS_STOP_ID_PATTERN` / `GTFS_ROUTE_ID_PATTERN` in
  `validation.ts` = cheap format guard. `city` **MUST** be checked against the registry — it
  selects the feed.
- **Colour = line category, never the feed.** One palette `LINE_PALETTE` / `lineColor(mode, kind)`
  in `src/components/transitMode.tsx` (metro yellow, tram, rail, bus, express, zone, local,
  night, replacement, other) drives `LineBadge` and the whole map (pins, vehicles, route and
  backbone overlays; `MODE_COLOR` is derived from it). `route_color`/`route_text_color` are
  not parsed at all (dropped 2026-10-01: no reader left) — no colour field in any `/api/gtfs/*`
  response. No category colour may equal a status colour (`transitMode.test.ts`). Yellow metro needs a
  dark outline/casing on the map (`strokeFor()` in `mapData.ts`). Callers without a kind derive
  it with `lineKindFrom(shortName, undefined)` — never a silent `'regular'`. Why: `adr/0005`.
  Kinds (`lineKindFrom`, ZTM convention): `N…` night, `Z…` replacement, `E…`/400–599 express,
  `L-n`/`L<digit>` local, 700–899 zone, `route_desc` keywords first. Labels: ONE
  `LINE_KIND_LABEL` in `transitMode.tsx`.
- **„Linie” page** (`/city/<city>/lines`, `LineGrid.tsx`): `<details>` sections per mode, bus
  subsections per kind (= colour legend). Open state `monitor.linesSections.v1`
  (`useSectionOpen`), recent lines `monitor.recentLines.v1` (`useRecentLines`, recorded by the
  line page only after its detail loaded) — both through Zod (#4). React fires `toggle` also
  for a programmatic `open` change: `setOpen(key, open, count)` skips writes equal to the
  current state, otherwise the first render would freeze the defaults.
- **`schedule.routePatterns`** (stop sequence per direction + second `offsets` from the first
  stop) accumulated in the hot `stop_times` loop — don't scan millions of events per line-page
  request. `lineDetail()` reads the ready index; the page computes a time as
  `start time + offsetSec`. We pick the **most frequent** pattern (line, direction), NOT the
  longest — the longest caught depot runs and detours (line 4: „Gocławek → Zjazd do zajezdni"
  instead of „Żerań Wschodni → Metro Wilanowska").
  **Don't go back to `points.length > existing.stops.length`.**
- **Technical trip = `exceptional=1` OR headsign `/zajezdn/i`** (`tripSchema`) — the WTP feed is
  sometimes inconsistent (depot run with `exceptional=0`, 2026-09-04). Doesn't feed
  `routePatterns` nor the `run*` index.
- **Day category** (`serviceCategory` → `schedule.tripCategory`): first a token in `service_id`
  (`PcS` weekday Mon–Thu, `SbS` Saturday, `NdS` Sunday/holiday, `PtS` Friday — WTP has a
  SEPARATE Friday timetable), then weekdays of the operating dates.
- **Day columns in the line timetable are NOT from the `[yesterday, today, tomorrow]` window.**
  The `run*` index in `schedule.ts` (one entry per trip, EVERY operating day, from the first
  stop) → `lineDeparturesFromRuns()` gives all categories regardless of the day — otherwise
  „Soboty"/„Niedziele" disappeared midweek. **Exception: metro** (`frequencies.txt`) has no
  `run*` → fallback `lineDeparturesFromEvents()` on CSR, so metro shows only categories from
  the window. `run*` iterated linearly per request (~35k, ~1 ms) — if it grows, a per-route index.
- **Stop group vs stop post.** `stopGroup(id)` ALWAYS returns the whole group, even when `id` is
  one post (`groupIdOf()`); then `requestedMemberId` carries that post (deep link from a line
  route → the switcher highlights it). `members` with `code` (`stop_code`), `street`
  (`street_name`), per-post `lines`. Narrowing only via explicit `/api/gtfs/board?member=<id>`
  — no auto-scope from `stopId`, otherwise „Cały przystanek" doesn't work on a deep link.
  `GtfsDeparture.stopCode` / `LineRouteStop.code` (fallback to `platform_code`) — the user sees
  which post it leaves from („Centrum" = 9 physically distant posts). `cleanGroupName()` is a
  NO-OP on the live feed, the mock uses it („Centrum 01").
- **`wheelchair_boarding` — the signal is `2`, not `1`.** WTP gives `1` (DEFAULT) on ~89% of
  posts, `2` (NOT accessible) on ~11%. `StopGroup.wheelchairNote` = `'inaccessible'` /
  `'partial'` / `null`; icon ONLY for `2`. **Don't flag `1`.**
- **Request stop** = `pickup_type`/`drop_off_type` = `3` in `stop_times`
  (`schedule.evOnRequest` → `GtfsDeparture.onRequest`).
- **The timetable defines the days `[yesterday, today, tomorrow]`** for the DEPARTURE BOARD
  (CSR) — problem #9 doesn't occur here (no realization feed), but "today" goes through
  `serviceDateWindow()` and the service-day index, not `new Date()`. `cityStats.hourly` counts
  TRIPS (first departure of a trip per hour), not events — `sum(hourly) === tripsToday`.
- **Vehicle positions (stage 5a).** `vehicles.json` (mkuran, ~450 KB, 15 s) → a separate
  `VehiclePoller` per city, lifecycle TIED to the timetable poller (`onWake`/`onIdle` in
  `GtfsPollerDeps`). `vehicleProject.ts` (pure) projects the feed's `trip_id` — the same as in
  `stop_times.txt` — onto `routePatterns` by stop sequence. `VehicleOnRoute` carries raw
  `lat`/`lon` from the feed NEXT TO `afterStopOrder`+`fraction` (the route map draws the vehicle
  at its real position, the line timeline still computes from the projection) — still ZERO delay
  field: never "how late". Position > 2 km from the route / unknown `trip_id` → `null`.
  `mockVehicleFeed` degrades to an empty result for a missing AND a corrupt fixture
  (JSON.parse in try).
- **Route shapes (`shapes.txt`).** The feed HAS `shapes.txt` (`shape_id` in `trips.txt` is
  sometimes filled) — an earlier note claiming it was missing was wrong. `schedule.ts`
  accumulates a shape ONLY for the winning pattern (line, direction) at load — never per
  request, never for unused `shape_id`s. Missing file / `shape_id` / <2 points → `null`, the
  line page then falls back to a polyline through stops (`MapRoute.points = stops`).
- **Transport map — zero new fetches.** `/api/gtfs/backbone` (metro and city-rail patterns
  from `routePatterns`) and `alertLines` in `/api/gtfs/city-vehicles` (line numbers with an
  active alert, `[]` while AlertPoller isn't ready = no badge) read only memory. Colour on the
  map = line category (`lineColor(mode, kind)`, `adr/0005`), never delay; the vehicle card shows position freshness, not
  „LIVE +N min".
- **Stops on the map (`/api/gtfs/stops`, `cityStops()`).** From `stops.txt` already in memory,
  computed once per schedule (`WeakMap`). Metro platforms collapsed to the parent station,
  rail-only stops skipped (rail = PKP layer). `CityVehicle.nextStop` from the `projectVehicle`
  projection — stop name, **no arrival time** (it would be timetable-based and pose as a
  prediction).
- **Alerts (stage 5b).** `alerts.json` (mkuran) → a separate `AlertPoller` per city, same
  lifecycle as `VehiclePoller` (`onWake`/`onIdle`, 5 min rhythm). The feed doesn't know stops —
  `alertsForRoutes()` matches by `route_short_name`, the only key shared with the timetable.
  ZERO delay field: `AlertRecord` carries only announcement text. `htmlbody` (foreign HTML)
  deliberately never parsed, rejected at the Zod boundary (`alerts.ts`); `link` passes only as
  `https://` (otherwise `''` — it goes into `<a href>` in `AlertBanner`, not a trusted feed).
  "Alerts known?" has ONE definition: `knownAlerts(poller, { requireFetch? })` in
  `alertPoller.ts` — never re-derive it from `getView().state` in a route. `null` = unknown
  (poller absent/`idle`/`loading`); `ready` → alerts; `failed` → last good alerts. The only
  variation is `failed` with no successful fetch yet (`ageMs === null`):
  - default (`/api/gtfs/line`, `/api/gtfs/board` per stop) → `[]`. Their clients retry while
    `alerts === null` and never see the feed state, so `null` there would poll a dead feed
    forever. The line page fetches once, so without `null` a warm schedule answered `[]` before
    the first alert fetch and the banner never appeared; `isLineLoading` retries while
    `alerts === null`, `useTransitBoard` on the ladder while any stop has `alerts === null`.
  - `requireFetch: true` (`/api/gtfs/city-stats` only) → `null`: numeric tile, #7, „0" must
    differ from „unknown". It also returns `alertFeed.{state,ageMs}`; `useCityStats` retries
    while `alerts == null` unless `alertFeed.state === 'failed'` (no polling a dead feed every
    15 s). Any `failed` feed (with or without last good data) re-polls slowly instead, every
    5 min (the `AlertPoller` retry rhythm, visible tab only; a still-`loading` schedule keeps the
    15 s ladder tail), via a result-driven `refreshMs` in `usePolling`, so a later recovery shows
    up and the stale age keeps growing. Deliberately not in `useLineDetail`/the line page: the
    line response is a list with no feed state (`failed` is indistinguishable from "no alerts"),
    and switching lines refetches anyway.
  `/api/gtfs/board` used to answer `[]` and wait for the 30 s refresh — the stop page's
  „Komunikaty" tab then claimed „Aktualnie brak komunikatów" for the first viewer after a wake
  (flaky e2e 2026-09-29).

Contract: `GTFS_CONTRACT=1 npm run test -- gtfs/contract` (network, no cost).
`GTFS_DATA_SOURCE=mock` (default) keeps dev/test/CI zero-network. Fixtures in
`fixtures/gtfs/<city>/` are plain `.txt`, no ZIP.
