---
paths:
  - "src/lib/board/**"
  - "src/lib/pkp/**"
  - "src/components/ConnectionDetails*"
  - "src/components/Board*"
  - "src/components/FullBoard*"
  - "src/components/Station*"
---

# PKP board data: realization, date ranges, schedule-first (#2, #9, #10)

## #2 "Actual time" ≠ "already happened"

Before departure, PKP may put a **copy** of the planned time into
`actualArrival`/`actualDeparture`, hours in advance (observed: R1 91342, Koleje Mazowieckie,
`trainStatus: "S"`). Code treating `actualAt !== null` as proof of realization shows such a
train as on time — this reached the main board once.

- The only reliable signal: `isConfirmed`, **per stop**, not per train (`trainStatus`).
- All "did it happen and how late" logic lives in one place: `src/lib/board/realization.ts`
  (`resolveStopStatus`, `resolveDelayMinutes`), used by `board/transform.ts`,
  `board/trainDetail.ts`, `ConnectionDetails.tsx`. Don't duplicate — two implementations once
  drifted apart between the board and the panel.
- **Exception:** `hasTrainStartedFromStatus()` in the same file *deliberately* reads
  `trainStatus` (`P`/`C`) — only for "has the train as a whole started anywhere", to show
  „w trasie" instead of „jeszcze nie wyjechał". It is not per-stop (that is still
  `isConfirmed`) and does not change delay computation. Don't break this.

Countdown „za N min” (PR4) adds no delay logic: `expectedAt()` in `src/components/boardTime.ts`
takes the realized time the board already shows (`realizedTime()`: fact, else forecast, else
plan) and `countdownLabel()` (`src/lib/countdown.ts`, the one countdown for PKP and GTFS) turns
it into text. Cancelled rows never count down.

What the time column shows (D1, 2026-10-10, reverses the earlier "plan big" decision): `timePresentation()`
in the same file returns the dominant time (`fact` = confirmed `actualAt` + `delayMinutes` → „Faktycznie”,
else `forecast` = `predictedAt` → „Przew.”, else `plan`; a cancelled row is always `plan`), the plan time
for the small „Plan HH:mm” line (present for fact/forecast, even when equal) and the countdown. It only
reads `realizedTime()`: an `actualAt` copied from the plan without a confirmed delay is still no fact (#2).
Board (`TimePair`) and Start cards (`TimePair compact`) share it; PR5 (connection) and PR11 (Start) reuse it.

## #9 `/operations` and `/schedules` are not limited to "today"

Verified live (Warszawa Zachodnia, 2026-08-28): one `/operations?stations=…&withPlanned=true`
response carried trains from **5 operating days** at once (the endpoint takes no date). Any
"today" computation from it (`stationStats.ts`, `computeStationRealization`) must filter
`train.operatingDate === todayIsoDate` — otherwise the tile „z potwierdzonych dziś przejazdów"
showed last week's average (worse than no data, because it looks credible — #7).

Second trap: `/schedules` (`fullRoute=true`) returns **a separate route record per operating
day** of the same run — same `trainOrderId`, different `orderId`, sometimes different
platforms. A plain "last one wins" `Map` kept the wrong day's record in ~13% of cases even
though today's existed. `indexRoutesByTrain()` / `findRouteForTrain()` in `board/routeKey.ts`
fix this (variant per run+day + a dateless fallback, exact day first).
`new Map(routes.map(...))` is blocked by lint (`no-restricted-syntax`, `eslint.config.mjs`). Counting (as opposed to
finding one route) iterates the poller's **raw route list**, not the index — the index
collapses variants and undercounts.

## #10 The timetable defines the list of connections, realization enriches it

Counter-intuitively: board rows come from the **timetable** (`/schedules`); realization
(`/operations`) adds delay, status, actual time to existing rows. Measured reason:
27–31.08.2026 the realization feed returned only runs from days before for 5 days (HTTP 200,
good shape, wrong day) — the old order (list from realization) showed emptiness although the
timetable knew everything. Warszawa Centralna: 26.08 realization 392 / timetable 394; 27.08
307 / 394 — **22% of trains without a row**.

When changing `board/transform.ts`:

- Matching by `scheduleId-trainOrderId|operatingDate` covers 100% both ways. Realization runs
  without a route are appended anyway (`collectRowSources`) — insurance, not a real case.
- A row without matched realization is **normal**. `stop: null` in `RowSource` passes through
  `resolveDelayMinutes`/`resolveStopStatus` unchanged → "unknown". No workarounds.
- Message (#7): "we have times, we don't know delays" ≠ "fetch failed". The poller reports
  `degraded` + `realizationStale: true`, the board says „PKP nie podaje dziś danych o ruchu".

The `BOARD_SOURCE` switch (fallback to a realization-driven list) was removed 2026-09-23 after
two weeks of healthy feed. `scheduleSource` in `transformOperations()` is required; the
realization-only list is now just the fallback in `collectRowSources`.
