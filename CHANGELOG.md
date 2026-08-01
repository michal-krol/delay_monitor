# Changelog

Format oparty na [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/).
Wersjonowanie semantyczne.

## [0.9.0] — 2026-08-02

Pierwsza wersja funkcjonalnie kompletna. Beta: przetestowana wyłącznie na
danych mock, bez weryfikacji na żywym kluczu API PKP PLK.

### Dodane

- Dashboard ulubionych stacji — karty z 3 najbliższymi odjazdami i licznikiem
  opóźnionych pociągów, wspólna linijka „Ostatnia aktualizacja".
- Pełna tablica stacyjna — do 20 pozycji w oknie 2 godzin, przełącznik
  odjazdy/przyjazdy, kolumny: pociąg, przewoźnik, kierunek, planowo, peron,
  status.
- Wyszukiwarka stacji — combobox z debounce 300 ms, od 3 znaków, obsługa
  klawiatury (strzałki, Enter, Escape), `aria-activedescendant`.
- Ulubione stacje w `localStorage` pod kluczem `pkp.favourites.v1`.
- Poller w tle (`lib/board/poller.ts`) — jedno zapytanie na wszystkie
  obserwowane stacje co 90 s, usypianie po 5 min ciszy, dławik 45 s na
  wymuszone przebiegi, spowolnienie do 5 min przy niskim budżecie dziennym.
- Kolumna „Przewoźnik" i kategoria handlowa z `/api/v1/schedules`
  (cache 24 h), logotypy dla IC, KM, SKM, ŁKA i Leo Express.
- Tryb mock bez klucza API — fixture'y z czasami przesuwanymi względem „teraz".
- Tryb jasny/ciemny przez `next-themes`, bez mignięcia przy ładowaniu.
- Endpointy `/api/board`, `/api/stations`, `/api/health`.
- Deployment na Railway (Dockerfile, `output: 'standalone'`, healthcheck na
  `/api/health`) oraz bramka jakości w GitHub Actions.
- 98 testów Vitest — transform, poller, klient, schematy, hooki, komponenty
  i endpointy.

### Zmienione

- Interfejs przeszedł na styl „glass" — półprzezroczyste powierzchnie
  z `backdrop-filter` i radialna poświata w tle.
- Wiek danych pokazywany raz globalnie na dashboardzie zamiast osobno na
  każdej kafelce.

### Naprawione

- Dławik 45 s na wymuszony przebieg pollera jest pomijany dla stacji, która
  nie ma jeszcze żadnych danych — pierwsze wejście na nową stację nie czeka.

### Znane ograniczenia

Lista w [README](README.md#znane-ograniczenia-09-beta).

### Wewnętrzne

- Katalog `docs/` (projekt techniczny i plan implementacji) przestał być
  śledzony przez git — pozostaje lokalnie.
