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
- „nie podano” = the source gave no value for an optional field (platform, track) — not an error.
- Data age: „Aktualizacja {N} s temu”; stale after a failed refresh: „Nie udało się odświeżyć · dane z {HH:mm}”.

## Page-level screens (`error.tsx`, `global-error.tsx`, `not-found.tsx`)

- Render error: title „Nie udało się wczytać tej strony” (`global-error`: „…aplikacji”), actions
  „Spróbuj ponownie” + „Wróć do Pulpitu”. Never print `error.message`/`digest` (#4).
- 404: „Nie znaleziono strony” + „Wróć do Pulpitu”.

## Place words (`gtfs.md`)

- PKP: „stacja”. GTFS: bare name („Centrum”) = „zespół przystanków”; one stop = „przystanek {nr}”
  / „{name} {nr}” („Centrum 02”).
- ★ Never „słupek” for a stop (a calque; chart bars are „słupki” in comments only).
- Phone-only chrome is „Info” (button + sheet title „Informacje o stacji/przystanku”).

## Action verbs

- Pin: „Przypnij do Pulpitu” / „Odepnij z Pulpitu” (star icon, `ui-icons.md`).
- Navigation: „Wróć do {where}”, „Pokaż {what}”, „Zamknij {what}” (× buttons carry the object).
- Refresh is the data-age button, not a „Odśwież” button. In installed (standalone) mode it adds the visible hint „· dotknij, by odświeżyć”.
- Install (once, `InstallPrompt`): button „Zainstaluj aplikację” (Chromium); iOS hint „Zainstaluj aplikację: Udostępnij → Do ekranu początkowego”; lead-in for the button „Aplikacja zawsze pod ręką.”; close = „Zamknij podpowiedź instalacji”.

When a new string needs a word not listed here, add it here in the same PR.
