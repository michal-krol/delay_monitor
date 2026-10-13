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
  (not „—” on every stop; the phone board card, which has few rows, keeps its „—”).
- Age = „Pobrano {N s | N min | N h} temu” (`formatAgo`, from `lastSuccessAt`): when the BROWSER fetched, never the
  age of the PKP source (the response has no source time). After a failed refresh: „Nie udało się odświeżyć —
  pokazujemy ostatnie dane” + „Spróbuj ponownie”. A finished journey keeps the neutral „Pobrano …”, no warning.
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
