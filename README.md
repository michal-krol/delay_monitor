# Monitor opóźnień

Aplikacja webowa, która w jednym miejscu pokazuje bieżącą sytuację na kolei w Polsce
i w komunikacji miejskiej: odjazdy i przyjazdy pociągów wraz z opóźnieniami, przebieg
połączeń przystanek po przystanku, rozkłady linii miejskich, pozycje pojazdów na żywo
oraz mapę transportu.

Dokument składa się z dwóch części: [opisu produktu](#część-i--opis-produktu)
i [dokumentacji technicznej](#część-ii--dokumentacja-techniczna).

---

# Część I — opis produktu

## Czym jest aplikacja

Monitor opóźnień odpowiada na pytanie „czy i kiedy dojadę”. Łączy oficjalne dane
o ruchu pociągów PKP Polskich Linii Kolejowych z rozkładami i pozycjami pojazdów
komunikacji miejskiej oraz uzupełnia je o kontekst: utrudnienia, pogodę na stacji
i położenie na mapie. Nie wymaga zakładania konta — przypięte do Pulpitu stacje zapamiętuje
przeglądarka.

## Główne możliwości

### Pulpit

Strona startowa zbiera przypięte stacje. Każda karta pokazuje najbliższe odjazdy
(godzina, przewoźnik, relacja, status) oraz liczbę opóźnionych pociągów. Obok
znajduje się widżet stanu sieci kolejowej w całym kraju: liczba pociągów w danym
dniu według statusu, punktualność, najczęstsi przewoźnicy i liczba zgłoszonych
utrudnień.

### Widok stacji kolejowej

- **Tablica odjazdów i przyjazdów** w oknie od kilku minut wstecz do trzech godzin
  naprzód: godzina planowa, czas rzeczywisty lub prognoza, pociąg z kategorią
  i przewoźnikiem, kierunek z głównymi stacjami pośrednimi, peron i tor oraz status
  z opóźnieniem w minutach.
- **Wskaźniki dnia**: liczba odjazdów i przyjazdów według rozkładu oraz średnie
  opóźnienie i punktualność (próg 5 minut), liczone z potwierdzonych przejazdów przez
  daną stację.
- **Kontekst**: najpopularniejsze kierunki z możliwością filtrowania tablicy,
  natężenie ruchu w ciągu doby, utrudnienia dotyczące stacji, pogoda i mapa
  lokalizacji.

### Szczegóły połączenia

Pełny przebieg pociągu przystanek po przystanku — z opóźnieniem ustalanym osobno dla
każdego przystanku, peronami, torami i powiązanymi utrudnieniami. Mapa trasy pokazuje
przebieg oraz szacowaną pozycję pociągu, wyznaczoną z rozkładu i ostatniego
potwierdzonego przystanku.

### Komunikacja miejska

Dla obsługiwanych miast (obecnie Warszawa):

- przegląd miasta: liczba kursów w danym dniu, pojazdy w trasie, aktywne utrudnienia;
- lista linii z filtrem środka transportu (metro, tramwaj, autobus, kolej miejska);
- strona linii: przebieg w obu kierunkach na mapie, oś przystanków z pojazdami
  w trasie oraz rozkład w podziale na dni robocze, soboty i niedziele ze świętami;
- strona przystanku: tablica odjazdów według rozkładu, z rozróżnieniem stanowisk
  w obrębie przystanku i oznaczeniem przystanków na żądanie;
- komunikaty o utrudnieniach przypisane do linii.

### Mapa transportu

Jedna mapa łączy stacje kolejowe z całego kraju z przystankami i pojazdami
komunikacji miejskiej. Umożliwia:

- wyszukanie stacji, przystanku lub linii;
- tryb linii — przebieg, kierunek, lista przystanków i wyłącznie pojazdy tej linii;
- śledzenie wybranego pojazdu;
- filtrowanie warstw i środków transportu, w tym wyświetlenie tylko linii
  z utrudnieniami;
- sprawdzenie stacji i przystanków w promieniu 500 m od wskazanego punktu wraz
  z najbliższymi odjazdami;
- udostępnienie bieżącego widoku mapy linkiem.

### Możliwości pomocnicze

- **Wyszukiwarka** stacji i przystanków, niewrażliwa na brak polskich znaków.
- **Link do każdego widoku** — stan strony (stacja, zakładka, filtr, kadr mapy)
  jest zapisany w adresie i może zostać przekazany dalej.
- **Tryb jasny i ciemny**, domyślnie zgodny z ustawieniem systemu.
- **Wersja mobilna** z nawigacją w wysuwanym menu i kartami dopasowanymi do telefonu.
- **Dostępność**: pełna obsługa klawiatury, semantyczne tabele, komunikaty dla
  czytników ekranu, uwzględnianie systemowego ustawienia ograniczenia animacji.

## Zasady prezentacji danych

- **Plan, prognoza i fakt są rozróżnione.** Godzina planowa jest zawsze widoczna;
  czas rzeczywisty pojawia się dopiero po potwierdzeniu przejazdu, a prognoza jest
  wyraźnie oznaczona.
- **Brak danych nie jest zerem.** Wskaźnik, którego nie udało się ustalić, jest
  oznaczony jako niedostępny, a nie jako wartość 0.
- **Komunikacja miejska według rozkładu.** Publiczne źródła nie udostępniają opóźnień
  pojazdów miejskich, dlatego aplikacja pokazuje rozkład i pozycję pojazdu, nie
  oceniając punktualności.
- **Ciągłość przy awarii źródła.** Gdy zewnętrzne API nie odpowiada, aplikacja
  prezentuje ostatnie poprawne dane wraz z informacją o ich wieku.

## Źródła danych

| Źródło | Zakres |
|---|---|
| PKP Polskie Linie Kolejowe — „Otwarte Dane” | rozkład, realizacja ruchu, utrudnienia, słowniki stacji i przewoźników |
| GTFS Warszawy — Zarząd Transportu Miejskiego w Warszawie, opracowanie: Mikołaj Kuranowski | rozkłady, przebiegi linii, pozycje pojazdów, komunikaty |
| Open-Meteo | pogoda dla stacji |
| OpenFreeMap / OpenStreetMap | podkład mapy |

---

# Część II — dokumentacja techniczna

## Stos technologiczny

- **Next.js 16** (App Router), **React 19**, **TypeScript**
- **Tailwind CSS 4**, `next-themes`
- **Zod 4** — walidacja danych zewnętrznych i konfiguracji
- **MapLibre GL JS** — mapy
- **Vitest** i Testing Library — testy jednostkowe i komponentów
- **Playwright** i axe-core — testy end-to-end i dostępności
- Node.js 24 (wersja zapisana w `.nvmrc`), obraz Docker, hosting Railway

## Architektura

```
Przeglądarka ──co 30 s──▶ /api/board ──▶ migawka w pamięci  ◀── co 90 s ──── poller ──▶ API PKP PLK
Przeglądarka ───────────▶ /api/gtfs/* ─▶ rozkład GTFS       ◀── raz na dobę ── feed GTFS
                                         pozycje pojazdów   ◀── co 15 s
                                         komunikaty         ◀── co 5 min
```

- **Niezależne rytmy.** Przeglądarka odpytuje wyłącznie serwer aplikacji, a serwer
  odpytuje źródła zewnętrzne według własnego harmonogramu. Liczba zapytań do PKP
  zależy od liczby oglądanych stacji, a nie bezpośrednio od liczby użytkowników.
- **Oszczędne korzystanie z limitu API.** Poller obejmuje tylko stacje, które są
  aktualnie oglądane, usypia po okresie bezczynności, śledzi godzinowy i dobowy limit
  klucza i zwalnia, zanim go przekroczy. Rozkłady i słowniki są buforowane, a trasy
  pociągów zapamiętywane na dobę.
- **Rozkład wyznacza listę połączeń, realizacja ją uzupełnia.** Wiersze tablicy
  powstają z rozkładu, a dane o ruchu dokładają opóźnienia i statusy. Brak danych
  o ruchu nie powoduje pustej tablicy.
- **Komunikacja sieciowa wyłącznie na krawędziach.** Połączenia z usługami
  zewnętrznymi obsługują osobne moduły klienckie (`lib/pkp/client.ts`,
  `lib/weather/client.ts`, klient GTFS); logika domenowa to czyste funkcje testowane
  bez sieci. Jedynym wyjątkiem są kafelki mapy, pobierane bezpośrednio przez
  przeglądarkę.
- **Jedna replika, stan w pamięci procesu** — decyzja opisana w
  [ADR 0001](adr/0001-jedna-replika-stan-w-pamieci.md).
- **Czas.** Znaczniki czasu z API przechodzą przez jedną funkcję normalizującą ze
  strefą `Europe/Warsaw`, a „dzisiaj” wyznacza funkcja uwzględniająca strefę. Wynik
  nie zależy od strefy procesu (produkcja działa w UTC).
- **Logi serwera** mają postać jednej linii JSON na zdarzenie, ze stałym kluczem
  `event` (`lib/log.ts`).

Decyzje architektoniczne są opisane w katalogu [`adr/`](adr/).

## Struktura repozytorium

```
src/
├── app/
│   ├── (app)/            strony: Pulpit, station, connection, city, lines, map
│   └── api/              endpointy: board, train, stations, search, weather,
│                         network-stats, rail-stations, cities, health, gtfs/*
├── components/           komponenty UI (mapa transportu w components/map/)
├── hooks/                hooki klienta (tablica, przypięte, pogoda, kontekst miasta)
└── lib/
    ├── pkp/              klient PKP PLK, schematy Zod, normalizacja czasu, tryb mock
    ├── board/            poller, budowa tablicy, realizacja i opóźnienia, statystyki
    ├── gtfs/             rejestr miast, ładowanie i indeksowanie rozkładu, pojazdy, komunikaty
    ├── weather/          klient Open-Meteo i formatowanie
    └── config.ts, validation.ts, urlState.ts, cache.ts, log.ts
data/                     współrzędne stacji kolejowych
scripts/                  regeneracja współrzędnych stacji
fixtures/                 dane trybu mock (PKP i GTFS)
e2e/                      testy end-to-end
adr/                      decyzje architektoniczne
```

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

Bez klucza API aplikacja uruchamia się w trybie mock: dane pochodzą z katalogu
`fixtures/`, a czasy są przesuwane względem bieżącej chwili. Mock zawiera przykładowe
linie każdego rodzaju, komunikaty o utrudnieniach i pozycje pojazdów; zmienna
`MOCK_BUDGET` (`low` lub `unknown`) pokazuje panel diagnostyczny przy niskim lub
nieznanym limicie zapytań. Tryb mock używa
prawdziwych identyfikatorów stacji, dzięki czemu przypięte stacje działają również po
przełączeniu na dane na żywo.

Aby pracować na danych na żywo, skopiuj `.env.example` do `.env.local` i ustaw
`PKP_API_KEY`. Klucz wydaje serwis PKP PLK „Otwarte Dane” (`https://pdp-api.plk-sa.pl`);
aplikacja jest dostosowana do poziomu Basic (100 zapytań na godzinę i 1000 na dobę).

## Konfiguracja

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PKP_API_KEY` | — | Klucz API PKP PLK; bez klucza tryb `auto` przełącza się na mock |
| `PKP_DATA_SOURCE` | `auto` | `auto` \| `live` \| `mock` |
| `POLL_INTERVAL_MS` | `90000` | Interwał pollera PKP |
| `INTEREST_TTL_MS` | `300000` | Czas bez wyświetleń, po którym stacja przestaje być odpytywana |
| `GTFS_ENABLED` | `true` | Włącza komunikację miejską |
| `GTFS_CITIES` | `warszawa` | Lista miast rozdzielona przecinkami |
| `GTFS_DATA_SOURCE` | `mock` | `mock` \| `live` |
| `GTFS_IDLE_TTL_MS` | `3600000` | Czas bezczynności, po którym przestają być odpytywane pozycje pojazdów i alerty miasta (rozkład zostaje w pamięci) |
| `GTFS_VEHICLE_POLL_MS` | `15000` | Interwał odczytu pozycji pojazdów |
| `GTFS_ALERT_POLL_MS` | `300000` | Interwał odczytu komunikatów |
| `PORT` | `3000` | Port serwera |

Konfiguracja jest walidowana schematem Zod (`src/lib/config.ts`); nieprawidłowa
wartość powoduje błąd walidacji przy pierwszym użyciu konfiguracji.
`PKP_DATA_SOURCE=live` wymaga klucza. `PORT` odczytuje bezpośrednio serwer Next.js.

## Wykorzystywane API PKP PLK

| Endpoint | Zastosowanie |
|---|---|
| `GET /api/v1/operations` | Realizacja ruchu na obserwowanych stacjach (z paginacją) |
| `GET /api/v1/operations/train/{scheduleId}/{orderId}/{operatingDate}` | Realizacja pojedynczego pociągu |
| `GET /api/v1/operations/statistics` | Statystyki dnia dla widżetu stanu sieci |
| `GET /api/v1/schedules` | Rozkład: przewoźnik, kategoria, perony, trasa, słowniki nazw |
| `GET /api/v1/schedules/route/{scheduleId}/{orderId}` | Planowa trasa pojedynczego pociągu |
| `GET /api/v1/schedules/routes/{date}` | Trasy dnia — przewoźnicy w widżecie stanu sieci |
| `GET /api/v1/disruptions` | Utrudnienia przy pociągach i stacjach oraz ogólnopolska liczba utrudnień |
| `GET /api/v1/dictionaries/*` | Słowniki stacji, przewoźników i kategorii handlowych |
| `GET /api/v1/data-version` | Wykrywanie wstrzymanej publikacji danych |

Publiczny schemat API: `https://pdp-api.plk-sa.pl/swagger/v1/swagger.json`.

## Testy i jakość

```bash
npm run check          # typecheck, lint i testy jednostkowe
TZ=UTC npm run test    # testy w strefie czasowej produkcji
npm run e2e            # testy end-to-end
```

- **Testy jednostkowe i komponentów** (Vitest) działają bez sieci i bez klucza API.
  Obejmują również scenariusze bezpieczeństwa i awarii źródeł danych.
- **Testy end-to-end** (Playwright) uruchamiają produkcyjny build w trybie mock na
  trzech profilach — desktop Chromium, Pixel 7 i iPhone 15 — wraz z automatycznym
  audytem dostępności (axe-core).
- **Testy kontraktowe** sprawdzają zgodność z publicznymi schematami PKP i GTFS:

  ```bash
  PKP_CONTRACT=1 GTFS_CONTRACT=1 npm run test -- contract
  ```

- **Bramka przed wypchnięciem zmian**: hook `.githooks/pre-push` uruchamia
  `npm run check`; `npm install` włącza go automatycznie.

### Ciągła integracja

| Workflow | Wyzwalacz | Zakres |
|---|---|---|
| `ci.yml` | pull request oraz push do `dev` i `main` | typecheck, lint, testy w strefach Europe/Warsaw i UTC, pokrycie kodu, testy end-to-end |
| `contract.yml` | codziennie | testy kontraktowe API PKP i GTFS |
| `health.yml` | co 30 minut | stan produkcji na podstawie `/api/health` |
| `claude-review.yml` | pull request do `dev` (z gałęzi tego repozytorium) i wzmianka `@claude` | automatyczny przegląd poprawności i bezpieczeństwa przez Claude Code, komentarze w kodzie |

Aktualizacje zależności proponuje Dependabot (npm, GitHub Actions, obraz Docker).

## Wdrożenie

- Dwa środowiska Railway: **staging** z gałęzi `dev` i **produkcja** z gałęzi `main`.
  Wdrożenie następuje automatycznie po każdej zmianie na gałęzi.
- Gałąź `main` przyjmuje zmiany wyłącznie przez pull request z pozytywnym wynikiem CI.
- Obraz jest budowany z `Dockerfile` (`output: 'standalone'`); proces działa bez
  uprawnień roota.
- Healthcheck: `GET /api/health`. Endpoint zwraca 200, dopóki proces może obsługiwać
  ruch, a stan źródeł danych opisuje w treści odpowiedzi — degradację można
  monitorować bez wymuszania restartów.

## Bezpieczeństwo

- Każde wejście spoza aplikacji — parametry adresu, `localStorage`, odpowiedzi usług
  zewnętrznych — jest walidowane schematem.
- Identyfikatory są sprawdzane na wejściu i kodowane przed wysłaniem do API;
  o treści zapytań do usług zewnętrznych nie decyduje klient.
- Limit zapytań do PKP jest chroniony po stronie serwera, a równoległe żądania
  o te same dane są deduplikowane.
- Zapytania o szczegóły połączeń mają własny limit godzinowy z rezerwą dla nowych
  wejść, więc nie wyczerpują limitu, z którego korzystają tablice odjazdów.
- Nagłówki bezpieczeństwa (CSP, HSTS, `frame-ancestors`, `Referrer-Policy`,
  `Permissions-Policy`) ustawia `next.config.ts`; ich zmianę kontroluje test.
- Sekrety są przechowywane wyłącznie w zmiennych środowiskowych.

## Wersjonowanie

Projekt stosuje [Semantic Versioning 2.0.0](https://semver.org/lang/pl/). Każde
wydanie od 1.0.0 ma tag `vX.Y.Z` i opis w [CHANGELOG.md](CHANGELOG.md), prowadzonym w formacie
[Keep a Changelog](https://keepachangelog.com/pl/1.1.0/). Zakres stabilności wersji 1.x
opisuje [ADR 0002](adr/0002-kryteria-wersji-1-0.md).

## Praca z agentami AI

[`AGENTS.md`](AGENTS.md) zawiera mapę repozytorium, komendy i niezmienniki projektu.
Szczegółowe reguły dziedzinowe znajdują się w `.claude/rules/` i są wczytywane podczas
pracy na odpowiednich plikach.

## Licencja

Kod: [MIT](LICENSE).

Logotypy przewoźników w `public/carriers/` są znakami towarowymi ich właścicieli, nie
są objęte licencją MIT i służą wyłącznie identyfikacji przewoźnika przy danych
o kursowaniu. Logo Kolei Śląskich (`public/carriers/ks.png`) pochodzi z Wikimedia
Commons i jest udostępnione na licencji
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.pl) (autor: FHrad);
pozostałe logotypy z Wikimedia Commons znajdują się w domenie publicznej.

Dane o ruchu pociągów pochodzą z serwisu PKP PLK „Otwarte Dane” i podlegają jego
warunkom. Dane komunikacji miejskiej: Zarząd Transportu Miejskiego w Warszawie,
opracowanie: Mikołaj Kuranowski. Podkład mapy: OpenFreeMap, © współtwórcy
OpenStreetMap (ODbL).
