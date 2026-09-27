---
paths:
  - "src/components/**"
  - "src/app/**/*.tsx"
  - "src/hooks/**"
---

# #7 UI is never empty (project specifics)

General rules: `~/.claude/rules/frontend-ui.md`.

On API failure show the last good snapshot + its age, don't clear the view. Failure = growing
data age, not a white screen. Error banner only for a configuration error (401).

- „brak wyników" ≠ „nie udało się sprawdzić". Numeric indicators have **three** states:
  loading / couldn't fetch / a concrete number. `null` in `StationStats`/`StationInsights` =
  "unknown", **never** rendered as `0` (a „0 pociągów" tile on a broken fetch lies like an
  empty board).
- **Exception** `/api/train`: no snapshot (one-off fetch) → explicit error message, not stale data.
- Weather: `available:false` = a permanent valid result (cached), not an error; only a
  network/5xx error from Open-Meteo gives the error state. Three states: loading / no location /
  weather.
- Network-status widget (`board/networkStats.ts`) keeps the last good value of each of its
  three sub-requests separately — one failing degrades only that one.
- Schedule-only data (#10): „PKP nie podaje dziś danych o ruchu", not an error state.
- GTFS: always „rozkład", **never** „na czas" (#13).
