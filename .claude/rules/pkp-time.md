---
paths:
  - "src/lib/pkp/**"
  - "src/lib/board/**"
  - "src/lib/gtfs/**"
  - "src/lib/**/*time*"
---

# #1 No API time goes through bare `new Date()`

`/operations` sometimes returns a timestamp without a zone (`"2026-08-02T00:33:00"`). It is
Warsaw time, but `new Date()` reads it in the **process** zone: fine locally in PL, shifted by
1–2 h in the Railway container (UTC). This reached production once.

- The four time fields (`plannedArrival`, `plannedDeparture`, `actualArrival`,
  `actualDeparture`) go through `normalizeApiTimestamp()` from `src/lib/pkp/time.ts`, at the
  Zod boundary. A new time field from the API → wire it there too.
- "Is it today": `warsawDateString()`, never `new Date().toISOString().slice(0,10)`.
  Station stats filter out tomorrow by `operatingDates` (the `/schedules` window is
  today+tomorrow); otherwise a UTC process after 22:00 counts tomorrow's timetable as today.
- Times from `/schedules` (`departureTime`, `"HH:mm:ss"`) are already Warsaw time — read them
  from the string, not through `Date`.
- Also test under `TZ=UTC npm run test` (mirrors production).
- GTFS: "today" goes through `serviceDateWindow()` and the service-day index, not
  `new Date()` (see `gtfs.md`).
