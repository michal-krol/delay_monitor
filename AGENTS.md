<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Monitor opóźnień — niezmienniki projektu

Rzeczy łatwe do zepsucia nieświadomie — nie widać ich w kodzie w miejscu, w którym
się pracuje. Pełna architektura i uzasadnienia: `README.md`. Numeracja sekcji jest
stabilna — kod, `CHANGELOG` i komentarze odwołują się do „#N".

## 1. Żaden czas z API nie przechodzi przez gołe `new Date()`

`/operations` bywa zwraca czas bez strefy (`"2026-08-02T00:33:00"`) — to czas
warszawski, ale `new Date()` czyta go w strefie **procesu**: lokalnie w PL wychodzi
dobrze, w kontenerze Railway (UTC) przesuwa każdy pociąg o 1–2 h. Raz trafiło na
produkcję.

- Cztery pola czasowe (`plannedArrival`, `plannedDeparture`, `actualArrival`,
  `actualDeparture`) idą przez `normalizeApiTimestamp()` z `src/lib/pkp/time.ts`,
  na granicy Zod. Nowe pole czasowe z API → podłącz tam samo.
- „Czy to dzisiaj": `warsawDateString()`, nigdy `new Date().toISOString().slice(0,10)`.
  Statystyki stacji odsiewają jutro po `operatingDates` (okno `/schedules` to
  dziś+jutro), inaczej proces w UTC po 22:00 liczy jutrzejszy rozkład jako dziś.
- Godziny z `/schedules` (`departureTime`, „HH:mm:ss") są już warszawskie — czytaj
  z ciągu, nie przez `Date`.
- Testuj też pod `TZ=UTC npm run test` (odwzorowuje produkcję).

## 2. „Faktyczny czas" ≠ „już się wydarzyło"

Dla pociągu przed odjazdem PKP potrafi wpisać w `actualArrival`/`actualDeparture`
**kopię** czasu planowego, godzinami wcześniej (zaobserwowane: R1 91342, Koleje
Mazowieckie, `trainStatus: "S"`). Kod traktujący `actualAt !== null` jako dowód
realizacji pokaże taki pociąg jako punktualny — raz trafiło na tablicę główną.

- Jedyny wiarygodny sygnał: `isConfirmed`, **per przystanek**, nie per pociąg
  (`trainStatus`).
- Cała logika „czy się wydarzyło i o ile opóźnione" żyje w jednym miejscu:
  `src/lib/board/realization.ts` (`resolveStopStatus`, `resolveDelayMinutes`),
  używanym przez `board/transform.ts`, `board/trainDetail.ts`, `ConnectionDetails.tsx`.
  Nie duplikuj — dwie implementacje raz się rozjechały między tablicą a panelem.
- **Wyjątek:** `hasTrainStartedFromStatus()` w tym samym pliku *świadomie* czyta
  `trainStatus` (`P`/`C`) — wyłącznie do „czy pociąg jako całość gdzieś ruszył",
  żeby pokazać „w trasie" zamiast „jeszcze nie wyjechał". Nie jest per-przystankowe
  (do tego nadal `isConfirmed`) i nie zmienia liczenia opóźnienia. Nie łam tego.

## 3. Budżet zapytań PKP to zasób krytyczny

Klucz Basic: 100/h **oraz** 1000/dobę. Poller @90 s ≈ 40/h — zapas realny, nieduży.

- Nie dokładaj zapytań do pollera bez policzenia kosztu/h.
- Nowe źródło danych domyślnie cache'owane; brak cache = świadoma decyzja.
- Brak nagłówka `X-RateLimit-*` = „nie wiadomo", nigdy „zero" (potraktowanie jako
  zero raz zepchnęło poller na stałe na interwał awaryjny).
- **Poza cyklem pollera, licz osobno:**
  - `/api/train` — synchroniczny fetch przy kliknięciu w niewidziany pociąg,
    własny cache 90 s (`createTtlCache()`).
  - `/api/network-stats` — `getOperationsStatistics` (15 min), `getDisruptionCount`
    (20 min), `getDailyCarrierCounts` (24 h), `getNameDictionaries` (współdzielony).
    Jeden globalny widżet, cache w `board/networkStats.ts` → ~7/h niezależnie od ruchu.
  - `/api/weather` → Open-Meteo, **nie PKP** — zero kosztu budżetu PKP. Własny cache
    25 min/stacja + dedup w locie.
- Kafelki KPI stacji, „najpopularniejsze kierunki", natężenie, „przez…" w wierszu
  **kosztują 0 zapytań** — liczone w ticku pollera z tego, co i tak ma: całodniowe
  `/operations` + trasy `/schedules` (cache 24 h, `fullRoute=true`). Arytmetyka w
  `src/lib/board/stationStats.ts`, czyste funkcje raz na tick. Nowy wskaźnik →
  najpierw sprawdź, czy nie liczy się z tych samych danych.

## 4. Wejście spoza aplikacji jest zawsze wrogie

Aplikacja publiczna, bez auth. Parametry URL, `localStorage`, odpowiedzi PKP = dane
spoza systemu.

- ID stacji: walidacja formatu u wejścia **oraz** kodowanie przed zapytaniem do PKP
  (bez kodowania `stations=5100&pageSize=5000` dopisywał parametry do cudzego
  żądania). Wzorce w `src/lib/validation.ts` — nie duplikuj regexów.
- Nic od klienta nie decyduje, o co pytamy PKP. Nieznane ID nie trafiają do pollera.
- `localStorage` parsuj schematem, nie `JSON.parse(x) as T` (raz dało białą stronę).
- Cache sprawdzany przed `await` i zapisywany po = wyścig. Deduplikuj w locie.
- Stan widoku z URL (`src/lib/urlState.ts`): zły parametr po cichu ignorowany,
  nigdy awaria renderu. `patchUrlParams()` czyta bieżący `window.location.search`
  i dopisuje — nie buduje od zera (kilka modułów pisze do tego samego URL-a).
- Nagłówki bezpieczeństwa z `next.config.ts` pilnuje `next.config.test.ts` —
  osłabiasz politykę = zaktualizuj test.

## 5. Jedna replika, stan w pamięci

Dwie repliki = dwa pollery = podwójny limit. Skalowanie poziome świadomie wykluczone;
snapshoty i rejestr nazw stacji w pamięci procesu. Nie zakładaj współdzielonego stanu.
Cache w długo żyjącym procesie musi mieć TTL i limit wpisów → `createTtlCache()`
z `src/lib/cache.ts`, nie goła `Map`.

## 6. Sieć wyłącznie na krawędziach

Cały HTTP w dwóch klientach: `src/lib/pkp/client.ts` (PKP) i `src/lib/weather/client.ts`
(Open-Meteo, bezkluczowe, jedyne poza-PKP wyjście sieciowe). Logika domenowa
(`lib/board/`, `lib/weather/format.ts`) = czyste funkcje na interfejsie `PkpClient`
albo czystym payloadzie, nie na `fetch`. Testy nie potrzebują sieci ani klucza — ma
tak zostać. Nowe źródło = nowy klient na krawędzi. Wybór live/mock raz, przy starcie,
w `lib/board/instance.ts`.

Współrzędne stacji do pogody: statyczny `data/station-coordinates.json` (regen
`scripts/enrich-station-coords.mjs`), jest w obrazie (`.next/standalone`). Brak stacji
= `available:false` w `/api/weather`, **cache'owane, nie błąd**.

## 7. UI nigdy nie jest pusty

Przy awarii API pokazujemy ostatni dobry snapshot + jego wiek, nie czyścimy widoku.
Awaria = rosnący wiek danych, nie biały ekran. Baner błędu tylko dla błędu
konfiguracji (401).

- „brak wyników" ≠ „nie udało się sprawdzić". Wskaźniki liczbowe mają **trzy** stany:
  wczytuje się / nie udało się pobrać / konkretna liczba. `null` w
  `StationStats`/`StationInsights` = „nie wiadomo", **nigdy** nie renderuje się jako
  `0` (kafelek „0 pociągów" przy zepsutym pobraniu kłamie jak pusta tablica).
- **Wyjątek** `/api/train`: brak snapshotu (jednorazowy fetch) → jawny komunikat
  błędu, nie stare dane.
- Pogoda: `available:false` = trwały poprawny wynik (cache), nie błąd; dopiero
  sieć/5xx z Open-Meteo daje stan błędu. Trzy stany: wczytuje się / brak lokalizacji /
  pogoda.
- Widżet stanu sieci (`board/networkStats.ts`) trzyma ostatnią dobrą wartość każdego
  z trzech podzapytań osobno — błąd jednego degraduje tylko to jedno.

## 8. Fixture'y nie odwzorowują skali żywego API

Mock ma **prawdziwe** ID stacji (Warszawa Centralna `33605`, Kraków Główny `80416`,
Gdańsk Główny `7500`), ale to 15 ręcznie pisanych pociągów (`orderId` 101–115)
i 6 kodów przewoźników zamiast 22. Do pracy nad UI — nie do wnioskowania o natężeniu
ruchu produkcji.

Zestaw pokrywa warianty: punktualny, lekkie/duże opóźnienie, ~6 h opóźnienia wciąż
w trasie (`104`), odwołany w całości (`105`), częściowo (`106`), „jeszcze nie
wyjechał" (`107`, `trainStatus S`), świeżo potwierdzony odjazd (`108`), utrudnienia
(`109` kod słownikowy, `110` tekst PKP), po północy (`112`, `arrivalDay: 1`), bez
dopasowanej trasy (`113`), bez żadnej realizacji z rozkładem w połowie trasy (`115`,
`isScheduleProjection` w `board/trainDetail.ts`). Mapa `orderId`→przypadek:
komentarze w `src/lib/pkp/mock.test.ts`.

Kształt odpowiedzi sprawdzaj w publicznym schemacie, nie zgaduj z fixture'ów
(bez klucza, bez kosztu): `curl -s https://pdp-api.plk-sa.pl/swagger/v1/swagger.json`

## 9. `/operations` i `/schedules` nie ograniczają się do „dzisiaj"

Zweryfikowane na żywo (Warszawa Zachodnia, 2026-08-28): jedna odpowiedź
`/operations?stations=…&withPlanned=true` niosła pociągi z **5 dni kursowania** naraz
(endpoint nie przyjmuje daty). Każde liczenie „dzisiaj" z niej (`stationStats.ts`,
`computeStationRealization`) musi filtrować `train.operatingDate === todayIsoDate` —
inaczej kafelek „z potwierdzonych dziś przejazdów" pokazywał średnią z zeszłego
tygodnia (gorsze niż brak danych, bo wiarygodne — #7).

Druga pułapka: `/schedules` (`fullRoute=true`) zwraca **osobny rekord trasy na każdy
dzień kursowania** tego samego przejazdu — ten sam `trainOrderId`, inny `orderId`,
czasem inne perony. Zwykła `Map` „ostatni wygrywa" zostawiała rekord ze złego dnia
w ~13% przypadków mimo istniejącego dzisiejszego. `indexRoutesByTrain()` /
`findRouteForTrain()` w `board/routeKey.ts` to naprawiają (wariant per przejazd+dzień
+ rezerwa bez daty, szuka najpierw dokładnego dnia). **Nie wracaj do
`new Map(routes.map(r => [routeKey(r), r]))`.** Liczenie (nie wyszukiwanie jednej
trasy) idzie po **surowej liście** tras z pollera, nie po indeksie — indeks zwija
warianty i zaniża liczniki.

## 10. Rozkład wyznacza listę połączeń, realizacja ją wzbogaca

Odwrotnie niż podpowiada intuicja: wiersze tablicy z **rozkładu** (`/schedules`),
realizacja (`/operations`) dokłada opóźnienie, status, czas faktyczny do gotowych
wierszy. Powód zmierzony: 27–31.08.2026 feed realizacji przez 5 dób zwracał tylko
kursy sprzed dni (HTTP 200, dobry kształt, zły dzień) — stara kolejność (lista
z realizacji) świeciła pustką, choć rozkład znał komplet. Warszawa Centralna: 26.08
realizacja 392 / rozkład 394; 27.08 307 / 394 — **22% pociągów bez wiersza**.

Przy zmianach w `board/transform.ts`:

- Dopasowanie po `scheduleId-trainOrderId|operatingDate` obejmuje 100% w obie strony.
  Kursy z realizacji bez trasy i tak doklejane (`collectRowSources`) — polisa, nie
  realny przypadek.
- Wiersz bez dopasowanej realizacji jest **normalny**. `stop: null` w `RowSource`
  przechodzi przez `resolveDelayMinutes`/`resolveStopStatus` bez zmian → „nie
  wiadomo". Bez obejść.
- Komunikat (#7): „są godziny, nie znamy opóźnień" ≠ „nie udało się pobrać". Poller
  zgłasza `degraded` + `realizationStale: true`, tablica pisze „PKP nie podaje dziś
  danych o ruchu".

`BOARD_SOURCE=schedule|operations` cofa bez deployu. **Tymczasowy — usunąć nie
wcześniej niż ~2026-09-14** (2 tyg. zdrowego feedu od naprawy 31.08), jeśli feed
znów nie padnie. Usuwanie zdejmuje naraz:

- `BOARD_SOURCE` w `src/lib/config.ts` (+ `AppConfig.boardSource`, `.env.example`);
- `boardSource` w `PollerConfig` + gałąź `=== 'schedule'` w `poller.ts`;
- ścieżka `scheduleSource === null` w `collectRowSources()` i trailing-optional
  `scheduleSource` w `transformOperations()`;
- ~63 wywołania `transformOperations(` w `transform.test.ts` (testują ścieżkę
  historyczną — przepisać na jawny `scheduleSource` albo poprawić helper).

## 11. Katalog `docs/` nie jest publikowany

`docs/` (projekt techniczny, plan) jest w `.gitignore` celowo. Nie dodawaj z powrotem.

## 12. Bramka jakości i przepływ

Przepływ: **lokalnie → `dev` → `main`**. Feature branch (worktree) → PR do `dev`;
Railway stawia staging z `dev`, tam klikane QA; zielony `dev` → PR do `main` →
produkcja. Nie pushuj feature'a prosto na `main`.

Przed każdym pushem (hook `pre-push`, włącz raz: `git config core.hooksPath .githooks`):

```bash
npm run check   # = typecheck && lint && test
```

- `TZ=UTC npm run test` dodatkowo przy logice czasu (#1).
- Zmiana UI → `npm run e2e` (#16) + przeglądarka; pełne klikane QA na deployu `dev`.
- Dotykasz `src/lib/pkp/schema.ts` albo parametrów zapytań w `client.ts` →
  `PKP_CONTRACT=1 npm run test -- contract` (sieć, bez klucza, bez kosztu).
  `contract.test.ts` sprawdza tylko obecność pól/parametrów — ich zniknięcie robi
  ciche awarie (2026-08-30: `withPlanned`/`fullRoute`).
- Commity i PR-y **po angielsku**, Conventional Commits (`feat:`/`refactor:`/`docs:`).
  README, CHANGELOG i ten plik zostają po polsku.

## 13. GTFS to osobna dziedzina, nie rozszerzenie PKP

`src/lib/gtfs/` żyje obok warstwy PKP i **niczego z niej nie dziedziczy**.

- **Zero pola opóźnienia.** `src/lib/gtfs/types.ts` nie ma
  `delayMinutes`/`actualAt`/`predictedAt`, żadna odpowiedź `/api/gtfs/*` też. Nikt
  nie publikuje opóźnień miejskich Warszawy (docelowo, etap 5: pozycje pojazdów).
  Brak pola = mechanizm kontrolny: komunikat zawsze „rozkład", **nigdy „na czas"**.
- **Trzy niezależne rytmy:** PKP poller 90 s ↔ przeglądarka `/api/board` 30 s ↔ GTFS
  poller (raz/dobę + TTL bezczynności). GTFS ładuje się **raz** (~107 MB, ~3 s parse),
  potem tylko z pamięci. `/api/gtfs/*` nigdy nie czekają — `ensureLoaded()`
  fire-and-forget, `getSchedule()` zwraca `null` do gotowości, klient ponawia.
- **Rejestr miast (`gtfs/cities.ts`) = jedyne miejsce z logiką per-miasto.** Nowe
  miasto = jeden wpis w `REGISTRY`, zero kodu (`cities.test.ts`). Slug = pełna nazwa
  bez polskich znaków (`warszawa`, `krakow`), `[a-z]{2,24}`, katalog fixture'a = slug.
  „wtp"/„ztm" nie istnieją poza tym plikiem i fixture'ami.
- **ID GTFS (`stop`, `route`) nigdy nie trafiają do wychodzącego URL-a** — to klucze
  `Map` w pamięci. Granica zaufania: `stopIndexById.get(id) === undefined` /
  `routeIndexById...` → `null` (200, nie 400 — konwencja nieznanego ID). Regexy
  `GTFS_STOP_ID_PATTERN` / `GTFS_ROUTE_ID_PATTERN` w `validation.ts` = tani strażnik
  formatu. `city` **MUSI** być sprawdzone wobec rejestru — wybiera feed.
- **`route_color` = niezaufany string.** Zod (`schema.ts`) → `#RRGGBB` albo `null`;
  `route_text_color` ignorowany w całości, kontrast liczymy sami (`contrastText`).
  `LineBadge` używa tylko `style={{ background }}` ze zwalidowaną wartością.
- **`schedule.routePatterns`** (przebieg per kierunek + `offsets` sekundowe od
  przystanku startowego) akumulowany w gorącej pętli `stop_times` — nie skanuj
  milionów zdarzeń per żądanie strony linii. `lineDetail()` czyta gotowy indeks;
  strona liczy godzinę jako `czas startowy + offsetSec`. Wybieramy **najczęstszy**
  przebieg (linia, kierunek), NIE najdłuższy — najdłuższy łapał zjazdy do zajezdni
  i objazdy (linia 4: „Gocławek → Zjazd do zajezdni" zamiast „Żerań Wschodni →
  Metro Wilanowska"). **Nie wracaj do `points.length > existing.stops.length`.**
- **Kurs techniczny = `exceptional=1` LUB nagłówek `/zajezdn/i`** (`tripSchema`) —
  feed WTP bywa niespójny (zjazd z `exceptional=0`, 2026-09-04). Nie zasila
  `routePatterns` ani indeksu `run*`.
- **Kategoria dnia** (`serviceCategory` → `schedule.tripCategory`): najpierw token
  w `service_id` (`PcS` roboczy pon–czw, `SbS` sobota, `NdS` niedziela/święto, `PtS`
  piątek — WTP ma OSOBNY rozkład piątkowy), potem dni tygodnia dat kursowania.
- **Kolumny dni w rozkładzie linii NIE są z okna `[wczoraj, dziś, jutro]`.** Indeks
  `run*` w `schedule.ts` (jeden wpis/kurs, KAŻDA doba kursowania, z pierwszego
  słupka) → `lineDeparturesFromRuns()` daje komplet kategorii niezależnie od dnia —
  inaczej „Soboty"/„Niedziele" znikały w środku tygodnia. **Wyjątek: metro**
  (`frequencies.txt`) nie ma `run*` → fallback `lineDeparturesFromEvents()` na CSR,
  więc metro pokazuje tylko kategorie z okna. `run*` iterowany liniowo per żądanie
  (~35 tys., ~1 ms) — jeśli urośnie, indeks per-route.
- **Zespół vs słupek.** `stopGroup(id)` ZAWSZE zwraca cały zespół, nawet gdy `id`
  to jeden słupek (`groupIdOf()`); wtedy `requestedMemberId` niesie ten słupek
  (deep-link z trasy linii → przełącznik go podświetla). `members` z `code`
  (`stop_code`), `street` (`street_name`), per-słupkowymi `lines`. Zawężenie tylko
  jawnym `/api/gtfs/board?slupek=<id>` — nie auto-scope z `stopId`, inaczej „Cały
  przystanek" nie działa na deep-linku. `GtfsDeparture.stopCode` / `LineRouteStop.code`
  (fallback na `platform_code`) — user widzi, z którego słupka jedzie („Centrum" =
  9 fizycznie odległych słupków). `cleanGroupName()` NO-OP na żywym feedzie, mock
  go używa („Centrum 01").
- **`wheelchair_boarding` — sygnał to `2`, nie `1`.** WTP daje `1` (DOMYŚLNE) na
  ~89% słupków, `2` (NIEdostępny) na ~11%. `StopGroup.wheelchairNote` =
  `'inaccessible'` / `'partial'` / `null`; ikona TYLKO dla `2`. **Nie oznaczaj `1`.**
- **Przystanek na żądanie** = `pickup_type`/`drop_off_type` = `3` w `stop_times`
  (`schedule.evOnRequest` → `GtfsDeparture.onRequest`).
- **Rozkład wyznacza doby `[wczoraj, dziś, jutro]`** dla TABLICY ODJAZDÓW (CSR) —
  problem #9 tu nie występuje (brak feedu realizacji), ale „dziś" idzie przez
  `serviceDateWindow()` i indeks doby, nie `new Date()`. `cityStats.hourly` liczy
  KURSY (pierwszy odjazd kursu per godzina), nie zdarzenia — `sum(hourly) === tripsToday`.

Kontrakt: `GTFS_CONTRACT=1 npm run test -- gtfs/contract` (sieć, bez kosztu).
`GTFS_DATA_SOURCE=mock` (domyślnie) trzyma dev/test/CI zerowo-sieciowe. Fixture'y
w `fixtures/gtfs/<city>/` to zwykłe `.txt`, bez ZIP-a.

## 14. Proces pracy nad zmianą

Skalowany rozmiarem. Zmiana trywialna (literówka, jednolinijkowiec, czysty refactor)
= fix + test + bramka (#12), bez reszty. Pełna ścieżka — nowe zachowanie i niebanalne
poprawki:

1. **Analiza = burza mózgów oparta o źródła.** Przedstaw przypadek własnymi słowami,
   wypisz założenia, zadaj userowi otwarte pytania — zanim powstanie kod. Oprzyj się
   na źródłach i **wymień, których użyłeś**: API (swagger, `/operations` przy kluczu,
   feed GTFS — #8/#9/#13); dokumentacja (`node_modules/next/dist/docs/`, schemat GTFS,
   swagger PKP); wiedza wewnętrzna (ten plik, `README.md`, `MEMORY.md`, handoffy
   w `docs/`, `CHANGELOG.md`); sieć (dobre praktyki, gdy temat wymaga).
   (`superpowers:brainstorming`)
2. **UI / design.** Dotyka wyglądu lub nowego widoku → ustal z userem kierunek
   (albo zaprojektuj wariant i pokaż) zanim wejdziesz w kod.
3. **TDD.** Nowe zachowanie / bug → najpierw czerwony test. Testy obok kodu
   (`*.test.ts`). Regresja z produkcji → test na dosłownym payloadzie
   (jak `schema.test.ts`). (`superpowers:test-driven-development`)
4. **Bramka** — #12. UI → dodatkowo `npm run e2e` (#16).
5. **Weryfikacja UI.** Przeglądarka; nowy interaktywny przepływ → e2e desktop+mobile
   (#16) + zrzut. Pełne klikane QA na `dev`.
6. **Spójność i związek przyczynowo-skutkowy — zawsze na końcu.** Przeczytaj diff
   obok niezmienników: czy zmiana daje zamierzony efekt end-to-end? Czy typy, testy,
   `CHANGELOG`, ten plik i kod mówią to samo? Czy nic nie przeczy niezmiennikowi?
   (`superpowers:verification-before-completion`)
7. **Self-review + sugestie.** Jeden przebieg pod nadmiarowość i reużycie
   (`/ponytail-review` lub `/simplify`). Refaktor wart osobnej zmiany → zgłoś, nie
   doklejaj. Zbudowane dane/funkcja umożliwiają wartościowe, nierealizowane użycie →
   1–2 zdania sugestii (`spawn_task` albo `MEMORY.md`), nie realizuj tutaj.
   (`superpowers:requesting-code-review`)

## 15. Ekonomia działań i wypowiedzi

Sesje kosztują tokeny.

- Nie powtarzaj ustalonych faktów, nie streszczaj planu bez prośby, nie opisuj
  odrzuconych wariantów. Zmiana najpierw, potem maks. 3 krótkie linijki.
- Tryb plan: **jeden** Explore agent, nie trzy — mapa repo jest w tym pliku.
- Nie czytaj ponownie pliku, który właśnie zmieniłeś.
- Duże zrzuty (`git diff`, `curl`, logi) zawężaj ścieżką/`head`; czytaj przez
  Grep/Read, nie `cat`.
- Jedno zadanie = jedna sesja; nowy temat = nowa sesja, nie `/compact`.
- ponytail = minimalizm kodu, caveman = język wypowiedzi (oba stale przez plugin);
  ta sekcja wiąże je z działaniami w sesji.

## 16. Automatyczne testy UI (e2e)

`npm run e2e` = wersjonowany pakiet regresji UI (`@playwright/test`), tryb mock,
zerowo-sieciowy jak reszta (#6, #8): serwer przez `webServer` bez klucza PKP,
`GTFS_DATA_SOURCE=mock`. Lokalnie przy zmianach UI + w CI (osobny job `e2e`, poza
szybkim `quality`).

- Projekty: `desktop-chromium`, `mobile-chromium` (`Pixel 7`), `mobile-safari`
  (`iPhone 15`). Nowy viewport = wpis w `playwright.config.ts`.
- Nowy widok / przepływ → smoke w `e2e/` przy desktop+mobile + skan a11y
  (`@axe-core/playwright`, fail na `serious`/`critical`). Lokatory semantyczne
  (rola/nazwa), nie CSS.
- Trzy stany z #7 obowiązują: test nie może przechodzić na kaflu „0" przy zepsutym
  pobraniu.
- playwright-skill (MCP) to co innego — eksploracja, nie regresja.
- `ponytail:` snapshoty wizualne (`toHaveScreenshot`) pominięte do czasu realnej
  regresji wizualnej.

## 17. Wtyczki przypięte w `.claude/settings.json`

Wersjonowany `.claude/settings.json` przypina zestaw dla **każdej sesji w repo**
(worktree, CLI, aplikacja): `superpowers`, `ponytail`, `caveman`, `taste-skill`,
`ui-ux-pro-max`, `claude-obsidian`, `playwright`(+skill), `codex`. Pierwsze wejście
po sklonowaniu = jednorazowy prompt zaufania do obcych marketplace'ów.

Koszt (#15): ~kilkadziesiąt opisów skilli na sesję — świadoma wymiana, te skille są
używane. Nie rozszerzaj bez policzenia kosztu; zawężaj per sesja przez `/plugin`.
`.claude/settings.local.json` (gitignore) na prywatne nadpisania.
