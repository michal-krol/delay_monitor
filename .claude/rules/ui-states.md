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
- Data age on the PKP board/Start („Aktualizacja … temu”, `BoardStatus` with `onRefresh`) is
  a button: `usePolling().refresh()` refetches now (no-op while a fetch is in flight, the
  refresh clock restarts). `/api/board` reads the poller snapshot — zero PKP cost (#3).
- Phone controls sit in ONE equal-width grid, `ActionGrid` (`src/components/ActionGrid.tsx`, ≥ 44 px
  rows, `col-span-*` for wider items): the board's tabs + „Info” today. Don't hand-lay another row of
  buttons. ADR 0013 PR03: MobileHeader owns back/title/weather/page options; the station card owns its
  name (h1, `PlaceTitle`) and pin. Page options own theme/share/data sources; station information stays under „Info”. KPI tiles are not above the phone board — only in „Info”. Phone order:
  header card (+ „Na mapie” row) → disruption notice (only with messages) → sticky Odjazdy/Przyjazdy + „Info” →
  `DirectionSelect` (options from row headsigns, 0 PKP requests) → data age (`BoardStatus`) → rows.
  Budget (`e2e/boards-mobile.spec.ts`): at 375×812 the first two departures sit above the bottom bar with no
  notice showing; anything new above the board must pay for itself. „Na mapie” = coordinates from
  `useRailStations` (static list, 0 PKP, no weather); unknown location is text, not a control.
- ADR0013 PR08 station board: full station/train/carrier/destination names wrap. The station table uses a scoped card layout below30rem of available container width, including narrow desktop windows. Cards show the carrier and a local, initially collapsed „Przystanki pośrednie (N)” control; expansion exposes all supplied intermediate names without fetching, retaining keyboard focus. Wider tables show the intermediate names immediately. Preserve the normal phone first-two-departures budget.
- Transit line page (PR7): loading = skeleton (`aria-busy`, one h1 „Przebieg linii”, never „Nie znaleziono linii”); first-fetch error =
  retry + back to the catalog; a failed refresh keeps the route and turns „Pobrano … temu” into the warning. Four independent
  states, each with its own copy: schedule/route, vehicles (loading / failed / no feed for the mode / healthy zero), alerts
  (`deriveLineAlerts`: loading / failed / ready+[] / failed with the last list), and the age line. A failure in vehicles or
  alerts never hides the route or the timetable. `ready` + `line === null` is „Nie znaleziono linii”; zero stops is „Brak
  przebiegu tej linii.”, no crash.
- Connection (`ConnectionDetails`, PR5): loading = header + axis skeleton (`aria-busy`, one h1); first-fetch error =
  server message only for 404/503, else the generic one (`ui-copy.md`) + „Spróbuj ponownie” (`usePolling().refresh()`, foreground, bounded by the server's 90 s cache and
  miss cap) + „Szukaj stacji”; empty `stops` = „PKP nie udostępnia teraz trasy…” (`role="status"`, h1 + the same two actions; not a finished journey); a failed
  refresh keeps the route and turns the age line „Pobrano … temu” into the warning. A finished journey shows the age
  neutrally. Collapsing/expanding the route (> 8 stops, `routeWindow.ts`) is local state — no fetch (#3).
- Start (PR11, `/`): pins loading = skeleton under „Moje miejsca” (never „Nie masz miejsc”); empty = one instruction + „Znajdź miejsce”;
  each card keeps its own state (a failed city card never hides the others; PKP cards share ONE `useBoard`, city cards one `useTransitBoard` each —
  a width/theme change adds no request). Mode glyphs come from board data (`stopModes`), unknown = neutral stop glyph, never a bus. GPS only on the
  click of „W pobliżu mnie”; nothing is read on render and nothing is shown before the click. `NetworkStatsCard` mounts once in the Start CSS grid: below places/history by default, right column
  from `xl`. Initially collapsed on every width; expanding, resizing and changing theme preserve the instance and add no fetch.
- Trivia (weather, city stats, KPI tiles, direction chips, status legend) lives below or in sheets on phones:
  weather = presentational `WeatherChip`: MobileHeader on phones, TopBar on desktop. CityWeatherChip owns city
  weather; FullBoard/ConnectionDetails own station/origin weather and publish the same result through pageHeader.
  Embedded boards consume host weather without fetching; opening details or changing width/theme adds no request.
  The phone Info sheet does not repeat weather. --header-h tracks measured header height, including safe area.
- Phone layouts hide/compact things with responsive classes on ONE DOM (`max-sm:`), never a
  second copy of a widget — duplicate text breaks `getByText` and screen readers. Content that
  moves between places (board context: aside from `sm`, „Info” sheet on phones) renders in ONE
  place chosen by `useMediaQuery(SM_UP, true)` (`src/hooks/useMediaQuery.ts`) — a CSS-hidden
  copy still mounts a second MapLibre map and fetches.
