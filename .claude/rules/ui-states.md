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
- Data age on the PKP board/Pulpit („Aktualizacja … temu”, `BoardStatus` with `onRefresh`) is
  a button: `usePolling().refresh()` refetches now (no-op while a fetch is in flight, the
  refresh clock restarts). `/api/board` reads the poller snapshot — zero PKP cost (#3).
- Phone controls sit in ONE equal-width grid, `ActionGrid` (`src/components/ActionGrid.tsx`, ≥ 44 px
  rows, `col-span-*` for wider items): the board's tabs + „Info” today. Don't hand-lay another row of
  buttons; the station card's top row on phones is ← name ★ ⋮ (`FullBoard` `phoneBack`; „Więcej” =
  `BoardMoreMenu`: „Udostępnij”, „Informacje o stacji”; the page's `TopBar` gets `hideOnPhone`), so the
  name (h1, `PlaceTitle`) appears once. KPI tiles are not above the phone board — only in „Info”; their
  slot holds the one direction filter, `DirectionSelect` (options from row headsigns, 0 PKP requests). Budget: first board row ≤ 340 px from the top
  at 375×812 (`e2e/boards-mobile.spec.ts`); anything new above the board must pay for itself.
- Trivia (weather, city stats, KPI tiles, direction chips, status legend) lives below or in sheets on phones:
  weather = `WeatherChip` in `TopBar` (`city` prop; sheet on phones, `useDropdown` popover from `sm`).
- Phone layouts hide/compact things with responsive classes on ONE DOM (`max-sm:`), never a
  second copy of a widget — duplicate text breaks `getByText` and screen readers. Content that
  moves between places (board context: aside from `sm`, „Info” sheet on phones) renders in ONE
  place chosen by `useMediaQuery(SM_UP, true)` (`src/hooks/useMediaQuery.ts`) — a CSS-hidden
  copy still mounts a second MapLibre map and fetches.
