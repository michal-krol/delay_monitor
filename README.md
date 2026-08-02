# Monitor opóźnień PKP

**Wersja 0.9 beta** — funkcjonalnie kompletna, gotowa do testów na żywym kluczu
API. Lista znanych ograniczeń: [sekcja niżej](#znane-ograniczenia-09-beta).

Aplikacja webowa pokazująca opóźnienia pociągów na wybranych stacjach w czasie
zbliżonym do rzeczywistego. Zapisujesz ulubione stacje, widzisz je razem na
dashboardzie i rozwijasz dowolną do pełnej tablicy stacyjnej.

Skala: użytek własny, kilka osób. Bez kont użytkowników, bez bazy danych.

## Funkcjonalność

- **Dashboard ulubionych** — karty z nazwą stacji, 3 najbliższymi odjazdami
  (przewoźnik + logo, relacja, status) i licznikiem opóźnionych pociągów. Nad
  siatką kart jedna wspólna linijka „Ostatnia aktualizacja". Karty ładują się
  z pamięci serwera, nie z API PKP, więc pojawiają się natychmiast. Stację
  usuwa się z ulubionych krzyżykiem na kafelce, bez rozwijania tablicy.
- **Wyszukiwarka stacji** — combobox z podpowiedziami (debounce 300 ms, od
  3 znaków, maks. 10 wyników), pełna obsługa klawiatury (strzałki, Enter,
  Escape). Ignoruje polskie znaki, więc „wroclaw" znajduje „Wrocław Główny".
  Rozróżnia „szukam", „brak stacji o tej nazwie" i „nie udało się pobrać
  listy" — nie chowa awarii pod pustą listą.
- **Pełna tablica stacyjna** — do 20 najbliższych pozycji w oknie 2 godzin,
  przełącznik odjazdy/przyjazdy, kolumny: pociąg, przewoźnik, kierunek,
  planowo, peron, status. Dodawanie/usuwanie z ulubionych jednym kliknięciem.
- **Przewoźnik i kategoria** — dociągane z `/api/v1/schedules` (cache 24 h)
  i łączone z realizacją po parze `scheduleId-orderId`. Dla pięciu
  przewoźników (IC, KM, SKM, ŁKA, Leo Express) pokazujemy logo.
- **Status opóźnienia** — `onTime` / `delayed` / `cancelled` / `unknown`,
  zawsze opisany tekstem (np. „+12 min"), nigdy samym kolorem.
- **Tryb jasny/ciemny** — automatyczny wg preferencji systemowej, przez
  `next-themes`, bez mignięcia przy ładowaniu.
- **Ulubione stacje w `localStorage`** — klucz `pkp.favourites.v1`,
  przechowywane lokalnie w przeglądarce, przetrwają odświeżenie strony.
- **Tryb mock bez klucza API** — UI działa od razu po
  `npm install && npm run dev`, dane pochodzą z `fixtures/` z czasami
  przesuniętymi względem „teraz".
- **Odporność na błędy** — przy awarii API (401, 429, 5xx, timeout, błąd
  walidacji) poller zachowuje ostatni znany dobry snapshot i serwuje go dalej
  zamiast czyścić widok. Baner ostrzegawczy pojawia się tylko przy błędzie
  konfiguracji (zły/brak klucza — HTTP 401).
- **Widoczny stan danych** — linijka nad tablicą mówi nie tylko, kiedy była
  ostatnia aktualizacja, ale też gdy dane mają 3+ minuty („dane sprzed 7 min"),
  gdy API nie odpowiada i gdy odświeżanie zostało ograniczone przez limit
  zapytań (z pozostałym budżetem dobowym w tooltipie).
- **Dostępność** — tablica jako semantyczny `<table>` z `<caption>` i `scope`
  na nagłówkach, `aria-live="polite"` tylko na linijce statusu (nie na całej
  tablicy), combobox z `aria-expanded`/`aria-activedescendant`, widoczny focus.
- **Świadomość limitów API** — poller w tle pilnuje budżetu zapytań i sam
  spowalnia się, zanim limit zostanie przekroczony (patrz sekcja niżej).

## Struktura projektu

```
src/
├── app/
│   ├── api/{board,stations,health}/route.ts   endpointy HTTP
│   ├── layout.tsx                              ThemeProvider, tło
│   └── page.tsx                                strona główna
├── components/                                 UI (React)
│   ├── Dashboard, StationCard, FullBoard
│   ├── StationSearch, EmptyState, BoardStatus
│   └── DelayBadge, CarrierLogo, ConfigErrorBanner
├── hooks/                                       useFavourites, useBoard
└── lib/
    ├── config.ts                                walidacja zmiennych środowiskowych
    ├── carriers.ts                              mapa kodów przewoźników → nazwa/logo
    ├── cache.ts                                 cache z TTL i limitem wpisów
    ├── search.ts                                normalizacja nazw stacji
    ├── plural.ts                                polska odmiana przez liczbę
    ├── pkp/{client,mock,schema,types}.ts        warstwa danych PKP (live/mock)
    └── board/{poller,transform,instance}.ts     logika domenowa + poller
fixtures/          ręcznie napisane odpowiedzi API do trybu mock
public/carriers/   logotypy przewoźników (SVG)
```

Zasada: sieć wyłącznie na krawędziach (`lib/pkp/client.ts`), logika w środku
jako czyste funkcje. Testy nie wymagają ani sieci, ani klucza API.

## Architektura — dwa niezależne rytmy

```
Przeglądarka  ──co 30 s──▶  /api/board  ──odczyt──▶  snapshot w pamięci
                                                            ▲
                                              co 90 s ──────┘
                                                            │
                                                      API PKP PLK
```

Przeglądarka odpytuje własny serwer często, bo to nic nie kosztuje. Poller
odpytuje PKP rzadko, bo to kosztuje limit. Dziesięciu użytkowników zużywa
tyle samo budżetu co jeden. Route handler nigdy nie czeka na PKP — czyta
snapshot z pamięci i zwraca natychmiast.

Aplikacja działa **w jednej replice**. Dwie repliki to dwa pollery i podwójne
zużycie limitu; skalowanie poziome jest świadomie wykluczone. Stan w pamięci
ginie przy restarcie — pierwszy użytkownik po deployu czeka jedną rundę
pollera.

## Zdobycie klucza API

Zarejestruj się w PKP PLK „Otwarte Dane" (`https://pdp-api.plk-sa.pl`,
dokumentacja pod `/api-documentation`) i poproś o poziom **Basic**
(100 zapytań/godzinę, 1000 zapytań/dobę — to wystarczy). Skopiuj klucz do
`PKP_API_KEY`.

Wykorzystywane endpointy:

| Endpoint | Zastosowanie |
|---|---|
| `GET /api/v1/operations?stations=<id,id>&withPlanned=true&fullRoutes=true` | Realizacja z opóźnieniami — główne źródło |
| `GET /api/v1/schedules?stations=<id,id>` | Przewoźnik i kategoria handlowa (cache 24 h) |
| `GET /api/v1/dictionaries/stations?pageSize=10000` | Słownik stacji pod wyszukiwarkę (cache 24 h, filtrowanie po stronie serwera aplikacji) |

## Uruchomienie lokalne (tryb mock, bez klucza)

```bash
npm install
npm run dev
```

Bez `PKP_API_KEY` i przy domyślnym `PKP_DATA_SOURCE=auto` aplikacja startuje
w trybie mock — dane pochodzą z `fixtures/` i mają czasy przesunięte tak, by
zawsze mieściły się w widocznym oknie. Fixture'y są celowo minimalne
(3 stacje, 3 pociągi) — wystarczają do pracy nad UI, nie odwzorowują
realnego natężenia ruchu.

## Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PKP_API_KEY` | brak | Klucz API. Brak → tryb mock |
| `PKP_DATA_SOURCE` | `auto` | `auto` \| `live` \| `mock`. Jawny override |
| `POLL_INTERVAL_MS` | `90000` | Interwał pollera |
| `INTEREST_TTL_MS` | `300000` | Po tym czasie ciszy stacja przestaje być obserwowana |
| `PORT` | `3000` | Ustawiane przez Railway |

`PKP_DATA_SOURCE=live` bez `PKP_API_KEY` jest błędem konfiguracji — aplikacja
nie wstaje. Skopiuj `.env.example` do `.env.local`, żeby uruchomić w trybie
`live` lokalnie.

## Testy

```bash
npm run test
npm run typecheck
npm run lint
```

150 testów (Vitest), bez sieci i bez klucza API. Testy komponentów działają na
`jsdom` (docblock `// @vitest-environment jsdom`), reszta na środowisku `node`.

## Limity API i działanie pollera

Basic pozwala na 100 zapytań/godzinę **oraz** 1000/dobę jednocześnie. Poller
(`src/lib/board/poller.ts`):

- odpytuje `/operations` co 90 s dla **wszystkich** obserwowanych stacji
  w jednym zapytaniu,
- dokłada zapytanie o `/schedules`, ale odpowiedź trzyma w cache 24 h dla
  danego zestawu stacji, więc w ustabilizowanym stanie kosztuje ono zero,
- usypia po 5 minutach ciszy (`INTEREST_TTL_MS`) i budzi się natychmiast na
  pierwsze żądanie,
- wymuszony przebieg poza harmonogramem jest dławiony do jednego na 45 s
  (dławik jest pomijany dla stacji, która nie ma jeszcze żadnych danych),
- spowalnia do 5 minut, gdy `X-RateLimit-Daily-Remaining` spadnie poniżej 50
  albo `X-RateLimit-Hourly-Remaining` poniżej 10 (przy 90 s zużywamy ~40/h,
  więc limit godzinowy da się wyczerpać przy zdrowym dobowym),
- brak nagłówka z limitem traktuje jako „nie wiadomo", a nie „zero" — inaczej
  API, które przestało je odsyłać, zepchnęłoby poller na stałe na 5 minut,
- przy 429 podwaja interwał, maks. do 5 minut; przy 5xx ponawia raz po
  odstępie z jitterem; przy 401 zatrzymuje się i zgłasza błąd konfiguracji,
- gdy zwolni, `/api/board` zwraca `throttled: true`, a UI pokazuje
  „odświeżanie ograniczone".

Przeglądarka odpytuje własny serwer (`/api/board`) co 30 s i **wstrzymuje się,
gdy karta jest schowana** (`document.hidden`) — dzięki temu poller zasypia sam.

## Deployment (Railway)

Jeden projekt Railway, dwa środowiska: `main` → produkcja (`live`, prawdziwy
klucz), `dev` → staging (`mock`, zero zużycia limitu). Railway deployuje
automatycznie po pushu na podstawie `Dockerfile` (`output: 'standalone'`);
`railway.json` wskazuje `/api/health` jako healthcheck. GitHub Actions
(`.github/workflows/ci.yml`) pełni wyłącznie rolę bramki jakości na pull
requestach — `typecheck`, `lint`, `test`.

Uwaga kosztowa: dwa działające kontenery to podwójne zużycie kredytów
Railway. Warto trzymać `dev` wyłączone i włączać przed większym mergem.

## Znane ograniczenia (0.9 beta)

- **Nie zweryfikowano na żywym kluczu API.** To najważniejsze ograniczenie
  tej wersji. Walidacja kształtu odpowiedzi opiera się na dokumentacji
  i ręcznie napisanych fixture'ach (3 stacje, 3 pociągi). W szczególności
  kody przewoźników w `src/lib/carriers.ts` są zgadywane — wpis z błędnym
  kodem jest nieszkodliwy, ale też bezużyteczny.
- **Kolumna „Peron" jest zawsze pusta.** `/operations` nie zwraca numeru
  peronu w używanym kształcie odpowiedzi; `transform.ts` ustawia
  `platform: null`, UI pokazuje „—".
- **„Pociąg" pokazuje `scheduleId-orderId`, nie handlowy numer pociągu.**
  Identyfikator jest poprawny technicznie (klucz łączenia z rozkładem), ale
  dla pasażera nieczytelny.
- **Logotypy tylko dla 5 przewoźników.** Pozostali mają samą nazwę — wciąż
  czytelniej niż surowy kod, ale bez znaku graficznego.
- **Stan ginie przy restarcie.** Snapshoty i rejestr nazw stacji żyją
  w pamięci procesu; pierwszy użytkownik po deployu czeka jedną rundę pollera.

## Licencja

Kod: [MIT](LICENSE).

Logotypy przewoźników w `public/carriers/` są znakami towarowymi ich
właścicieli, nie są objęte licencją MIT i służą wyłącznie identyfikacji
przewoźnika przy danych o kursowaniu. Dane o ruchu pociągów pochodzą z PKP PLK
„Otwarte Dane" i podlegają warunkom tego serwisu.

## Poza zakresem

Powiadomienia o opóźnieniach, historia punktualności, mapa pociągów,
integracja z `/disruptions`, PWA i tryb offline, konta użytkowników,
synchronizacja ulubionych między urządzeniami, wyszukiwanie połączeń.
