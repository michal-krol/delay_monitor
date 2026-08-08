# Monitor opóźnień

**Wersja 0.9 beta** — działa na produkcji, na prawdziwym kluczu API PKP PLK.
Lista znanych ograniczeń: [sekcja niżej](#znane-ograniczenia-09-beta).

Aplikacja webowa pokazująca opóźnienia pociągów na wybranych stacjach w czasie
zbliżonym do rzeczywistego. Zapisujesz ulubione stacje, widzisz je razem na
dashboardzie i rozwijasz dowolną do pełnej tablicy stacyjnej.

Skala: użytek własny, kilka osób. Bez kont użytkowników, bez bazy danych. Ta
skala jest założeniem projektowym, nie tymczasowym uproszczeniem — wynika z niej
brak bazy, jedna replika i cały mechanizm oszczędzania limitu opisany niżej.

## Funkcjonalność

- **Dashboard ulubionych** — karty z nazwą stacji, 3 najbliższymi
  **nadchodzącymi** odjazdami (godzina, przewoźnik + logo, relacja, status)
  i licznikiem opóźnionych pociągów. Pociągi, które już odjechały, na kartach
  się nie pokazują — zostają wyłącznie w pełnej tablicy (patrz niżej). Nad
  siatką kart jedna wspólna linijka „Ostatnia aktualizacja". Karty ładują się
  z pamięci serwera, nie z API PKP, więc pojawiają się natychmiast. Stację
  usuwa się z ulubionych krzyżykiem na kafelce, bez rozwijania tablicy.
- **Wyszukiwarka stacji** — combobox z podpowiedziami (debounce 300 ms, od
  3 znaków, maks. 10 wyników), pełna obsługa klawiatury (strzałki, Enter,
  Escape). Ignoruje polskie znaki, więc „wroclaw" znajduje „Wrocław Główny".
  Rozróżnia „szukam", „brak stacji o tej nazwie" i „nie udało się pobrać
  listy" — nie chowa awarii pod pustą listą.
- **Pełna tablica stacyjna** — do 10 najbliższych pozycji w oknie od 5 minut
  wstecz do 1 godziny naprzód (który warunek pierwszy), przełącznik odjazdy/
  przyjazdy, kolumny: pociąg, przewoźnik, kierunek, planowo, peron, status.
  Połączenia sprzed maksymalnie 5 minut są nadal widoczne, ale wizualnie
  przygaszone (plakietka statusu zostaje w pełnym kolorze). Kolumna
  „Przewoźnik" na wąskim ekranie (poniżej `sm`) pokazuje sam kod (np. „IC"),
  od `sm` wzwyż pełną nazwę. Dodawanie/usuwanie z ulubionych jednym kliknięciem.
- **Przewoźnik i kategoria** — dociągane z `/api/v1/schedules` (cache 24 h)
  i łączone z realizacją po `trainOrderId` (z fallbackiem na `orderId`,
  patrz `routeKey()` w `board/transform.ts`). Pełna nazwa przewoźnika
  pochodzi ze słownika `dictionaries.carriers` dołączonego do tej samej
  odpowiedzi — bez dodatkowego zapytania. Dla sześciu kodów (IC, KM, SKM,
  ŁKA, Leo Express/LEO, PR) pokazujemy też logo, dla reszty samą nazwę.
- **Status opóźnienia** — `onTime` / `delayed` / `cancelled` / `unknown` /
  `notStarted` / `enRoute`, zawsze opisany tekstem (np. „+12 min"), nigdy
  samym kolorem. `notStarted` brzmi inaczej dla odjazdu ("jeszcze nie
  wyjechał") niż dla przyjazdu ("jeszcze nie przyjechał"). `enRoute` ("w
  trasie") to pociąg, który już ruszył gdzieś na trasie (wolny sygnał z
  całopociągowego `trainStatus`), ale nie dotarł jeszcze tutaj — gdy da się
  to policzyć, dostaje też szacunek opóźnienia ze stacji bezpośrednio przed
  ("w trasie, ~+30 min", z zastrzeżeniem w tooltipie, że to estymata, nie
  potwierdzony fakt). Estymata liczona jest niemal bez dodatkowego kosztu:
  poller dokłada do tego samego zapytania `/operations` pojedynczą stację
  poprzednią dla najbliższych połączeń „w trasie" (patrz
  `src/lib/board/upstreamEstimate.ts`), zamiast włączać kosztowne
  `fullRoutes=true` dla wszystkich pociągów.
- **Tryb jasny/ciemny** — domyślnie wg preferencji systemowej, przez
  `next-themes`, bez mignięcia przy ładowaniu; ręczny przełącznik obok nazwy
  aplikacji pozwala nadpisać wybór systemu.
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
- **Szczegóły połączenia po kliknięciu** — pełna trasa przystanek-po-przystanku
  (`/api/train`, wołane dopiero po kliknięciu, cache 90 s), z osobno liczonym
  opóźnieniem dla **każdego** przystanku (nie rozlanym z całego pociągu — patrz
  `src/lib/board/realization.ts`), peronem/torem gdzie PKP je poda i
  poprawnym zachowaniem dla pociągów bez dopasowanej trasy oraz długich list
  (35+ przystanków — przewija się tylko lista, nagłówek panelu zostaje).
- **Adresowalność i udostępnianie** — rozwinięta stacja, aktywna zakładka
  i otwarty panel szczegółów są odzwierciedlone w adresie URL
  (`history.replaceState`, bez `next/navigation`), więc każdy widok da się
  skopiować jednym linkiem („Kopiuj link" w nagłówku tablicy) i otworzyć od
  razu w tym samym stanie.

## Struktura projektu

```
src/
├── app/
│   ├── api/{board,stations,train,health}/route.ts   endpointy HTTP
│   ├── icon.svg                                 favicon
│   ├── layout.tsx                              ThemeProvider, tło
│   └── page.tsx                                strona główna
├── components/                                 UI (React)
│   ├── Dashboard, StationCard, FullBoard
│   ├── ConnectionDetails                       panel szczegółów połączenia
│   ├── StationSearch, EmptyState, BoardStatus
│   └── DelayBadge, CarrierLogo, ConfigErrorBanner
├── hooks/                                       useFavourites, useBoard
└── lib/
    ├── config.ts                                walidacja zmiennych środowiskowych
    ├── validation.ts                            wspólne wzorce walidacji ID (API + URL)
    ├── urlState.ts                              stan widoku w adresie URL
    ├── carriers.ts                              mapa kodów przewoźników → logo (nazwa: z API)
    ├── cache.ts                                 cache z TTL i limitem wpisów
    ├── search.ts                                normalizacja nazw stacji
    ├── plural.ts                                polska odmiana przez liczbę
    ├── pkp/{client,mock,schema,types,time}.ts   warstwa danych PKP (live/mock)
    └── board/{poller,transform,trainDetail,realization,instance}.ts
                                                  logika domenowa + poller
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
tyle samo budżetu co jeden. `/api/board` nigdy nie czeka na PKP — czyta
snapshot z pamięci i zwraca natychmiast.

`/api/train` (szczegóły połączenia) to celowy wyjątek od tego wzorca —
wywoływane dopiero po kliknięciu w wiersz, nie z pollera, więc **realnie
czeka na PKP** przy pierwszym kliknięciu danego pociągu (potem cache 90 s).
Uzasadnienie: kliknięcie to zdarzenie rzadkie i jednorazowe, w przeciwieństwie
do stałego cyklu pollera — nie ma co cache'ować z wyprzedzeniem czegoś, o co
nikt jeszcze nie zapytał.

Aplikacja działa **w jednej replice**. Dwie repliki to dwa pollery i podwójne
zużycie limitu; skalowanie poziome jest świadomie wykluczone. Stan w pamięci
ginie przy restarcie — pierwszy użytkownik po deployu czeka jedną rundę
pollera.

## Czas i strefy — najłatwiejsza rzecz do zepsucia

`/operations` **czasem** zwraca czasy bez oznaczenia strefy — `"2026-08-02T00:33:00"`,
bez `Z` i bez `+02:00`. To czas zegarowy Warszawy. Dokumentacja tego nie opisuje,
a ręcznie pisane fixture'y mają jawne `+02:00`, więc problem nie ujawnia się
w testach ani lokalnie.

`new Date("2026-08-02T00:33:00")` interpretuje taki ciąg w strefie **procesu**.
Maszyna deweloperska w Polsce ma `Europe/Warsaw`, więc parsuje to przypadkiem
poprawnie. Kontener `node:24-slim` na Railway chodzi w UTC, więc ten sam kod
przesuwał każdy pociąg o +2 h latem — pociąg, który już odjechał, wyglądał
jak nadchodzący za chwilę. Tak to trafiło na produkcję i tak zostało zgłoszone.

Reguła, która z tego wynika:

> Żaden czas z API nie może przejść przez gołe `new Date()`. Wszystkie cztery
> pola (`plannedArrival`, `plannedDeparture`, `actualArrival`, `actualDeparture`)
> przechodzą przez `normalizeApiTimestamp()` z `src/lib/pkp/time.ts` — na granicy
> schematu Zod, więc reszta aplikacji dostaje już wyłącznie poprawny UTC.

Normalizacja jest idempotentna: ciąg z `Z` albo offsetem wraca bez zmian, więc
fixture'y z `+02:00` nie są przesuwane drugi raz. Przesunięcie CET/CEST liczy
`Intl` z jawnym `timeZone: 'Europe/Warsaw'`, a nie strefa procesu — dzięki temu
wynik nie zależy od tego, gdzie działa kontener, i sam obsługuje zmianę czasu.

Test regresyjny w `schema.test.ts` używa dosłownego payloadu z produkcji
i pada pod `TZ=UTC`, jeśli normalizacja zniknie. Warto uruchamiać pakiet także
tak, bo to odwzorowuje produkcję:

```bash
TZ=UTC npm run test
```

## Zdobycie klucza API

Zarejestruj się w PKP PLK „Otwarte Dane" (`https://pdp-api.plk-sa.pl`,
dokumentacja pod `/api-documentation`) i poproś o poziom **Basic**
(100 zapytań/godzinę, 1000 zapytań/dobę — to wystarczy). Skopiuj klucz do
`PKP_API_KEY`.

Wykorzystywane endpointy:

| Endpoint | Zastosowanie |
|---|---|
| `GET /api/v1/operations?stations=<id,id>&withPlanned=true` | Realizacja z opóźnieniami — główne źródło. Świadomie **bez** `fullRoutes=true` — patrz sekcja o limitach niżej |
| `GET /api/v1/schedules?stations=<id,id>&fullRoute=true` | Przewoźnik, kategoria handlowa, peron/tor oraz origin/destination trasy do „Kierunku" (cache 24 h). Odpowiedź niesie też słowniki `dictionaries.carriers`/`dictionaries.stations` — pełne nazwy przewoźników i stacji bez dodatkowego zapytania |
| `GET /api/v1/dictionaries/stations?pageSize=10000` | Słownik stacji pod wyszukiwarkę (cache 24 h, filtrowanie po stronie serwera aplikacji) |

Wyszukiwarka celowo pobiera **cały** słownik stacji raz na dobę zamiast wołać
API przy każdym wpisanym znaku: jedno zapytanie dziennie zamiast jednego na
wyszukanie. Przy limicie 100/h to różnica między „działa" a „nie działa".

### Pełny schemat API bez klucza

`https://pdp-api.plk-sa.pl/swagger/v1/swagger.json` jest publiczny — zwraca
pełny OpenAPI 3.0 (38 ścieżek) bez autoryzacji. To najszybszy sposób sprawdzenia
kształtu odpowiedzi albo istnienia pola, bez zużywania limitu i bez zgadywania
z dokumentacji HTML.

## Uruchomienie lokalne (tryb mock, bez klucza)

```bash
npm install
npm run dev
```

Bez `PKP_API_KEY` i przy domyślnym `PKP_DATA_SOURCE=auto` aplikacja startuje
w trybie mock — dane pochodzą z `fixtures/` i mają czasy przesunięte tak, by
zawsze mieściły się w widocznym oknie. Fixture'y używają prawdziwych ID stacji
(Warszawa Centralna `33605`, Kraków Główny `80416`, Wrocław Główny `60103`,
Gdańsk Główny `7500` — te same co na żywo), więc ulubione zapisane w trybie
mock działają też po przełączeniu na `live`. Są jednak celowo małe (4 stacje,
8 pociągów, 6 przewoźników) — wystarczają do pracy nad UI, nie odwzorowują
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

329 testów w 30 plikach (Vitest), bez sieci i bez klucza API. Testy komponentów
działają na `jsdom` (docblock `// @vitest-environment jsdom`), reszta na
środowisku `node`.

Testy bezpieczeństwa są częścią tego samego pakietu — wstrzykiwanie parametrów,
wyczerpanie budżetu, walidacja wejścia, renderowanie wrogich danych z API,
uszkodzony `localStorage` i nagłówki odpowiedzi. Każdy z nich został przed
scaleniem sprawdzony jako padający na kodzie sprzed poprawki.

Warto puścić pakiet również pod `TZ=UTC` — to odwzorowuje strefę kontenera na
Railway i wyłapuje błędy stref, których lokalna maszyna w Polsce nie pokaże:

```bash
TZ=UTC npm run test
```

## Limity API i działanie pollera

Basic pozwala na 100 zapytań/godzinę **oraz** 1000/dobę jednocześnie. Poller
(`src/lib/board/poller.ts`):

- odpytuje `/operations` co 90 s dla **wszystkich** obserwowanych stacji
  w jednym zapytaniu, świadomie **bez** `fullRoutes=true` — ten parametr
  dokładał pełną trasę (śr. 15 przystanków) do każdego pociągu, choć kod
  używa tylko jednego przystanku na zapytaną stację. Na żywym pomiarze
  (Warszawa Centralna) to różnica 8.6 MB → 680 KB na **ten sam** request co
  90 s — bezpośrednia przyczyna sporadycznych błędów odświeżania
  (`AbortError` z naszego 8 s timeoutu, `ECONNRESET`/`ETIMEDOUT`) obserwowanych
  w logach produkcyjnych. Origin/destination do „Kierunku" pochodzą teraz
  z dopasowanej trasy `/schedules` zamiast z `/operations`,
- dokłada zapytanie o `/schedules` (z `fullRoute=true`, żeby mieć origin/
  destination do „Kierunku" oraz pełne słowniki nazw), ale odpowiedź trzyma
  w cache 24 h dla danego zestawu stacji, więc w ustabilizowanym stanie
  kosztuje ono zero — koszt „pełnej trasy" jest tu jednorazowy, nie co 90 s,
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

**`/api/train` (szczegóły połączenia) to osobne, niezależne od pollera źródło
kosztu.** Każde kliknięcie w niewidziany wcześniej pociąg to do dwóch
dodatkowych zapytań do PKP (realizacja + trasa), poza cyklem 90 s i poza jego
throttlingiem/backoffem. Chroni je wyłącznie własny cache — `createTtlCache()`,
90 s, maks. 200 wpisów — więc wielu użytkowników klikających ten sam pociąg
w krótkim czasie zużywa limit raz, nie wielokrotnie. Realny użytkownik klika
pojedyncze pociągi, nie setki na godzinę, więc to nie zagraża budżetowi tak,
jak zagrażałoby dołożenie zapytania do cyklu pollera — ale to wciąż realne,
nieujęte w limitach opisanych wyżej zużycie.

## Deployment (Railway)

Jeden projekt Railway, dwa środowiska: `main` → produkcja (`live`, prawdziwy
klucz), `dev` → staging (`mock`, zero zużycia limitu). Railway deployuje
automatycznie po pushu na podstawie `Dockerfile` (`output: 'standalone'`);
`railway.json` wskazuje `/api/health` jako healthcheck.

GitHub Actions (`.github/workflows/ci.yml`) uruchamia `typecheck`, `lint`
i `test` na pull requestach **oraz przy pushu na `main`**. Ten drugi wyzwalacz
jest istotny: commity trafiają tu bezpośrednio na `main`, z którego deployuje
Railway — bez tego produkcja nie przechodziłaby przez żadną bramkę.

Kontener runtime nie chodzi jako root (`USER node`), a wersja Node jest zapisana
raz — w `.nvmrc`, skąd czyta ją zarówno CI, jak i `engines` w `package.json`.

`/api/health` zwraca 200 również wtedy, gdy klucz API jest zły (`pollerStatus:
"configError"`). To celowe: aplikacja z zepsutym kluczem nadal serwuje ostatnie
znane dane z pamięci, a restartowanie jej przez healthcheck tylko by zaszkodziło.
Stan jest widoczny w treści odpowiedzi, więc monitoring może na niego zareagować.

Uwaga kosztowa: dwa działające kontenery to podwójne zużycie kredytów
Railway. Warto trzymać `dev` wyłączone i włączać przed większym mergem.

## Co potwierdziły żywe dane

Aplikacja chodzi na produkcji na prawdziwym kluczu. Rzeczy, które wcześniej były
założeniami z dokumentacji, a teraz są sprawdzone na odpowiedziach API:

- **Kody przewoźników `IC`, `KM`, `SKM`, `ŁKA` i `PR` są potwierdzone** na
  żywym słowniku `/api/v1/dictionaries/carriers` (Warszawa Centralna,
  2026-08-04) — te logotypy faktycznie się pokazują. Ten sam słownik ujawnił
  też kody, o których wcześniej nie wiedzieliśmy: `AR` (Arriva RP — nie
  `ARRIVA`, jak zgadywał wcześniej `src/lib/carriers.ts`), `CARGO`, `LEO`,
  `ODEG`, `RJ`, `RP`, `SKMT`/`SKM_3M` (SKM Trójmiasto, inny kod niż SKM
  Warszawa), `SKPL`, `PAR-WOL`. Pełna nazwa przewoźnika nie jest już zgadywana
  lokalnie — pochodzi wprost z tego słownika (patrz `BoardRow.carrierName`);
  `carriers.ts` mapuje już tylko kod → logo, dla kodów bez logo UI pokazuje
  samą nazwę ze słownika.
- **Dopasowanie `/operations` ↔ `/schedules` po samym `scheduleId-orderId`
  gubiło trasę dla ok. połowy pociągów w skali dnia** (763 z 1533 na tej samej
  próbce) — `trainOrderId` z API bywa różny od `orderId` niemal zawsze, a to on
  jest prawdziwym wspólnym kluczem. Naprawione przez `routeKey()` w
  `board/transform.ts` (fallback na `orderId`, gdy `trainOrderId` jest `null`).
- **`fullRoutes=true` na `/operations` kosztował 12,7× więcej niż trzeba** —
  8.6 MB zamiast 680 KB dla tej samej stacji (Warszawa Centralna), na tym
  samym zapytaniu wykonywanym co 90 s. Powód: parametr dokłada pełną trasę do
  każdego pociągu, choć kod czyta tylko jeden przystanek. Zgodnie z logami
  produkcyjnymi to bezpośrednia przyczyna sporadycznych `AbortError`/
  `ECONNRESET`. Naprawione przez wyłączenie `fullRoutes` na `/operations`
  i przeniesienie origin/destination na `/schedules` (`fullRoute=true`,
  cache 24 h — koszt jednorazowy, nie co 90 s).
- **Kategorie handlowe są bogatsze, niż zakładaliśmy** — `IC`, `EIC`, `EIP`,
  `EC/EIC`, `RL`, `RE2`, `S3`, `ŁS` i puste. Nie robimy z nimi nic poza
  wyświetleniem, więc nowa wartość niczego nie psuje.
- **Czasy potrafią przyjść bez strefy** — patrz [sekcja o strefach](#czas-i-strefy--najłatwiejsza-rzecz-do-zepsucia).
- **Dla pociągu, który jeszcze nie wyjechał, PKP wpisuje w „faktyczny czas"
  kopię czasu planowego** — nawet godzinami przed odjazdem, nie tylko tuż po
  nim (zaobserwowane na produkcji: R1 91342, Koleje Mazowieckie). Sama
  obecność „faktycznego czasu" nigdy więc nie dowodzi, że coś się już
  wydarzyło — jedynym wiarygodnym sygnałem jest pole `isConfirmed`
  („Czy przejazd potwierdzony" w swaggerze). Naprawione i ujednolicone
  w `src/lib/board/realization.ts` — patrz też `AGENTS.md`.

## Znane ograniczenia (0.9 beta)

- **„Pociąg" i „Kierunek" pokazują `scheduleId-orderId` / „—" dla pociągów bez
  dopasowanej trasy.** Odkąd dopasowanie `/operations` ↔ `/schedules` uwzględnia
  `trainOrderId` (patrz wyżej), dotyczy to już tylko mniejszości pociągów —
  głównie tych spoza widocznego okna. Gdy trasa się nie dopasuje: „Pociąg"
  pokazuje `scheduleId-orderId` (np. `2026-424939627`), „Kierunek" — „—".
  Poprawne technicznie (to nadal stabilny klucz), ale dla pasażera nieczytelne.
- **Fixture'y nie odwzorowują skali żywego API.** Używają prawdziwych ID stacji,
  ale to wciąż 8 pociągów zamiast kilkudziesięciu-kilkuset i 6 kodów
  przewoźników zamiast 22. Nadają się do pracy nad UI, nie do wnioskowania
  o rzeczywistym natężeniu ruchu.
- **Logotypy tylko dla 6 przewoźników** (IC, KM, SKM, ŁKA, Leo Express/LEO, PR).
  Pozostali mają samą nazwę — wciąż czytelniej niż surowy kod, ale bez znaku
  graficznego.
- **Stan ginie przy restarcie.** Snapshoty i rejestr nazw stacji żyją
  w pamięci procesu; pierwszy użytkownik po deployu czeka jedną rundę pollera.
  Świadomy kompromis: alternatywą byłby zewnętrzny magazyn stanu, nieuzasadniony
  przy tej skali.
- **Panel szczegółów połączenia nie ma gwarancji świeżości poza cache 90 s.**
  Kliknięcie w pociąg, który w międzyczasie zniknął z rozkładu PKP (rzadkie),
  zwróci 404 zamiast ostatnich znanych danych — w przeciwieństwie do tablicy
  głównej, panel nie ma „ostatniego dobrego snapshotu" do pokazania.

## Bezpieczeństwo

Aplikacja jest publiczna i bez uwierzytelniania, więc każdy endpoint trzeba
traktować jak wejście spoza systemu. Obowiązujące zasady:

- **Identyfikatory stacji są walidowane u wejścia** (`/^\d{1,10}$/`, maks. 20 na
  żądanie, deduplikowane) i **kodowane** przed wstawieniem do zapytania do PKP.
  Bez tego `stations=5100&pageSize=5000` dopisywał własne parametry do żądania
  kierowanego do zewnętrznego API. Ten sam wzorzec (`src/lib/validation.ts`)
  waliduje `scheduleId`/`orderId`/`operatingDate` w `/api/train` — również
  wtedy, gdy pochodzą z parametrów URL (odtwarzanie widoku z linku), nie tylko
  z kliknięcia w tablicy. Nieprawidłowa wartość jest po cichu ignorowana
  (URL) albo odrzucana bez echa (API) — nigdy nie trafia do zapytania do PKP.
- **Budżet zapytań jest chroniony dwuwarstwowo**: route odsiewa identyfikatory
  spoza zbuforowanego słownika, a poller ogranicza wymuszone przebiegi pulą
  w oknie kroczącym (10/h). Wcześniej seria żądań o losowe stacje zamieniała się
  jeden do jednego na zapytania do PKP i pozwalała wyczerpać limit 100/h.
- **Równoległe żądania nie mnożą zapytań** — pobrania słownika i rozkładów są
  deduplikowane w locie, więc osiem jednoczesnych wywołań to jedno zapytanie.
- **Nagłówki bezpieczeństwa** (CSP, `X-Content-Type-Options`, `Referrer-Policy`,
  `frame-ancestors`, `Permissions-Policy`, HSTS poza dev) ustawia
  [`next.config.ts`](next.config.ts); `next.config.test.ts` blokuje ich ciche
  osłabienie. CSP jest pragmatyczna — `'unsafe-inline'` wynika z inline skryptu
  hydracji Next i skryptu `next-themes`.
- **`localStorage` jest walidowany schematem Zod.** To wejście spoza aplikacji;
  uszkodzony wpis nie może wywrócić renderu.

### Świadomie przyjęte ryzyko

- **`/api/health` ujawnia tryb danych** (`live`/`mock`) i stan pollera. To
  healthcheck Railway i najbardziej użyteczny sygnał diagnostyczny, jaki mamy;
  informacja, że skonfigurowano prawdziwy klucz, nie przybliża nikogo do jego
  zdobycia.
- **`/api/board` zwraca pozostały budżet zapytań.** Konsumuje go interfejs
  (podpowiedź przy „odświeżanie ograniczone"), a po zamknięciu wektora
  wyczerpania budżetu sama liczba niewiele daje atakującemu.
- **CSP dopuszcza `'unsafe-inline'` dla skryptów.** Ścisła polityka wymagałaby
  nonce'ów per żądanie, czyli middleware i przepięcia obsługi motywu —
  nieuzasadnione przy tej skali. Pozostałe dyrektywy nadal odcinają obce
  origin, ramki i wtyczki.
- **`sharp` i `postcss` są przypięte przez `overrides`.** Nie istnieje wersja
  Next bez tych podatności (`16.2.12` to najnowsza stabilna), a `npm audit fix`
  proponuje downgrade do `next@9.3.3`. Wpis w `overrides` należy usunąć, gdy
  Next zaktualizuje je u siebie.

## Zbadane i odłożone: przyczyna opóźnienia

Pytanie brzmiało, czy da się pokazać, **dlaczego** pociąg jest opóźniony.
Odpowiedź na podstawie publicznego schematu OpenAPI:

- `/operations` — którego używamy — **nie ma** żadnego pola z przyczyną.
  W całym schemacie odpowiedzi nie występuje `reason` ani `cause`.
- Jest osobny endpoint **`/api/v1/disruptions`** („utrudnienia na liniach
  kolejowych") zwracający `disruptionTypeCode` (kod tłumaczony przez dołączony
  słownik `disruptionTypes`), `message` z pełnym opisem oraz `affectedRoutes[]`
  z parą `scheduleId` + `orderId` — **dokładnie tym samym kluczem**, którego już
  używamy do złączenia z `/schedules`.

Czyli technicznie to ten sam wzorzec złączenia co obecnie, tylko z trzecim
źródłem. Odłożone z dwóch powodów:

1. **Pokrycie będzie częściowe.** `/disruptions` to lista sformalizowanych
   zdarzeń (awarie, roboty, wypadki). Kilkuminutowe opóźnienia operacyjne
   najpewniej nie mają tam odpowiednika, więc większość wierszy i tak zostałaby
   bez przyczyny. Rzeczywisty odsetek trafień jest niezmierzony.
2. **Koszt limitu.** W przeciwieństwie do `/schedules` (cache 24 h, bo trasa
   i przewoźnik się nie zmieniają) utrudnienia zmieniają się w czasie, więc nie
   da się ich cache'ować równie agresywnie. To realnie trzecie zapytanie na
   cykl pollera w systemie, gdzie 100/h już jest ciasne.

Gdyby do tego wracać, kolejność jest taka: najpierw zmierzyć pokrycie na
żywych danych, potem zdecydować o częstotliwości odpytywania.

## Licencja

Kod: [MIT](LICENSE).

Logotypy przewoźników w `public/carriers/` są znakami towarowymi ich
właścicieli, nie są objęte licencją MIT i służą wyłącznie identyfikacji
przewoźnika przy danych o kursowaniu. Dane o ruchu pociągów pochodzą z PKP PLK
„Otwarte Dane" i podlegają warunkom tego serwisu.

Logo Kolei Śląskich (`public/carriers/ks.png`) pochodzi z Wikimedia Commons na
licencji [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.pl),
autor: FHrad. Pozostałe logotypy z Wikimedia Commons są na licencji domeny
publicznej (PD-textlogo/PD).

## Poza zakresem

Powiadomienia o opóźnieniach, historia punktualności, mapa pociągów, PWA
i tryb offline, konta użytkowników, synchronizacja ulubionych między
urządzeniami, wyszukiwanie połączeń.

Integracja z `/disruptions` jest zbadana i świadomie odłożona — patrz
[sekcja wyżej](#zbadane-i-odłożone-przyczyna-opóźnienia).

Każde z tych rozszerzeń da się dołożyć bez zmiany architektury. Granicą, której
nie chcemy przekraczać bez ponownego przemyślenia całości, jest **druga replika**
— to podwoiłoby zużycie limitu i wymusiło współdzielony magazyn stanu.
