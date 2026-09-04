# Changelog

Format oparty na [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/).
Wersjonowanie semantyczne.

## [Niewydane]

### Proces

- **Przepływ `lokalnie → dev → main`** spisany w AGENTS.md #12 — feature branch
  scala się do `dev` (staging Railway) przez PR, dopiero zielony `dev` idzie na
  `main` (produkcja). Koniec pushowania feature'ów prosto na `main`.
- **`npm run check`** (`typecheck && lint && test`) + hook `.githooks/pre-push`
  odpalający go przed każdym `git push` (`git config core.hooksPath .githooks`).
- **Automatyczne testy UI (e2e)** — `@playwright/test` + `@axe-core/playwright`,
  `npm run e2e`, smoke desktop/mobile/WebKit w trybie mock, osobny job `e2e`
  w CI. AGENTS.md #16.
- **AGENTS.md #14/#15** — proces pracy nad zmianą (analiza oparta o źródła, TDD,
  weryfikacja UI, pass spójności przyczynowo-skutkowej) i ekonomia działań
  agenta.
- Commity i PR-y po angielsku (Conventional Commits); dokumentacja zostaje po
  polsku. `.github/pull_request_template.md`.
- **`.claude/settings.json`** (wersjonowany) przypina wtyczki agenta dla całego
  repo: `superpowers`, `ponytail`, `caveman`, `taste-skill`, `ui-ux-pro-max`,
  `claude-obsidian`, `playwright`, `codex`. AGENTS.md #17.

## [0.9.10] — 2026-09-03

Duża tura: przebudowa interfejsu wg makiety (własne trasy zamiast modali, nowy
system wizualny, widok stacji z kafelkami KPI i kolumną kontekstową), widżet
pogody, widżet stanu sieci, panel diagnostyki pollera oraz — najważniejsze pod
spodem — **odwrócenie kierunku zależności danych**: listę połączeń wyznacza teraz
rozkład, nie realizacja.

### Architektura danych

- **Rozkład wyznacza teraz listę połączeń, realizacja ją wzbogaca** —
  odwrócenie kierunku zależności w `board/transform.ts`. Powód zmierzony na
  żywym API podczas pięciodniowej awarii feedu realizacji PKP (27–31.08):
  `/operations` zwracało HTTP 200 z poprawnym kształtem, ale wyłącznie
  o kursach sprzed kilku dni, więc tablica była pusta, choć rozkład znał
  komplet dzisiejszych połączeń.

  Pomiar (Warszawa Centralna): 26.08 realizacja 392 / rozkład 394; 27.08
  realizacja 307 / rozkład 394 — **22% pociągów nie miało jak trafić na
  tablicę**. Dopasowanie po `scheduleId-trainOrderId|operatingDate` obejmuje
  100% kursów w obie strony, więc kursy z realizacji bez trasy są doklejane
  wyłącznie jako polisa (na danych: zero takich przypadków).

  Weryfikacja na żywym kluczu, ta sama chwila, przełącznik jako jedyna
  różnica: `operations` → 0 odjazdów, `schedule` → 42 odjazdy i 42 przyjazdy.

  Przełącznik `BOARD_SOURCE=schedule|operations` (domyślnie `schedule`)
  pozwala wrócić bez wdrażania kodu. **Tymczasowy** — do usunięcia nie
  wcześniej niż ~2026-09-14 (dwa tygodnie zdrowego feedu od naprawy 31.08),
  patrz AGENTS.md #10.

- **`degraded` obejmuje przypadek „są godziny, ale nie znamy opóźnień"** —
  tablica stojąca na samym rozkładzie nie może wyglądać na w pełni sprawną.
  `/api/board` niesie `realizationStale`, dzięki czemu UI odróżnia „API nie
  odpowiada — pokazujemy ostatnie znane dane" od „PKP nie podaje dziś danych
  o ruchu — godziny wg rozkładu".

- **Wariant trasy per (przejazd, dzień)** — `/schedules` (okno dziś+jutro,
  `fullRoute=true`) zwraca osobny rekord trasy dla każdego dnia kursowania tego
  samego przejazdu. Zmierzone na żywo: 2008 tras dla jednej stacji, 1657
  unikalnych kluczy przejazdu; zwykła `Map` „ostatni wygrywa" zostawiała
  w 217 przypadkach rekord z niewłaściwego dnia (910 zamiast 1094 dzisiejszych
  odjazdów). `indexRoutesByTrain()` / `findRouteForTrain()` w `board/routeKey.ts`
  trzymają wariant per dzień plus rezerwę bez daty (AGENTS.md #9).

- **Wykrywanie zamrożonego feedu + odtwarzanie planu z rozkładu** — poller
  rozpoznaje, że realizacja PKP stanęła (HTTP 200, kształt OK, ale dane sprzed
  dni) i zgłasza to jako `degraded` z `realizationStale`, zamiast czyścić widok.

- **`/operations` paginowane do końca** — poller brał dotąd tylko pierwszą stronę
  (sufit 5000) plus warunkowy węższy re-fetch; na dużym węźle w szczycie oba
  zapytania przekraczały 5000 (zmierzone na dev: 6382 dla samych obserwowanych,
  9566 z pomocniczymi), a ~1400 realizacji znikało po cichu co cykl — trasa
  z rozkładu bez dopasowanej realizacji trafiała wtedy na tablicę jako „jeszcze
  nie wyjechał" dla pociągu, który realnie jedzie. `fetchAllOperations()`
  dociąga wszystkie strony po `hasNextPage` (`client.getOperations(ids, page?)`,
  parametr ze swaggera), z bramką budżetową (`PAGINATION_MIN_HOURLY_BUDGET = 20`)
  i twardym sufitem `MAX_OPERATIONS_PAGES = 6`. Koszt neutralny: 2 strony = 2
  zapytania, tyle samo co dawny bulk + re-fetch. Zweryfikowane na żywym kluczu:
  15 obserwowanych stacji → `totalCount` 8314 → `records` 8314, `incomplete` false.
- **`realizationIncomplete` gdy paginacja się urwie** (budżet / limit stron /
  błąd) — `/api/board` niesie flagę, `BoardStatus` pokazuje baner „Duży ruch —
  część pociągów może być pokazana jako »jeszcze nie wyjechał«" zamiast po cichu
  udawać sprawną tablicę (AGENTS.md #7). Usunięte: `mergeUpstreamStops`,
  `operationTrainKey`, gałąź warunkowego re-fetchu; `truncatedRefetch` →
  `operations.incomplete` w diagnostyce.
- **`UPSTREAM_LOOKBACK_HOPS` 3 → 7** — na gęstych liniach podmiejskich (SKM/KM)
  ostatni potwierdzony przystanek bywa 5+ hopów przed obserwowaną stacją;
  `HOPS = 3` (kompromis z 2026-09-01, gdy `/operations` się ucinało) nie łapał
  takiego pociągu i wisiał on jako „jeszcze nie wyjechał". Odkąd
  `fetchAllOperations` paginuje, głębszy lookback nie grozi utratą danych —
  `MAX_AUX_STATIONS` (150) wciąż jest twardym sufitem.

### Dodane

- **Widok stacji wg makiety** — `/odjazdy/[stationId]` jako pełna strona
  (route group `(app)`): nagłówek z aktualnością danych / ulubionymi /
  „Udostępnij", cztery kafelki KPI („Odjazdy dzisiaj", „Przyjazdy dzisiaj",
  „Średnie opóźnienie", „Punktualność" — `board/stationStats.ts`, liczone
  w cyklu pollera, **zero dodatkowych zapytań do PKP**) i prawa kolumna
  kontekstowa (najpopularniejsze kierunki, utrudnienia na tej stacji,
  natężenie ruchu w dobie). Stary adres `/?focus={id}` przekierowuje tutaj —
  widok stacji jest jeden, nie dwa (AGENTS.md #2).

- **Szczegóły połączenia jako własna trasa** — `/polaczenie/[scheduleId]/[orderId]/[operatingDate]`
  zamiast modala: przebieg trasy przystanek-po-przystanku, wykres prognozy do
  celu, panel „informacje o połączeniu". Dane dociągane w tle przy powrocie na
  kartę / focus okna.

- **Pozycja „wg rozkładu" na `/polaczenie`** — dla pociągu bez żadnej realizacji,
  którego rozkład stawia w połowie trasy (`isScheduleProjection` w
  `board/trainDetail.ts`), oraz — od ostatniej poprawki — dla pociągu, którego
  PKP potwierdza przystanki paczkami z opóźnieniem, więc „ostatni potwierdzony"
  jest 3–5 przystanków za realną pozycją. `resolveProjectedStopIndex()` kotwiczy
  w ostatnim potwierdzonym przystanku i zakłada dalej tempo rozkładowe;
  `isStalePositionProjection()` włącza ten tryb tylko gdy projekcja stawia
  pociąg ≥ 2 przystanki za kotwicą i sama się wyłącza, gdy PKP nadgoni. Marker
  „Pociąg jest tutaj — szacowane z rozkładu", bez pulsu. **Wyłącznie
  `/polaczenie`** — tablica stacji nietknięta, projekcja stoi na `isConfirmed`
  + rozkładzie, nie na `predictedArrival` PKP (AGENTS.md #2).

- **Widżet pogody dziś dla stacji** — w prawej kolumnie widoku stacji
  (`/api/weather`, Open-Meteo, cache 25 min). Współrzędne z
  `data/station-coordinates.json` (statyczny plik, regenerowany przez
  `scripts/enrich-station-coords.mjs`); brak współrzędnych = jawny stan „brak
  lokalizacji", nie błąd. Open-Meteo jest bezkluczowe i stanowi drugie, poza
  PKP, wyjście sieciowe aplikacji (AGENTS.md #6).

- **Widżet stanu sieci** — ogólnopolska karta (`/api/network-stats`,
  `board/networkStats.ts`): liczba pociągów dziś wg statusu, punktualność
  z sparkline „dziś", najpopularniejsi przewoźnicy, liczba utrudnień na sieci.
  Własny cache modułowy (statystyki 15 min, utrudnienia 20 min, rozkład
  przewoźników 24 h), błąd któregokolwiek podzapytania degraduje łagodnie do
  ostatnich znanych danych. **Konsument budżetu zapytań poza cyklem pollera** —
  ~7 zapytań/h, liczony osobno (AGENTS.md #3).

- **Panel diagnostyki pollera** w pasku bocznym — źródło danych, stan pollera,
  budżet zapytań i status per źródło PKP. Widoczny **wyłącznie** w dev/staging
  (`showDiagnostics()` = `false` na produkcji, allowlista nie denylista).

- **Diagnostyka per źródło PKP** w `/api/health` i w karcie w pasku bocznym:
  dla `/operations`, `/schedules` i `/disruptions` osobno — czy ostatnia próba
  się powiodła, kiedy udało się ostatnio i ile rekordów przyszło. Wcześniej
  awarie rozkładu i utrudnień degradowały cicho, zostawiając `status: 'ok'`.

- **Utrudnienia na trasie** (`/disruptions`, `board/disruptions.ts`) — badge
  w wierszu tablicy i sekcja w panelu szczegółów połączenia, plus licznik
  w widżecie stanu sieci. Dopasowanie i dekodowanie treści w jednym miejscu,
  używane przez tablicę i panel (ten sam wzorzec co `realization.ts`).

- **Opóźnione pociągi zostają na tablicy** — wcześniej wypadały z okna;
  teraz zostają widoczne z pełnym statusem, plus legenda diagnostyki.

- **Ostrzeżenie o możliwych niewidocznych odwołaniach** — gdy tablica stoi na
  samym rozkładzie (brak realizacji), UI sygnalizuje, że odwołania mogą nie
  być widoczne.

- **Plakietka niewyruszonego pociągu pokazuje prognozowane opóźnienie** —
  szacunek ze stacji bezpośrednio poprzedzającej (`board/upstreamEstimate.ts`),
  z zastrzeżeniem w tooltipie, że to estymata, nie potwierdzony fakt.

- **`/api/v1/data-version` jako sygnał zamrożenia danych** — wołane warunkowo,
  dopiero gdy feed wygląda na zamrożony, z dławikiem 5 min. Rozstrzyga „to my
  nie pobieramy czy oni nie publikują" jednym zapytaniem. (Ten sam endpoint był
  wcześniej zbadany i odrzucony jako sygnał odświeżania cache'u — tamten wniosek
  nadal obowiązuje.)

- **Sygnał `usedFullRouteFallback`** — fakt sięgnięcia po `/schedules` bez
  `fullRoute` istniał dotąd wyłącznie w logu serwera, a wynik lądował w cache'u
  na 24 h, więc kolejne cykle nawet nie logowały.

- **Ostatni znany dobry rozkład** w pollerze, bez TTL. Cache klienta wygasa po
  24 h, czyli przestaje działać dokładnie w dłuższej awarii, kiedy jest
  najbardziej potrzebny.

- **Testy kontraktowe wobec swaggera PKP** (`src/lib/pkp/contract.test.ts`,
  `PKP_CONTRACT=1`) — sprawdzają obecność pól i parametrów, na których stoi
  `schema.ts` (2026-08-30 zniknięcie `withPlanned`/`fullRoute` zrobiło cichą
  awarię).

### Zmienione

- **Nowy system wizualny** — dociągnięcie do makiety Claude Design: krój
  Manrope, przebudowane tokeny kolorów, wspólna biblioteka ikon
  (`src/components/icons.tsx`), nasycone tokeny statusów identyczne w obu
  motywach (WCAG AA), pasek boczny (`Sidebar`) wyniesiony do layoutu, `TopBar`
  z wariantami nagłówka i powrotu, kolapsowalny pasek boczny z persystowanym,
  walidowanym stanem. Wersja aplikacji i środowisko widoczne w nagłówku paska
  bocznego.

- **Pełna tablica** — okno od 5 min wstecz do 3 h naprzód (maks. 40 pozycji,
  domyślnie 10 + „Pokaż więcej połączeń" po stronie klienta), kierunek
  z przystankami pośrednimi („przez …, +N przystanków"), peron i tor jako dwie
  osobne wartości, pasek akcentu w kolorze statusu, błysk tła wiersza przy
  zmianie opóźnienia (wyłączony przy `prefers-reduced-motion`). Poniżej `sm`
  wiersz układa się w kartę bez dublowania treści dla czytników ekranu.

- **Przełącznik motywu** — przeniesiony z paska bocznego do stałej ikony
  w prawym górnym rogu.

- **Godziny na tablicy zawsze w strefie warszawskiej** — nie w strefie
  przeglądarki.

### Naprawione

- **Klucz cache'u rozkładu nie zawierał okna dat** — przy TTL 24 h rozkład
  pobrany o 14:00 obsługiwał zapytania z dnia następnego aż do 14:00, czyli
  przez kilkanaście godzin dziennie aplikacja pracowała na oknie bez dnia
  bieżącego. Niewidoczne, dopóki listę wyznaczała realizacja; po przepięciu
  oznaczałoby pustą tablicę.

- **Nieudane wczytanie współrzędnych** nie gaśnie już na stałe ani nie udaje
  braku lokalizacji — rozróżnia „nie znamy współrzędnych tej stacji" od „nie
  udało się teraz pobrać".

- **Progi pokrycia kodu** (89/87/89/91) i **testy w obu strefach czasowych**
  w CI — `TZ` nie było ustawiane nigdzie, mimo wymogu z AGENTS.md #1.

- Drobiazgi UI — mobilny status w osobnym wierszu, mobilna tablica chowała
  status i peron, `reduced-motion` tylko na błysku, panele boczne przypięte do
  okna przy długiej liście połączeń, legenda statusów renderowana przez portal
  (nie obcięta, w pełni kryjąca), ponowienie zapytania po timeout (`AbortError`),
  hydration mismatch w nagłówku tablicy.

### Dostępność

- Obsługa klawiatury w wyszukiwarce, `Escape` zamyka legendę, węższy
  `aria-live` na linijce statusu (nie na całej tablicy).

### Infrastruktura

- `next.config.ts` — rozbudowane nagłówki bezpieczeństwa; `turbopack.root`
  przypięty do katalogu projektu (worktree agentów myliło lockfile).
- `Dockerfile` — `ARG RAILWAY_GIT_BRANCH` / `RAILWAY_ENVIRONMENT_NAME`
  w etapie budowania (bez tego etykieta gałęzi/środowiska w UI była martwa na
  produkcji).
- CI odpala się przy pushu na `main` **i** `dev` (Railway deployuje z obu);
  bezpośrednie pushe na `dev` przechodzą przez bramkę jakości.
- Pokrycie kodu mierzone w CI; testy uruchamiane w `Europe/Warsaw` i `UTC`.
- `.claude/launch.json` przestał być śledzony.

### Testy

- 150 → 825 (8 pominiętych = kontrakt swaggera, `PKP_CONTRACT=1`). Nowe pliki:
  `board/resilience`, `board/routeKey`, `board/stationStats`,
  `board/networkStats`, `pkp/contract`, `lib/validation`, cały `lib/weather/`.

## [0.9.9] — 2026-08-06

### Dodane

- **Szczegóły połączenia po kliknięciu w wiersz tablicy** — pełna trasa
  przystanek-po-przystanku (`/api/train`, wołane dopiero po kliknięciu,
  cache 90 s), z opóźnieniem liczonym osobno dla każdego przystanku (nie
  rozlanym z całego pociągu), peronem/torem gdzie PKP je poda, poprawną
  obsługą pociągów bez dopasowanej trasy i długich list (35+ przystanków —
  przewija się tylko lista, nagłówek panelu zostaje przypięty).
- **Adresowalność i udostępnianie** — rozwinięta stacja, aktywna zakładka
  i otwarty panel szczegółów są teraz odzwierciedlone w adresie URL
  (`history.replaceState`, bez zależności od routera Next), z przyciskiem
  „Kopiuj link" w nagłówku tablicy.
- Ikona aplikacji (favicon) — prosty SVG pociągu zamiast domyślnej ikony
  create-next-app.

### Zmienione

- **Fixture'y mocka odświeżone na realistyczne dane.** Prawdziwe ID i nazwy
  stacji (zweryfikowane na żywym API i aktualnym schemacie OpenAPI —
  wcześniej fikcyjne, np. Warszawa Centralna `5100` zamiast `33605`), 8
  pociągów zamiast 3 (opóźniony, odwołany, częściowo odwołany, jeszcze
  niewyjechany, zakończony), 6 przewoźników zamiast 2.

### Naprawione

- **Tablica główna pokazywała pociąg, który jeszcze nie wyjechał, jako
  punktualny.** PKP potrafi wpisać w pole „faktyczny czas" kopię czasu
  planowego dla pociągu ze statusem „jeszcze niewyjechał", nawet godzinami
  przed odjazdem — nie tylko tuż po nim (zaobserwowane na produkcji: R1
  91342, Koleje Mazowieckie). Naprawione i uogólnione: logika „czy to się
  już wydarzyło" opiera się teraz wyłącznie na polu `isConfirmed` per
  przystanek — tym samym sygnale, którego od początku poprawnie używał
  panel szczegółów połączenia — więc chroni każdy status pociągu (w tym
  częściowo odwołany, `Q`), nie tylko dosłowne dopasowanie `trainStatus=S`.

### Zrefaktoryzowane (bez zmiany zachowania)

- **Ujednolicona logika statusu/opóźnienia połączenia między tablicą
  a panelem szczegółów** — wcześniej dwie niezależne implementacje tej samej
  reguły, które już raz się rozjechały (patrz „Naprawione" wyżej). Teraz
  jeden współdzielony moduł, `src/lib/board/realization.ts`
  (`resolveStopStatus`, `resolveDelayMinutes`), używany przez
  `board/transform.ts`, `board/trainDetail.ts` i `ConnectionDetails.tsx`.
- Wspólne wzorce walidacji identyfikatorów (stacje, `scheduleId`/`orderId`/
  `operatingDate`) wydzielone do `src/lib/validation.ts`, re-używane przez
  route handlery i odtwarzanie stanu z URL.

### Testy

- Pełna macierz `isCancelled × isConfirmed × opóźnienie` dla nowego modułu
  `realization.ts`, w tym dokładnie odtworzony przypadek produkcyjny.
- Nowy test dla pociągu częściowo odwołanego (`Q`) z mieszanką przystanków
  odwołanych i niepotwierdzonych-ale-nieodwołanych.
- Nowe asercje na renderowany status panelu szczegółów dla niepotwierdzonego
  i odwołanego przystanku — fixture testowy je już miał, ale nic wcześniej
  nie sprawdzało wyniku.

### Dokumentacja

- README i AGENTS.md zaktualizowane o szczegóły połączenia, udostępnianie
  linkiem i nową regułę o pułapce `isConfirmed` kontra „faktyczny czas".

## [0.9.8] — 2026-08-04

### Zmienione

- Kafelki stacji na dashboardzie (`StationCard`) na wąskim ekranie pokazują
  teraz sam kod przewoźnika (np. „PR", „IC") zamiast pełnej nazwy prawnej —
  ten sam wzorzec co już działał w pełnej tablicy (`FullBoard`). Od `sm`
  wzwyż nadal pełna nazwa.
- Kolumna „Peron/Tor" w pełnej tablicy (`FullBoard`) jest teraz widoczna
  także poniżej ~640px (wcześniej ukryta jak wcześniej „Przewoźnik").
- Linijka „Ostatnia aktualizacja" (dashboard i pełna tablica, wspólny
  komponent `BoardStatus`) ma teraz dopisane jedno krótkie zdanie po polsku,
  bez żargonu: „Dane odświeżają się automatycznie co ok. 1,5 minuty" —
  wcześniej częstotliwość odświeżania nie była nigdzie wytłumaczona
  użytkownikowi nietechnicznemu.

### Dodane

- Peron i tor pociągu widoczne teraz też na kafelku stacji (`StationCard`),
  nie tylko w pełnej tablicy — „Peron/Tor: 4/2" (albo „—", gdy nieznany)
  w drugiej linii każdego odjazdu.

## [0.9.7] — 2026-08-04

### Naprawione

- Część pociągów pokazywała surowy identyfikator wewnętrzny zamiast nazwy,
  pusty przewoźnik — na żywych danych (Warszawa Centralna) dotyczyło to ok.
  połowy pociągów w skali dnia. Przyczyna: dopasowanie `/operations` do
  `/schedules` po samej parze `scheduleId-orderId`, podczas gdy prawdziwym
  wspólnym kluczem — gdy obecny — jest `trainOrderId` (dokumentacja API:
  „obecny tylko gdy różni się od OrderId, np. gdy ten sam wzorzec trasy
  realizuje kilka odrębnych pociągów"; na żywych danych różnił się niemal
  zawsze). Naprawione przez `routeKey()` w `board/transform.ts`, używane
  identycznie po obu stronach dopasowania (`board/poller.ts`). Zero
  dodatkowego kosztu budżetu — te same dwa zapytania co wcześniej.

### Dodane

- Odjazdy/przyjazdy sprzed maksymalnie 5 minut są teraz nadal widoczne na
  liście (wcześniej: 1 minuta) — pozwala zobaczyć pociąg, który właśnie
  odjechał, bez czekania na kolejne odświeżenie.
- Status „jeszcze nie wyjechał" (`trainStatus=S` z `/operations`, dotąd
  nieużywane pole) zamiast ogólnego „brak danych" — bez dodatkowego kosztu,
  pole już przychodziło w każdej odpowiedzi.
- Logo Polregio (PR) — źródło: Wikimedia Commons, domena publiczna
  (PD-textlogo), zoptymalizowane SVGO (8.5 KB → 4.8 KB).
- Godzina odjazdu przy każdym z 3 najbliższych połączeń na kafelku stacji
  (`StationCard`) — wcześniej widoczna tylko w pełnej tablicy (`FullBoard`).
- Połączenia, których planowy czas już minął (mieszczące się w oknie 5 minut
  wstecz), są wizualnie przygaszone — nazwa, kierunek i godzina jaśniejszym
  szarym, żeby odróżnić je od nadchodzących. Plakietka statusu zostaje
  w pełnym kolorze. Wyłącznie po stronie przeglądarki, porównanie z bieżącym
  czasem odświeżane przy każdej nowej porcji danych — bez tykającego zegara.
- Kafelki ulubionych stacji na dashboardzie (`StationCard`) pokazują teraz
  tylko nadchodzące połączenia — pociągi, które już odjechały (mieszczące się
  w oknie 5 minut wstecz), zostają wyłącznie w pełnej tablicy (`FullBoard`,
  przygaszone jak wyżej).

### Zmienione

- Kolumna „Przewoźnik" w pełnej tablicy (`FullBoard`) jest teraz widoczna
  także poniżej ~640px (wcześniej całkiem ukryta) — na wąskim ekranie pokazuje
  sam kod przewoźnika (np. „IC"), od `sm` wzwyż pełną nazwę.
- Pełna nazwa przewoźnika pochodzi teraz ze słownika `dictionaries.carriers`
  dołączonego do każdej odpowiedzi `/api/v1/schedules` (kod → pełna nazwa
  prawna, np. „POLREGIO S.A.") zamiast z ręcznie zgadywanej lokalnej listy —
  bez dodatkowego zapytania, dane już przychodziły w tej samej odpowiedzi.
  `src/lib/carriers.ts` mapuje już tylko kod → logo.
- **Optymalizacja pollera — `/operations` już nie prosi o `fullRoutes=true`.**
  Zgłoszone błędy odświeżania (logi produkcyjne: `AbortError` — nasz własny
  timeout 8 s; `ECONNRESET`/`ETIMEDOUT` — zerwane połączenie) i „długo trwa"
  miały wspólną przyczynę: `fullRoutes=true` dokładał pełną trasę (śr. 15
  przystanków) do KAŻDEGO z ~1500 pociągów na cykl pollera (~90 s), choć kod
  używał tylko jednego przystanku i pierwszej/ostatniej stacji do „Kierunku".
  Zmierzone na żywo (Warszawa Centralna): 8.6 MB → 680 KB (12,7× mniej), ten
  sam request co 90 s. Origin/destination do „Kierunku" teraz z dopasowanej
  trasy `/schedules` (nowy parametr `fullRoute=true` tam — cache 24h, koszt
  jednorazowy zamiast co 90 s; 462 KB → 2.4 MB, ale rzadko i cache'owane).
  Zero wpływu na budżet zapytań/godzinę (reguła nr 2 AGENTS.md) — zmienia się
  tylko rozmiar, nie liczba zapytań. Gdy żadna trasa się nie dopasuje (rzadki
  przypadek), „Kierunek" pokazuje „—" zamiast błędnych danych.

## [0.9.6] — 2026-08-03

### Naprawione

- Pociągi odjeżdżające tuż po północy pokazywały surowy identyfikator
  wewnętrzny zamiast nazwy, pusty przewoźnik i „—" w peronie/torze —
  zgłoszone na produkcji (Warszawa Centralna, Warszawa Ursus). Przyczyna:
  `/schedules` domyślnie zwraca kursy tylko z „dzisiaj" (`dateFrom`/`dateTo`),
  a pociąg po północy formalnie kursuje „jutro" wg tych parametrów, więc
  `getSchedules()` nigdy nie miał dla niego trasy do dopasowania — mimo że
  `/operations` już pokazywał go w widoku 2h naprzód. Naprawione przez jawne
  żądanie okna dziś+jutro wg **kalendarza warszawskiego** (nie strefy procesu
  — ten sam rodzaj pułapki co przy `normalizeApiTimestamp`, patrz `time.ts`).
  Wciąż jedno zapytanie do `/schedules` na cykl pollera, zero dodatkowego
  kosztu budżetu.

## [0.9.5] — 2026-08-03

Dwie drobne poprawki po pierwszym rzucie oka na 0.9.4.

### Zmienione

- Przełącznik jasny/ciemny przeniesiony z nagłówka (obok nazwy aplikacji) do
  stałego przycisku w prawym górnym rogu ekranu — widoczny niezależnie od
  stanu strony (dashboard, pusty stan, pełna tablica) bez duplikowania go
  w każdym z nich.
- Kolumna „Peron" w rozwiniętym widoku stacji (`FullBoard`) — zmieniona na
  „Peron/Tor" i faktycznie wypełniona danymi: `/schedules` (per-stopover
  `arrivalPlatform`/`arrivalTrack`/`departurePlatform`/`departureTrack`)
  było już pobierane co cykl pollera, ale aplikacja nie parsowała tych pól —
  kolumna zawsze pokazywała samo „—". Format: „4/2" gdy znane są oba, sam
  peron albo „tor 2" gdy tylko jedno z nich. Zero nowych zapytań do PKP.

## [0.9.4] — 2026-08-03

Runda drobnych poprawek czytelności i UX zgłoszonych po przejrzeniu aplikacji
w trybie jasnym.

### Zmienione

- Nazwa aplikacji: „Monitor opóźnień PKP" → „Monitor opóźnień" (tytuł karty,
  nagłówek, `README.md`, `AGENTS.md`) — monitorujemy też pociągi innych
  przewoźników niż PKP, więc nazwa własna nie powinna sugerować wyłączności.
  Odniesienia do rzeczywistego API PKP PLK (zmienne środowiskowe, moduły,
  klucz `localStorage`, logo przewoźnika) zostają bez zmian — to nie jest
  nazwa aplikacji, tylko nazwa przewoźnika/API.
- Kolumna „Pociąg" pokazywała syntetyczny klucz wewnętrzny
  (`scheduleId-orderId`, np. „26-12345") zamiast realnej nazwy/numeru
  pociągu — mimo że `/schedules` (już pobierane co cykl pollera) zwraca
  pola `name` (pełna nazwa, np. „EIC Grunwald") i `nationalNumber`
  (numer/linia, np. „S1"), o czym schemat Zod dotąd nie wiedział. Kolejność
  pierwszeństwa: nazwa pociągu → kategoria + numer linii → dawne zachowanie
  (kategoria + klucz wewnętrzny) jako ostatnia deska ratunku. Zero nowych
  zapytań do PKP.
- Tabela w rozwiniętym widoku stacji (`FullBoard`) chowa kolumny
  „Przewoźnik" i „Peron" poniżej 640px — wcześniej brak breakpointów
  wymuszał przewijanie w poziomie na telefonie, żeby zobaczyć wszystkie
  6 kolumn.

### Dodane

- Ręczny przełącznik jasny/ciemny obok nazwy aplikacji. Infrastruktura
  (`next-themes`, zmienne CSS, `dark:` w komponentach) już istniała —
  brakowało wyłącznie widocznej kontrolki.

## [0.9.3] — 2026-08-02

Runda refaktoru i porządków po intensywnym okresie poprawek bezpieczeństwa
(`client.ts` i `poller.ts` zbierały łatki przyrostowo — 11 i 9 zmian
w historii). Zweryfikowana metodą: bezpośrednie czytanie „gorących" plików
plus dwaj niezależni agenci Explore (frontend, tooling/infra), z jawnym
odrzuceniem części znalezisk jako niepotrzebnych przy tej skali projektu.

### Naprawione

- `FullBoard` renderował baner błędu konfiguracji **razem z** zakładkami,
  linijką statusu i pełną tabelą pod spodem — mieszanie sygnałów, przed
  którym ostrzega `AGENTS.md`. Teraz nagłówek (nazwa stacji + „Zamknij")
  zostaje zawsze, reszta chowa się za baner.
- `mock.ts` odpalał rozgrzewkę słownika stacji jako „fire and forget" bez
  `.catch()` — nieudane parsowanie fixture'a stawało się nieobsłużonym
  odrzuceniem obietnicy zamiast kontrolowanego błędu. Potwierdzone testem
  nasłuchującym `process.on('unhandledRejection')`.
- Trzy podatności `high` w `sharp`/`postcss` domknięte poprzednio zostają
  bez zmian; `@types/node` podniesione z `^20` do `^24`, zgodnie z faktycznym
  środowiskiem uruchomieniowym (`engines`, `Dockerfile`).

### Zrefaktoryzowane (bez zmiany zachowania)

- `client.ts` — wydzielone `fetchJson()` usuwa potrójną duplikację
  fetch+obsługa błędu.
- `poller.ts` — usunięta martwa gałąź `wake(false)`, nigdy niewywoływana.
- Sześć plików testowych dzieliło identyczną funkcję `jsonResponse()`
  skopiowaną dosłownie — wydzielona do `src/test-utils/http.ts`.
- `FullBoard.tsx` — wydzielone lokalne `PillButton` i `TabButton` usuwają
  zduplikowane bloki JSX w tym samym pliku.
- `BoardStatus.tsx` — kolor ostrzeżenia (`text-amber-700 dark:text-amber-400`,
  potrójnie inline) wydzielony do stałej.
- `EmptyState.tsx` i `page.tsx` miały bit-identyczny `<h1>` tytułu aplikacji
  w dwóch wzajemnie wykluczających się stanach — wydzielony do `AppTitle`.

### Narzędzia

- Dodany `eslint-plugin-testing-library` (ograniczony do plików testowych).
  Pierwsze uruchomienie złapało 23 miejsca z `waitFor` + `getBy*` zamiast
  `findBy*` oraz kilka miejsc z surowym dostępem do DOM tam, gdzie zapytania
  po roli wystarczały — naprawione. Kilka pozostało z uzasadnionym
  `eslint-disable`: obraz dekoracyjny (`alt=""`) i test bezpieczeństwa
  sprawdzający nieobecność `<script>`/`<iframe>` w DOM-ie fizycznie nie da
  się przepisać na zapytania po roli ARIA.

### Świadomie odrzucone jako niepotrzebne

Memoizacja (`useMemo`/`useCallback`) w drzewie komponentów, różnica tokenu
koloru amber między dwoma odznakami, domyślna wartość `size` w
`CarrierLogo`, zmiany w Dockerfile/CI/`next.config.ts`/progu pokrycia
testów — wszystko sprawdzone i uznane za niewspółmierne do korzyści przy
tej skali projektu. Szczegóły uzasadnień w historii commitów.

202 testy (bez zmiany liczby — refaktor grupy B nie modyfikował logiki
testów, tylko sposób zapytań).

## [0.9.2] — 2026-08-02

Przegląd jakościowy i bezpieczeństwa. Bez zmian funkcjonalnych widocznych dla
użytkownika poza usuwaniem stacji i odpornością na uszkodzone dane lokalne.

### Bezpieczeństwo

- **Wstrzykiwanie parametrów do zapytań do PKP.** Identyfikatory stacji szły
  z parametru URL prosto do zapytania kierowanego do zewnętrznego API, bez
  walidacji i bez kodowania. `stations=5100%26pageSize%3D5000` dopisywał własny
  parametr, a `%23` ucinał resztę zapytania. Teraz walidacja formatu u wejścia
  i kodowanie każdego identyfikatora osobno.
- **Wyczerpanie budżetu zapytań przez anonimowego klienta.** Każde nieznane ID
  omijało dławik pollera i zamieniało się w zapytanie do PKP — 60 żądań dawało
  60 wywołań. Limit 100/h dało się wyczerpać w ~100 żądaniach. Obrona
  dwuwarstwowa: odsiewanie ID spoza słownika oraz pula wymuszonych przebiegów
  w oknie kroczącym.
- **Zwielokrotnienie zapytań przy równoległych żądaniach.** Cache słownika
  i rozkładów był sprawdzany przed `await`, a zapisywany po nim; osiem
  równoległych wywołań dawało osiem zapytań zamiast jednego. Deduplikacja
  żądań w locie.
- **Brak limitu liczby stacji** w `/api/board` (maks. 20) oraz **brak limitu
  długości zapytania** w `/api/stations` (maks. 100 znaków).
- **Brak nagłówków bezpieczeństwa.** Doszły CSP, `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` i HSTS poza dev;
  `X-Powered-By` wyłączony.
- **Trzy podatności `high` w zależnościach** (`sharp`, `postcss`) domknięte
  przez `overrides`, bez downgrade'u Next.

### Naprawione

- Uszkodzony wpis w `localStorage` wywracał cały interfejs. `JSON.parse(...) as
  Favourite[]` niczego nie sprawdzał, więc `{"a":1}` przechodził jako lista
  ulubionych i `favourites.map` rzucał wyjątkiem — biała strona, z której
  użytkownik nie mógł wyjść bez narzędzi deweloperskich. Walidacja schematem
  Zod, z odsiewaniem pojedynczych złych wpisów zamiast kasowania całej listy.

### Interfejs

- Kolumna „Planowo" w tablicy odjazdów renderowała godziny bez `tabular-nums`,
  więc cyfry miały proporcjonalne szerokości i kolumna „falowała" przy skanowaniu
  wzrokiem. Teraz wszystkie komórki godzin mają identyczną szerokość.
- Krój pisma przeszedł z `Arial, Helvetica` — pozostałości po szablonie
  `create-next-app`, która przetrwała nawet przebudowę na styl „glass" — na stos
  systemowy (`system-ui` z fallbackami). Zero kosztu wczytywania, poprawny
  hinting i lepsze renderowanie polskich znaków diakrytycznych.

### Testy

- 159 → 199 testów. Doszły pliki dla `DelayBadge` (status nigdy samym kolorem),
  kompozycji `page.tsx`, bezpieczeństwa renderowania danych z API oraz nagłówków
  odpowiedzi.
- Uzupełnione dwie nieprzetestowane ścieżki awarii: timeout żądania (8 s)
  i odrzucenie odpowiedzi niezgodnej ze schematem.

## [0.9.1] — 2026-08-02

Pierwsze wydanie po uruchomieniu na produkcji na prawdziwym kluczu API.
Zawiera poprawkę błędu, który ujawnił się dopiero tam.

### Naprawione

- **Czasy bez oznaczenia strefy były interpretowane w strefie procesu.**
  `/operations` potrafi zwrócić `"2026-08-02T00:33:00"` — bez `Z`, bez offsetu.
  To czas warszawski, ale `new Date()` czyta taki ciąg w strefie procesu:
  lokalnie (`Europe/Warsaw`) wychodziło przypadkiem dobrze, a w kontenerze na
  Railway (UTC) każdy pociąg przesuwał się o +2 h. Skutek na produkcji: pociągi,
  które już odjechały, pokazywały się jako nadchodzące za chwilę.

  Nowe `src/lib/pkp/time.ts` normalizuje cztery pola czasowe na granicy schematu
  Zod. Przesunięcie CET/CEST liczy `Intl` z jawną strefą `Europe/Warsaw`, a nie
  strefa procesu, więc wynik nie zależy od tego, gdzie działa kontener.
  Normalizacja jest idempotentna — fixture'y z jawnym `+02:00` przechodzą bez
  zmian. Test regresyjny używa dosłownego payloadu z produkcji i pada
  pod `TZ=UTC`, jeśli normalizacja zniknie.

### Potwierdzone na żywych danych

Rzeczy, które w 0.9.0 były założeniami z dokumentacji:

- Kody przewoźników `IC`, `KM`, `SKM` i `ŁKA` są poprawne — logotypy dla nich
  faktycznie się pokazują. Pozostałe wpisy w `carriers.ts` nadal zgadywane.
- Kategorie handlowe są bogatsze niż zakładano (`EIP`, `EC/EIC`, `RE2`, `S3`,
  `ŁS` i inne). Nie interpretujemy ich, więc nowe wartości niczego nie psują.
- Kolumna „Peron" faktycznie zawsze pusta — `/operations` nie zwraca tego pola.
- `trainNumber` to na żywo `2026-424939627`, czyli rok + identyfikator
  wewnętrzny — nie handlowy numer pociągu.
- ID stacji w fixture'ach nie odpowiadają żywym (Warszawa Centralna: `5100`
  w mocku, `33605` na żywo), więc ulubione nie przenoszą się między trybami.

### Zbadane, bez zmian w kodzie

- **Przyczyna opóźnienia** — `/operations` nie ma takiego pola. Dane są
  w osobnym `/api/v1/disruptions`, złączalnym po `scheduleId` + `orderId`.
  Odłożone: pokrycie byłoby częściowe (tylko sformalizowane zdarzenia),
  a endpoint nie da się cache'ować jak `/schedules`, więc kosztowałby trzecie
  zapytanie na cykl pollera. Szczegóły w README.

### Dokumentacja

- README opisuje stan po wdrożeniu na produkcję, regułę dotyczącą stref czasowych
  i uzasadnienia decyzji, nie tylko ich efekt.
- `AGENTS.md` dostał listę niezmienników projektu — rzeczy, które łatwo zepsuć
  nieświadomie i które nie wynikają wprost z kodu.

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
- Ulubione stacje w `localStorage` pod kluczem `pkp.favourites.v1`, usuwane
  krzyżykiem wprost z kafelki na dashboardzie.
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

- Linijka statusu pokazuje wiek danych, gdy snapshot ma 3+ minuty, oraz
  informuje, gdy API nie odpowiada lub gdy odświeżanie zostało ograniczone
  przez limit zapytań. Wcześniej `/api/board` liczył `budget`, `ageMs`
  i `status: 'degraded'`, a interfejs je ignorował.

### Naprawione

- Dławik 45 s na wymuszony przebieg pollera jest pomijany dla stacji, która
  nie ma jeszcze żadnych danych — pierwsze wejście na nową stację nie czeka.
- Brak nagłówka `X-RateLimit-*` był liczony jako zero pozostałych zapytań, co
  natychmiast i na stałe spychało poller na interwał awaryjny 5 minut.
- Poller ignorował limit godzinowy; przy 90 s zużywa ~40 zapytań na godzinę,
  więc dało się wyczerpać limit 100/h przy zdrowym limicie dobowym.
- Ponowienie po błędzie 5xx szło natychmiast, zwykle prosto w tę samą awarię;
  teraz czeka z jitterem.
- `StationCard` opakowywał nagłówek i listę w `<button>` — niepoprawny HTML,
  przez który nagłówek stacji znikał z nawigacji, a czytnik ekranu odczytywał
  całą zawartość kafelki jako nazwę przycisku.
- Dashboard łączył snapshoty z ulubionymi po pozycji w tablicy, więc po
  usunięciu stacji ze środka listy karta mogła pokazać nazwę jednej stacji
  z odjazdami innej.
- Licznik opóźnionych pokazywał „1 opóźnionych" — doszła polska odmiana
  z obsługą nastek.
- Pusta tablica na zakładce Przyjazdy informowała o braku odjazdów.
- `/api/stations` nie miało obsługi błędów: awaria słownika stacji kończyła
  się nieobsłużonym wyjątkiem i pustym 500.
- Wyszukiwarka nie znosiła braku polskich znaków („Wroclaw" nie znajdowało
  „Wrocławia") i po cichu czyściła listę zarówno przy zerze wyników, jak
  i przy błędzie.
- `skm.svg` nie miał `viewBox`, więc jako jedyne logo nie skalowało się do
  zadanej wysokości.

### Wydajność

- Cache rozkładów i rejestr nazw stacji rosły bez ograniczeń przez cały czas
  życia procesu; oba mają teraz TTL i twardy limit wpisów.
- Klient mock parsuje fixture'y raz, a nie przy każdym tiku pollera.
- Logotypy przepuszczone przez SVGO: 57,4 KB → 30,0 KB (−48%). `next/image` zastąpiony
  zwykłym `<img>`, bo optymalizator Next i tak nie obsługuje SVG.
- Usunięte nieużywane assety ze scaffoldu `create-next-app`.

### Znane ograniczenia

Lista w [README](README.md#znane-ograniczenia-09-beta). Najważniejsze:
aplikacja nie została jeszcze uruchomiona na żywym kluczu API.

### Wewnętrzne

- Katalog `docs/` (projekt techniczny i plan implementacji) przestał być
  śledzony przez git — pozostaje lokalnie.
- CI odpala się także przy pushu na `main`, z którego deployuje Railway;
  wcześniej bramka jakości działała wyłącznie na pull requestach.
- Warstwa runtime obrazu Dockera nie chodzi już jako root.
- Wersja Node zapisana raz, w `.nvmrc`, i czytana stamtąd przez CI.
- 98 → 150 testów.
