# UI copy glossary (Polish strings, English rule)

Why: the same idea was worded three ways („Błąd pobierania danych”, „Nie udało się pobrać…”,
„Brak danych”) and the same place two ways („słupek”, „przystanek”). A guard in
`src/components/designTokens.test.ts` ("UI copy") enforces the starred rules (★).

## Status words (#2, #7, #13)

- PKP delay status: „na czas”, „opóźniony”, „odwołany” — only on PKP data, from `realization.ts`.
- GTFS never says „na czas” or a delay (#13): „rozkład”, „wg rozkładu”, countdown „za N min · wg rozkładu”.
- ★ **Failed fetch** = „Nie udało się {pobrać|wczytać|odświeżyć} …” (+ what). Never „Błąd …” in
  user-visible text; „Błąd” is for internal `Error` messages and API JSON only.
- **Unknown value** = „brak danych” (a number we could not compute, `null`); **still loading** =
  „Wczytywanie…” (+ skeleton, `ui-states.md`); **nothing there** = „Brak …” + the thing
  („Brak odjazdów…”, „Brak zgłoszonych utrudnień…”). Three different states, three different words.
- **Weather** = „Pogoda” (chip in the city top bar, `WeatherChip`; details title „Pogoda dziś — {miasto}”).
  The chip name carries the state („Pogoda: 18°C, Bezchmurnie” / „Pogoda: wczytywanie…” / „Pogoda: nie
  udało się pobrać” / „Pogoda: brak danych lokalizacyjnych”); without a value there is no temperature (#7).
- **City stats** = „Statystyki” (collapsed line on phones); all four phone KPIs unknown = one line
  „Statystyki dnia: brak danych”.
- Missing platform/track on a PKP row = „—” per value, never 0 and never „nie podano”: phone card
  „Peron 2 · Tor 4”, „Peron — · Tor 4”, „Peron — · Tor —”; desktop cells show „—” lines.
- **PKP time column** (D1, `timePresentation()` in `boardTime.ts`, one source for the board and Start cards):
  the dominant time is the useful one with its source named next to it — „Faktycznie” (confirmed),
  „Przew.” (forecast), „Plan” (neither, or a cancelled row) — and a small „Plan HH:mm” line under it for
  fact/forecast, even when equal; the countdown rides on that line („Plan 14:48 · za 18 min”, or alone
  when the dominant time already is the plan). Never „Punktualnie” for an unconfirmed train (#2).
- PKP status pill on the board (`DelayBadge detailed`; the legend keeps the short `LABELS` „opóźniony”, „brak danych”): „Opóźnienie +12 min”, „odwołany”, „punktualnie”,
  and for an unknown status „Brak danych o realizacji” (not the legend word „brak danych”).
- Station board phone chrome: „Na mapie” (link from `useRailStations` coordinates; without them the plain
  text „Brak lokalizacji stacji”, a failed list „Nie udało się wczytać lokalizacji stacji”, never a dead control); disruption notice above the tabs „{n}
  utrudnienie|utrudnienia|utrudnień na stacji” (opens Info; only when there are messages — an unknown list
  is no notice, #7).
- **Context alerts** (`ContextAlerts`, GTFS only): loading „Wczytywanie komunikatów…”; ready and none „Brak komunikatów
  dla tego kontekstu”; failed with nothing to show „Nie udało się wczytać komunikatów”; failed with the last list
  „Nie udało się odświeżyć. Pokazujemy ostatnie dane”. Card: „Rozwiń komunikat” / „Zwiń komunikat”, link „Źródło komunikatu”, optional „Na mapie” (only when the consumer can resolve the line).
  No dates, severity or location (the feed has none); the tab count is `dedupeAlerts()` length, never `0` while unknown.
- Data age: „Aktualizacja {N} s temu”; stale after a failed refresh: „Nie udało się odświeżyć · dane z {HH:mm}”.

## Transit stop (`TransitStopDetail`, `TransitDepartureList`, GTFS only — #13)

- Tabs, in this order: „Odjazdy”, „Linie”, „Rozkład”, „Komunikaty” (URL `?tab=departures|lines|schedule|alerts`; the
  default is not written). Line filter chip „Wszystkie”; empty result: „Brak odjazdów linii {X} wśród najbliższych 50
  odjazdów.” + action „Wszystkie linie”; real empty: „Brak kolejnych odjazdów w rozkładzie na dziś i jutro.”.
- Departure row: big time + „wg rozkładu” (+ „za N min · wg rozkładu” inside the hour); never „na czas”, never a
  delay. Vehicle (GPS, not ETA): „Pojazd w pobliżu przystanku” at 0, „Pojazd: N {przystanek|przystanki|przystanków} dalej”,
  always with „GPS: {formatAgo}”; older than `HIDE_AFTER_SEC` (`mapData`, one threshold) = no vehicle chip. Never „zaraz będzie”.
- Header (phone): „Na mapie” = link with the post/group coordinates from the board (no GPS), or the text
  „Brak lokalizacji przystanku”; the map preview sits under the list in „Lokalizacja przystanku”.
- Alerts tab scope label: „Komunikaty linii obsługujących ten przystanek|zespół” („Komunikaty” before the board is
  known); shortcut above the list „{n} komunikat|komunikaty|komunikatów” (deduplicated, opens the tab).
- Unknown stop on a ready schedule: „Nie znaleziono przystanku” + link „Szukaj przystanku” (`/search`); a loading schedule is loading, not this.
- Alerts tab marker: a dot, accessible text „Komunikaty, {n}”; no separate „utrudnienia” wording (GTFS says „komunikaty”). Lines tab without a board: „Wczytywanie…” / „Nie udało się pobrać rozkładu.”; board without lines: „Brak linii w rozkładzie.”
- Map preview section heading: „Lokalizacja przystanku”; map region name „Mapa zespołu przystanków {name}” / „Mapa przystanku {name}”.
- Browser fetch age: „Pobrano {N s temu|przed chwilą}” (not the age of the source feed); stale after a failed refresh:
  „Nie udało się odświeżyć · dane z {HH:mm}” (city time zone).

## Transit line (`/city/[city]/line/[routeId]`, GTFS only — #13)

- Mode word from `MODE_LABEL[mode]` with `MODE_ICON` (never a hardcoded „Autobus”); h1 = the line's long name; in every
  non-ready state (loading, failed, unknown line) the h1 is „Przebieg linii”.
- Direction card: label „Kierunek”, the full headsign (wraps, never cut), „Od: {origin}” only when the origin is known;
  headsign fallback = the last stop of THAT direction, else „Kierunek nieznany” — never present the origin as the
  destination. Swap button „Zmień kierunek” (visible text; only with ≥ 2 directions).
- Segment „Widok linii”: „Trasa” / „Rozkład” (phones; from `lg` both panes show). Timetable pane: h2 „Rozkład”, capsule
  (`role=group`, „Wybrany rozkład”) = line badge · headsign · selected stop name, link „Odjazdy z przystanku”. Route rows:
  select button + separate chevron link named „Odjazdy z przystanku {name}”; „początek”/„koniec”, „Na żądanie”.
- Route pane heading (`LineRouteList`): „Trasa linii · N przystanków” (`pluralPl`: przystanek|przystanki|przystanków); legend under the
  list „przystanek” / „na żądanie” / „przystanek krańcowy”. Map section heading „Mapa trasy” (region name „Mapa trasy linii {line}”).
  Timetable status title (`ScheduleStatus`) „Rozkład jazdy linii {line}”. A repeated stop (loop) presses the row that was picked,
  not the first occurrence.
- Aside (xl, `AsideCard` „Linia {line}”): labels „Rodzaj”, „Kierunki”, „Przystanki”, „Pierwszy / ostatni” (first–last departure of the
  selected direction); card „Pojazdy w trasie — {headsign}” lists „#{side} za „{stop}” · {formatAgo}” (age only past 60 s).
  Vehicle ages anywhere on this screen go through `formatAgo`, never a hand-built „N min temu”; the axis marker has an
  sr-only name „Pojazd {side}, {formatAgo}” and no `title`. Breadcrumb tail is „Linia” until the long name is known (never the raw id).
- Vehicles row (one copy; the list stays in the aside card „Pojazdy w trasie — {headsign}”): „Pojazdy w tym kierunku: N” +
  „GPS: {formatAgo}”; loading „Wczytywanie pozycji…”; failed „Nie udało się pobrać pozycji.”; no position feed for the mode
  „Brak danych o pozycjach pojazdów” (the route and timetable stay); healthy zero „Brak pojazdów w tym kierunku.”; link
  „Pojazdy na mapie” (`/city/{city}/map?line={routeId}&dir={0|1}`); unknown direction (id 2): no `dir`, no fetch, text
  „Kierunek nieznany — pokazujemy pojazdy bez rozróżnienia kierunku.” „Failed” = a fetch error OR a `failed` feed state
  with no vehicles; „Brak danych o pozycjach pojazdów” is only for the other non-ready feed states (idle, no feed).
- Alerts: shortcut „{n} komunikat|komunikaty|komunikatów” (only when n > 0, scrolls to the section AND moves focus to it) and the `ContextAlerts`
  section with scope „Komunikaty linii {line}”; wording of the states as in „Context alerts” above.
- States: loading = skeleton + „Wczytywanie przebiegu linii…” (schedule loading: „Wczytywanie rozkładu…”); failed first fetch =
  „Nie udało się pobrać przebiegu linii.” + „Spróbuj ponownie” + link back to the catalog; unknown line = „Nie znaleziono
  linii” + „Wróć do katalogu linii”; no route = „Brak przebiegu tej linii.”. Age: „Pobrano … temu” (browser fetch) /
  „Nie udało się odświeżyć · dane z {HH:mm}”.
- URL: `?dir=<directionId>&stop=<stopId>&pane=timetable&day=…` (defaults not written; `day` is read only by the timetable
  screen), `replaceState` only — see `gtfs.md`.

## Page-level screens (`error.tsx`, `global-error.tsx`, `not-found.tsx`)

- Render error: title „Nie udało się wczytać tej strony” (`global-error`: „…aplikacji”), actions
  „Spróbuj ponownie” + „Wróć do Startu”. Never print `error.message`/`digest` (#4).
- 404: „Nie znaleziono strony” + „Wróć do Startu”.

## Train connection (`ConnectionDetails`, PKP only — PR5)

- Stop time = `describeStopTime()` (`stopTime.ts`, on top of `timePresentation()`): dominant time with its source
  label „Faktycznie” (confirmed) / „Przew.” (`<abbr title="Przewidywana">`) / „Plan”, small „Plan HH:mm” when the
  dominant time is not the plan. Departure rows say „Odjazd”, the terminal row „Przyjazd”; two times are never
  glued into an unlabelled range. „Przyjazd do celu” carries the same label; the meta tiles say „Odjazd (plan)” /
  „Przyjazd (plan)”.
- Platform and track are separate: „Peron 2 · tor 4”, „Peron 2”, „Tor 4”; both unknown = nothing in the row
  (not „—” on every stop); an empty or blank value counts as unknown.
- Age = „Pobrano {N s | N min | N h} temu” (`formatAgo`, from `lastSuccessAt`): when the BROWSER fetched, never the
  age of the PKP source (the response has no source time). The connection has its own failure form, besides the
  ones of `ContextAlerts` and the board data age: „Nie udało się odświeżyć — pokazujemy ostatnie dane” + „Spróbuj
  ponownie”. A finished journey keeps the neutral „Pobrano …”, no warning.
- First-fetch error (no snapshot): server wording only for actionable statuses (404 „Nie znaleziono połączenia”, 503
  rate limit); every other status = „Nie udało się pobrać szczegółów połączenia.” + „Ten widok nie ma zapisanej
  wcześniejszej wersji.” (never the server's „Błąd …”). Empty route = `role="status"` „PKP nie udostępnia teraz trasy
  tego połączenia.” under the h1, with the same two actions.
- Long route: „Pokaż całą trasę ({N} przystanków)” ↔ „Zwiń trasę” (`aria-expanded`, no fetch).
- Map: „Szacowana pozycja” (popup and caption) — never „na żywo”, „Live” or GPS wording for PKP; no marker and no
  caption when the resolver gives nothing. First-fetch error offers „Spróbuj ponownie” and „Szukaj stacji” (→ `/search`).

## Place words (`gtfs.md`)

- PKP: „stacja”. GTFS: bare name („Centrum”) = „zespół przystanków”; one stop = „przystanek {nr}”
  / „{name} {nr}” („Centrum 02”).
- ★ Never „słupek” for a stop (a calque; chart bars are „słupki” in comments only).
- Phone-only chrome is „Info” (button + sheet title „Informacje o stacji/przystanku”).

## Search (`UnifiedSearch`, `/search`, desktop dialog)

- Field label and placeholder: „Stacja, przystanek lub linia”; groups „Stacje kolejowe”, „Przystanki”, „Linie”.
- Row context: PKP „Stacja kolejowa PKP”; stop group „Zespół przystanków · {miasto}”; line „{Metro|Tramwaj|Autobus|Kolej miejska} · {miasto}”
  — GTFS rail is „Kolej miejska”, never „Stacja kolejowa PKP” (#13: it never opens a PKP connection).
- States: 1–2 characters „Wpisz co najmniej 3 znaki, aby znaleźć miejsca” (lines still listed); loading „Wczytywanie…” (glossary: still
  loading; never „Szukam…”); a failed source „Nie udało się wczytać {stacji kolejowych|przystanków|linii}” + „Spróbuj ponownie”; healthy zero
  results „Brak wyników dla tej frazy” (places searched, 3+ characters) — with 1–2 characters only lines were searched, so „Brak linii dla tej
  frazy”; neither is shown while a source loads or after a failure. Cap hint „Pokazano do 8 wyników — doprecyzuj frazę” (also at exactly 8 rows);
  offline „Brak połączenia — wyniki mogą być nieaktualne”.
- No city (stops and lines need one; PKP stations keep working): the city list loading „Wczytywanie miast…”; failed „Nie udało się wczytać
  listy miast” + the same „Spróbuj ponownie” (one button retries every failed source, then focus returns to the field); empty registry
  „Brak skonfigurowanych miast”. Never „Wybierz miasto…” — the app picks the city (URL, last used, default), the user is not asked.

## Filters

- Board direction select (phones): departures „Kierunek” / „Wszystkie kierunki”; arrivals (headsign =
  origin) „Skąd” / „Wszystkie stacje początkowe”. Desktop chip: „Kierunek: {name}”.
- Overflow menu ⋮ = „Więcej” (button and list name); its entries name the thing („Udostępnij”,
  „Informacje o stacji”).

## Action verbs

- The home screen is „Start” everywhere the user sees it (nav on phone and desktop, H1, breadcrumb, „Wróć do Startu”).
  Never „Pulpit” in visible text (guard in `designTokens.test.ts`); code identifiers (`PulpitPage`) and `localStorage`
  keys keep the old name. Decision 2026-10-10, `adr/0010`.
- Pin: accessible name „Przypnij do Startu” / „Odepnij ze Startu” (star icon, `ui-icons.md`); when a button shows a
  text label it is just „Przypnij” / „Odepnij”.
- Start: „Dodaj” = pin through the search dialog; „Edytuj ulubione” ↔
  „Gotowe”; „W górę: {name}” / „W dół: {name}”. Confirmations: „Przypięto do Startu: {name}”, „{name} jest już na
  Starcie”, „Odpięto ze Startu: {name}” + „Cofnij” (until „Gotowe”, no timer); a result that cannot be
  pinned: „Nie udało się przypiąć: {name}” (the failed-action pattern above).
- Navigation: „Wróć do {where}”, „Pokaż {what}”, „Zamknij {what}” (× buttons carry the object).
- Refresh is the data-age button, not a „Odśwież” button. In installed (standalone) mode it adds the visible hint „· dotknij, by odświeżyć”.
- Install (once, `InstallPrompt`): button „Zainstaluj aplikację” (Chromium); iOS hint „Zainstaluj aplikację: Udostępnij → Do ekranu początkowego”; lead-in for the button „Aplikacja zawsze pod ręką.”; close = „Zamknij podpowiedź instalacji”.

When a new string needs a word not listed here, add it here in the same PR.
