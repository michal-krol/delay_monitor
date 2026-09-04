<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Monitor opóźnień — niezmienniki projektu

Rzeczy, które łatwo zepsuć nieświadomie, bo nie widać ich w kodzie w miejscu,
w którym się pracuje. Pełny opis architektury i uzasadnienia: `README.md`.

## 1. Żaden czas z API nie może przejść przez gołe `new Date()`

`/operations` czasem zwraca czasy bez oznaczenia strefy (`"2026-08-02T00:33:00"`).
To czas warszawski, ale `new Date()` czyta taki ciąg w strefie **procesu** —
lokalnie w Polsce wychodzi przypadkiem dobrze, w kontenerze na Railway (UTC)
przesuwa każdy pociąg o 1–2 h. Ten błąd już raz trafił na produkcję.

Wszystkie cztery pola czasowe (`plannedArrival`, `plannedDeparture`,
`actualArrival`, `actualDeparture`) przechodzą przez `normalizeApiTimestamp()`
z `src/lib/pkp/time.ts`, na granicy schematu Zod. Jeśli dokładasz nowe pole
czasowe z API — podłącz je tam samo.

To samo dotyczy pytania „czy to jest dzisiaj": data dnia liczy się przez
`warsawDateString()`, nigdy przez `new Date().toISOString().slice(0, 10)`.
Statystyki stacji odsiewają kursy jutrzejsze po `operatingDates` (okno
`/schedules` to dziś+jutro), więc po 22:00 czasu lokalnego proces w UTC
liczyłby jutrzejszy rozkład jako dzisiejszy. Godziny z `/schedules`
(`departureTime`, „HH:mm:ss") są już czasem warszawskim — czytaj je z ciągu,
nie przepuszczaj przez `Date`.

Uruchamiaj testy także pod `TZ=UTC` — to odwzorowuje produkcję:

```bash
TZ=UTC npm run test
```

## 2. Obecność „faktycznego czasu" nie znaczy „już się wydarzyło"

Dla pociągu, który jeszcze nie wyjechał, PKP potrafi wpisać w
`actualArrival`/`actualDeparture` **kopię** planowego czasu — nawet godzinami
przed odjazdem, nie tylko tuż po nim (zaobserwowane na produkcji: pociąg
R1 91342, Koleje Mazowieckie, `trainStatus: "S"`). Kod, który traktuje
`actualAt !== null` jako dowód realizacji, pokaże taki pociąg jako punktualny
— dokładnie ten błąd raz już trafił na tablicę główną.

Jedynym wiarygodnym sygnałem jest pole `isConfirmed` („Czy przejazd
potwierdzony" — opis w swaggerze PKP), sprawdzane **per przystanek**, nie
per pociąg (`trainStatus`). Cała logika „czy to się już wydarzyło i o ile
jest opóźnione" żyje w jednym miejscu — `src/lib/board/realization.ts`
(`resolveStopStatus`, `resolveDelayMinutes`) — używanym zarówno przez tablicę
(`board/transform.ts`), jak i panel szczegółów połączenia (`board/trainDetail.ts`,

**Wyjątek, żeby nie przeoczyć przy czytaniu kodu:** `hasTrainStartedFromStatus()`
w tym samym pliku *świadomie* czyta `trainStatus` (`P`/`C`) — ale wyłącznie do
pytania „czy pociąg jako całość gdzieś już ruszył", żeby na tablicy zamiast
mylącego „jeszcze nie wyjechał" pokazać „w trasie" dla pociągu, który już jedzie,
tylko jeszcze nie dotarł do obserwowanej stacji. To nie jest per-przystankowe
pytanie „czy TEN przystanek się wydarzył" (do tego nadal wyłącznie `isConfirmed`)
i nie zmienia sposobu liczenia opóźnienia — nie łam tego rozróżnienia.
`ConnectionDetails.tsx`). Nie duplikuj tej logiki w nowym miejscu — to właśnie
przez dwie niezależne implementacje ten błąd raz już się rozjechał między
tablicą a panelem szczegółów.

## 3. Budżet zapytań do API jest zasobem krytycznym

Klucz Basic daje 100 zapytań/godzinę **oraz** 1000/dobę jednocześnie. Poller
przy 90 s zużywa ~40/h, więc zapas jest realny, ale nieduży.

- Nie dokładaj zapytań do cyklu pollera bez policzenia kosztu na godzinę.
- Nowe źródło danych domyślnie powinno być cache'owane; jeśli nie da się —
  to jest decyzja do świadomego podjęcia, nie szczegół implementacyjny.
- Brak nagłówka `X-RateLimit-*` znaczy „nie wiadomo", nigdy „zero".
  Traktowanie go jako zera raz już zepchnęło poller na stałe na interwał
  awaryjny.
- `/api/train` (szczegóły połączenia) jest **poza cyklem pollera** — realny,
  synchroniczny fetch do PKP przy każdym kliknięciu w niewidziany wcześniej
  pociąg, chroniony wyłącznie własnym cache'em 90 s (`createTtlCache()`).
  Licz jego koszt osobno od budżetu pollera, nie razem z nim.
- `/api/network-stats` (widżet stanu sieci) też jest **poza cyklem pollera** —
  `getOperationsStatistics` (cache 15 min), `getDisruptionCount` (20 min),
  `getDailyCarrierCounts` (24 h), plus `getNameDictionaries` (współdzielony
  cache klienta). Współdzielony dla wszystkich userów (jeden globalny widżet,
  cache modułowy w `board/networkStats.ts`), więc ~7 zapytań/h niezależnie od
  ruchu. Doliczaj to do budżetu obok pollera (~40/h) i `/api/train`.
- `/api/weather` woła **Open-Meteo**, nie PKP — nie obciąża budżetu PKP w ogóle.
  Ma własny cache 25 min per stacja + dedup żądań w locie (ten sam wzorzec co
  `inFlight` w `/api/train`).
- Kafelki KPI stacji, „najpopularniejsze kierunki", natężenie ruchu i „przez…"
  w wierszu **nie kosztują ani jednego zapytania**: liczą się w cyklu pollera
  z tego, co on i tak ma w ręku — całodniowej odpowiedzi `/operations` oraz
  tras z `/schedules` (cache 24 h, `fullRoute=true`). Cała ta arytmetyka żyje
  w `src/lib/board/stationStats.ts`, czystymi funkcjami wołanymi raz na tick.
  Dokładając kolejny wskaźnik, sprawdź najpierw, czy nie da się go policzyć
  z tych samych danych — najczęściej da się.

## 4. Wejście spoza aplikacji jest zawsze wrogie

Aplikacja jest publiczna i bez uwierzytelniania. Parametry URL, treść
`localStorage` i odpowiedzi API PKP to dane spoza systemu.

- Identyfikatory stacji: walidacja formatu u wejścia **oraz** kodowanie przed
  wstawieniem do zapytania do PKP. Jedna warstwa nie wystarczy — bez kodowania
  `stations=5100&pageSize=5000` dopisywał parametry do cudzego żądania.
  Wspólne wzorce walidacji (stacje, `scheduleId`/`orderId`/`operatingDate`)
  żyją w `src/lib/validation.ts` — nie duplikuj regexów.
- Nic, co przyszło od klienta, nie może samo decydować, o co pytamy PKP.
  Nieznane ID nie trafiają do pollera.
- `localStorage` parsuj schematem, nie asercją typu. `JSON.parse(x) as T`
  znika przy kompilacji i raz już dało białą stronę przy uszkodzonym wpisie.
- Cache sprawdzany przed `await` i zapisywany po nim to wyścig: równoległe
  żądania wykonają pobranie każde z osobna. Deduplikuj żądania w locie.
- Stan widoku odtwarzany z parametrów URL (`src/lib/urlState.ts` —
  rozwinięta stacja, zakładka, otwarty panel połączenia) podlega tej samej
  zasadzie: nieprawidłowy/uszkodzony parametr jest po cichu ignorowany, nigdy
  nie powoduje awarii renderu. `patchUrlParams()` czyta bieżący
  `window.location.search` i dopisuje do niego — nie buduje query string od
  zera, bo więcej niż jeden moduł (`page.tsx`, `FullBoard.tsx`) zapisuje do
  tego samego URL-a niezależnie.

Nagłówków bezpieczeństwa z `next.config.ts` pilnuje `next.config.test.ts` —
jeśli osłabiasz politykę, zrób to świadomie i zaktualizuj test.

## 5. Jedna replika, stan w pamięci

Dwie repliki to dwa pollery i podwójne zużycie limitu. Skalowanie poziome jest
świadomie wykluczone; snapshoty i rejestr nazw stacji żyją w pamięci procesu.
Nie wprowadzaj założeń wymagających współdzielonego stanu bez zmiany tej decyzji.

Cache w długo żyjącym procesie musi mieć TTL i limit wpisów — użyj
`createTtlCache()` z `src/lib/cache.ts`, nie gołej `Map`.

## 6. Sieć wyłącznie na krawędziach

Cały HTTP siedzi w **dwóch** klientach: `src/lib/pkp/client.ts` (PKP PLK) oraz
`src/lib/weather/client.ts` (Open-Meteo — bezkluczowe, jedyne poza PKP wyjście
sieciowe aplikacji). Logika domenowa (`lib/board/`, `lib/weather/format.ts`) to
czyste funkcje zależne od interfejsu (`PkpClient`) albo od czystego payloadu, nie
od `fetch`. Dzięki temu testy nie potrzebują ani sieci, ani klucza API — i to ma
tak zostać. Nowe źródło danych = nowy klient na krawędzi, nie `fetch` rozsiany
po logice.

Wybór live/mock następuje raz, przy starcie, w `lib/board/instance.ts`. Żaden
inny moduł nie powinien wiedzieć, skąd pochodzą dane.

Współrzędne stacji do pogody nie pochodzą z żadnego API — trzyma je statyczny
`data/station-coordinates.json` (regenerowany przez
`scripts/enrich-station-coords.mjs`). Plik jest w obrazie (`.next/standalone`,
patrz #7 poniżej i zweryfikowane na produkcji 2026-09-01). Brak stacji w pliku =
stan `available:false` w `/api/weather`, **cache'owany**, nie błąd.

## 7. UI nigdy nie jest pusty

Przy awarii API pokazujemy ostatni znany dobry snapshot wraz z jego wiekiem,
zamiast czyścić widok. Awaria objawia się rosnącym wiekiem danych, nie białym
ekranem. Baner błędu jest zarezerwowany dla błędu konfiguracji (401).

Nie chowaj awarii pod pustym stanem — „brak wyników" i „nie udało się sprawdzić"
to dwa różne komunikaty. Przy wskaźnikach liczbowych stany są **trzy**, nie dwa:
„jeszcze się wczytuje", „nie udało się pobrać" i konkretna liczba. `null`
w `StationStats`/`StationInsights` zawsze znaczy „nie wiadomo" i nigdy nie może
wyrenderować się jako `0` — kafelek „0 pociągów" przy zepsutym pobraniu rozkładu
kłamie tak samo jak pusta tablica przy awarii API.

Wyjątek: panel szczegółów połączenia (`/api/train`) **nie ma** snapshotu do
pokazania przy awarii — to jednorazowy fetch po kliknięciu, nie dane z pollera.
Pokazuje wtedy jawny komunikat błędu, nie ostatnie znane dane (bo ich nie ma).

Widżet pogody: `available:false` (stacja bez współrzędnych w
`data/station-coordinates.json`) to trwały, poprawny wynik — cache'owany, nie
błąd. Dopiero błąd sieci/5xx z Open-Meteo daje stan błędu. Trzy stany, nie dwa,
jak wszędzie: „wczytuje się", „brak lokalizacji", konkretna pogoda.

Widżet stanu sieci (`board/networkStats.ts`) trzyma ostatnią udaną wartość
każdego z trzech podzapytań osobno — błąd jednego degraduje do starych danych
z tego jednego, świeże z pozostałych, zamiast czyścić całą kartę.

## 8. Fixture'y nie odwzorowują skali żywego API

Mock ma **prawdziwe** ID stacji (Warszawa Centralna `33605`, Kraków Główny
`80416`, Gdańsk Główny `7500` — te same co na żywo), ale to wciąż 15
syntetycznych, ręcznie napisanych pociągów (`orderId` 101–115) zamiast
kilkudziesięciu-kilkuset i 6 kodów przewoźników zamiast 22. Nadają się do
pracy nad UI — nie do wnioskowania o rzeczywistym natężeniu ruchu produkcji.

Ruch skupia się wokół trzech stacji kotwicowych (Warszawa C. / Kraków Gł. /
Gdańsk Gł.), a zestaw pokrywa komplet wariantów: punktualny, lekkie i duże
opóźnienie, pociąg opóźniony o ~6 h wciąż w trasie (`orderId 104`), odwołany
w całości (`105`), częściowo odwołany (`106`), „jeszcze nie wyjechał" ze
stacji początkowej (`107`, `trainStatus S`), świeżo potwierdzony odjazd
(`108`), dwa utrudnienia (`109` kod słownikowy, `110` gotowy tekst PKP), kurs
po północy (`112`, `arrivalDay: 1`), przejazd bez dopasowanej trasy (`113`,
`schedules` route z pustą listą przystanków) i pociąg bez ŻADNEJ realizacji,
którego rozkład stawia w połowie trasy (`115`, `trainStatus S`, zero
`isConfirmed`, okno trasy obejmuje „teraz" — pozycja „wg rozkładu" na
szczegółach połączenia, patrz `isScheduleProjection` w `board/trainDetail.ts`).
Mapowanie `orderId` → przypadek opisują komentarze w `src/lib/pkp/mock.test.ts`.

Kształt odpowiedzi sprawdzaj w publicznym schemacie, nie zgaduj z fixture'ów:

```bash
curl -s https://pdp-api.plk-sa.pl/swagger/v1/swagger.json
```

Jest dostępny bez klucza i bez zużycia limitu.

## 9. `/operations` i `/schedules` nie ograniczają się same do „dzisiaj"

Zweryfikowane na żywym kluczu (Warszawa Zachodnia, 2026-08-28): jedna
odpowiedź `/operations?stations=…&withPlanned=true` niosła pociągi z **pięciu
różnych dni kursowania** naraz (24–28.08), mimo że ten endpoint w ogóle nie
przyjmuje parametru daty. Każde miejsce liczące coś „dzisiaj" z tej odpowiedzi
(patrz `stationStats.ts`, `computeStationRealization`) musi jawnie odfiltrować
po `train.operatingDate === todayIsoDate` — bez tego kafelek podpisany „z
potwierdzonych dziś przejazdów" pokazywał średnią z zeszłego tygodnia, co jest
gorsze niż brak danych, bo wygląda wiarygodnie (patrz #7).

Druga, niezależna pułapka tego samego rodzaju: `/schedules` (okno dziś+jutro,
`fullRoute=true`) zwraca **osobny rekord trasy dla każdego dnia kursowania**
tego samego przejazdu — ten sam `trainOrderId`, inny `orderId`, czasem inne
perony i przystanki. Zmierzone na żywo: 2008 tras dla jednej stacji dzieliło
się na 1657 unikalnych kluczy przejazdu (`routeKey()`), a zwykła `Map` typu
„ostatni wygrywa" w 217 przypadkach zostawiała rekord z **niewłaściwego**
dnia, mimo że dzisiejszy istniał — 910 zamiast 1094 dzisiejszych odjazdów.
`indexRoutesByTrain()`/`findRouteForTrain()` w `board/routeKey.ts` to
naprawiają: indeks trzyma wariant per (przejazd, dzień) plus rezerwę bez daty,
`findRouteForTrain()` szuka najpierw dokładnego dnia. **Nie wracaj do zwykłej
`new Map(routes.map(r => [routeKey(r), r]))`** — to dokładnie ten błąd.
Liczenie (nie wyszukiwanie pojedynczej trasy) musi iść po **surowej liście**
tras z pollera, nie po tym indeksie — indeks z definicji zwija warianty tego
samego przejazdu i zaniża każdy licznik.

## 10. Rozkład wyznacza listę połączeń, realizacja ją wzbogaca

Kierunek zależności jest odwrotny, niż podpowiada intuicja „monitora opóźnień".
Listę wierszy tablicy wyznacza **rozkład** (`/schedules`), a realizacja
(`/operations`) dokłada do gotowych wierszy opóźnienie, status i czas faktyczny.

Powód jest zmierzony, nie estetyczny. 27–31.08.2026 feed realizacji PKP przez
pięć dób zwracał wyłącznie kursy sprzed kilku dni — odpowiadał HTTP 200,
z poprawnym kształtem, tylko nie o dzisiaj. Przy poprzednim kierunku
(lista z realizacji) aplikacja świeciła pustką, choć rozkład znał komplet
dzisiejszych połączeń. Pomiar z tamtych dni, Warszawa Centralna:

| dzień | realizacja | rozkład | realizacja bez trasy | trasa bez realizacji |
|---|---|---|---|---|
| 26.08 (zdrowy) | 392 | 394 | 0% | 0,5% |
| 27.08 (awaria) | 307 | 394 | 0% | **22%** |

Dwa wnioski, oba istotne przy zmianach w `board/transform.ts`:

- **Dopasowanie po `scheduleId-trainOrderId|operatingDate` obejmuje 100%**
  kursów w obie strony. Kursy z realizacji bez trasy są mimo to doklejane
  (`collectRowSources`) — to polisa gwarantująca, że tablica nigdy nie pokaże
  mniej niż przy starym kierunku, nie obsługa realnego przypadku.
- **Wiersz bez dopasowanej realizacji jest normalny, nie błędny.** `stop: null`
  w `RowSource` przechodzi przez `resolveDelayMinutes`/`resolveStopStatus` bez
  żadnej zmiany w tych funkcjach i daje „nie wiadomo". Nie dopisuj tam obejść.

Przełącznik `BOARD_SOURCE=schedule|operations` pozwala wrócić do starego
kierunku bez wdrażania kodu. Jest tymczasowy.

**Kiedy usunąć:** nie wcześniej niż **~2026-09-14** — dwa pełne tygodnie od
naprawy feedu (31.08 ~14:00), jeśli w tym czasie feed realizacji nie padnie
ponownie. Przy usuwaniu znika naraz:

- `BOARD_SOURCE` w `src/lib/config.ts` (schemat + `AppConfig.boardSource`),
  wpis w `.env.example`;
- `boardSource` w `PollerConfig` i gałąź
  `(config.boardSource ?? 'operations') === 'schedule'` w `poller.ts`
  (`scheduleSource` staje się bezwarunkowe);
- ścieżka `scheduleSource === null` w `collectRowSources()`
  (`src/lib/board/transform.ts`) oraz trailing-optional `scheduleSource`
  w `transformOperations()`;
- **~63 wywołania `transformOperations(` w `transform.test.ts`** — dziś
  testują ścieżkę historyczną (bez `scheduleSource`); trzeba je przepisać na
  jawny `scheduleSource`, albo przebudować helper testowy tak, żeby domyślnie
  go dokładał.

Konsekwencja dla komunikatów (patrz #7): „są godziny, ale nie znamy opóźnień"
to **inny** stan niż „nie udało się pobrać". Poller zgłasza go jako `degraded`
z `realizationStale: true`, a tablica pisze „PKP nie podaje dziś danych
o ruchu", nie „pokazujemy ostatnie znane dane" — bo godziny i perony są wtedy
w pełni aktualne.

## 11. Katalog `docs/` nie jest publikowany

`docs/` (projekt techniczny, plan implementacji) jest w `.gitignore` i celowo
nie trafia do repozytorium. Nie dodawaj go z powrotem.

## 12. Bramka jakości

Przepływ: **lokalnie → `dev` → `main`**. Feature branch (worktree) scala się do
`dev` przez PR; Railway stawia staging z `dev`, na którym klika się i testuje;
dopiero zielony `dev` idzie PR-em do `main` → produkcja. Nie pushuj feature'a
prosto na `main`.

Lokalnie przed każdym pushem (hook `pre-push`, `git config core.hooksPath
.githooks` raz na klon — konfiguracja `.git/` jest współdzielona przez worktree):

```bash
npm run check   # = typecheck && lint && test
```

`TZ=UTC npm run test` dodatkowo przy logice czasu (#1). Zmiany widoczne w
interfejsie: `npm run e2e` (#16) i weryfikacja w przeglądarce, nie tylko testami;
pełne klikane QA na deployu `dev`.

Commity i PR-y **po angielsku**, Conventional Commits (`feat:`/`refactor:`/
`docs:`). README, CHANGELOG i ten plik zostają po polsku.

Dotykając `src/lib/pkp/schema.ts` albo parametrów zapytań w `client.ts`,
sprawdź kontrakt wobec publicznego swaggera PKP (poza CI, wymaga sieci, bez
klucza i bez kosztu z limitu):

```bash
PKP_CONTRACT=1 npm run test -- contract
```

`src/lib/pkp/contract.test.ts` pyta wyłącznie o obecność pól i parametrów —
to ich zniknięcie robi ciche awarie (2026-08-30: `withPlanned`/`fullRoute`).

## 13. Komunikacja miejska (GTFS) to osobna dziedzina, nie rozszerzenie PKP

Podprojekt `src/lib/gtfs/` żyje obok warstwy PKP i **niczego z niej nie
dziedziczy**. Rzeczy, które łatwo złamać:

- **Zero pola opóźnienia.** W `src/lib/gtfs/types.ts` nie istnieje
  `delayMinutes`/`actualAt`/`predictedAt` i nie ma go w żadnej odpowiedzi
  `/api/gtfs/*`. Nikt nie publikuje opóźnień miejskich dla Warszawy —
  docelowo (etap 5) wystarczą pozycje pojazdów. Brak pola jest mechanizmem
  kontrolnym: komunikat to zawsze „rozkład", **nigdy „na czas"**.
- **Trzy niezależne rytmy.** PKP poller (90 s) ↔ przeglądarka (`/api/board`,
  30 s) ↔ GTFS poller (raz na dobę + TTL bezczynności). GTFS ładuje się **raz**
  (~107 MB, ~3 s parse), potem tylko czyta się z pamięci. `/api/gtfs/*` nigdy
  nie czekają na pobranie feedu — `ensureLoaded()` jest fire-and-forget,
  `getSchedule()` zwraca `null` dopóki nie gotowe, a klient ponawia.
- **Rejestr miast (`gtfs/cities.ts`) to jedyne miejsce z logiką per-miasto.**
  Kolejne miasto = jeden wpis w `REGISTRY`, zero nowego kodu (test odbioru:
  `cities.test.ts`). Slug miasta to **pełna nazwa bez polskich znaków**
  (`warszawa`, `krakow`), nie trzyliterowy kod — `[a-z]{2,24}`, katalog fixture'a
  = slug (`fixtures/gtfs/warszawa/`). Słów „wtp"/„ztm" nie ma nigdzie poza tym
  plikiem i fixture'ami.
- **Identyfikatory GTFS (`stop`, `route`) nigdy nie trafiają do wychodzącego
  URL-a** — są kluczami do `Map` w pamięci. Realną granicą zaufania jest
  `stopIndexById.get(id) === undefined` / `routeIndexById.get(id) === undefined
  → null` (200, nie 400 — konwencja nieznanego ID). Regexy w `validation.ts`
  (`GTFS_STOP_ID_PATTERN`, `GTFS_ROUTE_ID_PATTERN`) to tani strażnik formatu.
  `city` **natomiast** MUSI być sprawdzone wobec rejestru — wybiera feed.
- **`route_color` to niezaufany string z cudzego serwera.** Walidacja na
  granicy Zod (`schema.ts`) → `#RRGGBB` albo `null`; `route_text_color`
  **ignorowany w całości**, kontrast liczymy sami (`contrastText`). `LineBadge`
  używa wyłącznie `style={{ background }}` ze zwalidowaną wartością.
- **`schedule.routePatterns`** (przebieg linii per kierunek + `offsets`
  sekundowe względem przystanku startowego) jest akumulowany w gorącej pętli
  `stop_times` — **nie skanuj milionów zdarzeń per żądanie** strony linii.
  `lineDetail()` czyta gotowy indeks; strona linii liczy godzinę na kolejnych
  przystankach jako `czas startowy + offsetSec` (bez dodatkowego zapytania).
  Wybieramy **najczęstszy** przebieg dla pary (linia, kierunek), NIE najdłuższy
  — „najdłuższy" łapał zjazdy do zajezdni i wydłużone objazdy (strona linii 4
  pokazywała „Gocławek → Zjazd do zajezdni Annopol" zamiast „Żerań Wschodni →
  Metro Wilanowska"). **Nie wracaj do `points.length > existing.stops.length`.**
- **Kurs techniczny = `exceptional=1` LUB nagłówek `/zajezdn/i`** (`tripSchema`).
  Feed WTP bywa niespójny — zaobserwowano „Zjazd do zajezdni" z `exceptional=0`
  na żywym kluczu (2026-09-04). Kursy techniczne nie zasilają `routePatterns`
  ani indeksu `run*`.
- **Kategoria dnia** (`serviceCategory` w `schema.ts` → `schedule.tripCategory`):
  najpierw token w `service_id` (`…:PcS` roboczy pon–czw, `SbS` sobota, `NdS`
  niedziela/święto, `PtS` piątek — WTP ma OSOBNY rozkład piątkowy), potem
  rozkład dni tygodnia dat kursowania. Sekcje rozkładu linii biorą się stąd.
- **Kolumny dni w rozkładzie linii NIE są ograniczone do okna `[wczoraj, dziś,
  jutro]`.** Osobny indeks `run*` w `schedule.ts` (jeden wpis na kurs, KAŻDA
  doba kursowania z feedu, z pierwszego słupka) daje `lineDeparturesFromRuns()`
  komplet kategorii niezależnie od dnia tygodnia — inaczej „Soboty"/„Niedziele"
  znikały w środku tygodnia. **Wyjątek: metro** (kursy z `frequencies.txt`) nie
  ma wpisów `run*` — fallback `lineDeparturesFromEvents()` na wycinek CSR, więc
  metro pokazuje tylko kategorie z okna. `run*` iterujemy liniowo per żądanie
  strony linii (~35 tys. wpisów, ~1 ms) — jeśli urośnie, indeks per-route.
- **Zespół vs słupek.** `stopGroup(id)` ZAWSZE zwraca cały zespół — nawet gdy
  `id` to pojedynczy słupek (`groupIdOf()` rozwiązuje). Wtedy `requestedMemberId`
  niesie ten słupek (deep-link z trasy linii → przełącznik go podświetla).
  `members: StopGroupMember[]` z `code` (`stop_code` „01"/„06"), `street`
  (`street_name`), per-słupkowymi `lines`. Zawężenie WYŁĄCZNIE jawnym
  `/api/gtfs/board?slupek=<id>` — nie auto-scope z `stopId`, inaczej „Cały
  przystanek" nie działa na deep-linku. `GtfsDeparture.stopCode` /
  `LineRouteStop.code` — user widzi, z którego słupka jedzie (zespół „Centrum"
  = 9 fizycznie odległych słupków). `cleanGroupName()` — NO-OP na żywym feedzie
  (numer w `stop_code`, nie w nazwie), mock go używa („Centrum 01").
- **`wheelchair_boarding` — sygnał to `2`, nie `1`.** Feed WTP daje `1`
  (DOMYŚLNE) na ~89% słupków, `2` (NIEdostępny) na ~11%. `StopGroup.wheelchairNote`
  = `'inaccessible'` (wszystkie słupki `2`) / `'partial'` / `null`. Ikona
  wózka pokazywana TYLKO dla `2`. **Nie oznaczaj `1`** — było tak, ikona
  świeciła na każdym przystanku.
- **Przystanek na żądanie** = `pickup_type`/`drop_off_type` = `3` w `stop_times`
  (`schedule.evOnRequest` → `GtfsDeparture.onRequest`). ~19% wierszy feedu.
- **Rozkład wyznacza doby `[wczoraj, dziś, jutro]`** dla TABLICY ODJAZDÓW
  (indeks CSR) — `/operations`-owy problem z #9 tu nie występuje (GTFS nie ma
  feedu realizacji), ale liczenie „dziś" nadal idzie przez `serviceDateWindow()`
  i indeks doby, nie przez `new Date()`. `cityStats.hourly` liczy KURSY
  (pierwszy odjazd kursu per godzina), nie zdarzenia na słupkach —
  `sum(hourly) === tripsToday`.

Kontrakt wobec publicznego schematu feedu (poza CI, wymaga sieci, bez kosztu):

```bash
GTFS_CONTRACT=1 npm run test -- gtfs/contract
```

`GTFS_DATA_SOURCE=mock` (domyślnie) trzyma `npm run dev`/`test`/CI zerowo-
sieciowe. Fixture'y w `fixtures/gtfs/<city>/` to zwykłe `.txt`, bez ZIP-a.

## 14. Proces pracy nad zmianą

Skalowany rozmiarem zadania. Zmiana trywialna (literówka, jednolinijkowiec,
czysty refactor bez zmiany zachowania) = fix + test + bramka (#12), bez reszty
ceremonii. Pełna ścieżka dotyczy nowego zachowania i niebanalnych poprawek błędów.

1. **Analiza = burza mózgów oparta o dane i źródła.** Zanim powstanie kod:
   przedstaw przypadek własnymi słowami, wypisz założenia, zadaj userowi otwarte
   pytania. Opieraj się na źródłach, nie na zgadywaniu z fixture'ów, i **wymień,
   z których korzystałeś**:
   - **API** — swagger (`curl -s https://pdp-api.plk-sa.pl/swagger/v1/swagger.json`),
     realny payload `/operations` przy kluczu, żywy feed GTFS (#8, #9, #13).
   - **Dokumentacja** — `node_modules/next/dist/docs/` (to nie jest ten Next.js,
     który znasz — patrz góra pliku), publiczny schemat feedu GTFS, swagger PKP.
   - **Wiedza wewnętrzna** — niezmienniki z tego pliku, `README.md`, `MEMORY.md`,
     poprzednie handoffy w `docs/`, `CHANGELOG.md`.
   - **Sieć** — dobre praktyki i referencyjne implementacje, gdy temat tego wymaga.

   (`superpowers:brainstorming`)
2. **UI / design.** Jeśli zadanie dotyka wyglądu lub nowego widoku — ustal
   z userem kierunek (albo zaprojektuj wariant i pokaż) zanim wejdziesz w kod.
3. **TDD.** Nowe zachowanie lub bug → najpierw czerwony test, potem kod. Testy
   leżą obok kodu (`*.test.ts`). Regresja z produkcji → test na dosłownym
   payloadzie, jak `schema.test.ts`. (`superpowers:test-driven-development`)
4. **Bramka jakości** — patrz #12. Zmiana UI → dodatkowo `npm run e2e` (#16).
5. **Weryfikacja UI.** Zmiana widoczna w interfejsie → sprawdzenie w przeglądarce;
   nowy interaktywny przepływ → e2e desktop + mobile (#16) i zrzut. Pełne klikane
   QA na deployu `dev`, nie tylko lokalnie.
6. **Spójność i związek przyczynowo-skutkowy — zawsze na końcu.** Przeczytaj
   własny diff obok niezmienników: czy zmiana faktycznie wywołuje zamierzony
   efekt end-to-end? Czy typy, testy, `CHANGELOG`, ten plik i kod mówią to samo?
   Czy nie wprowadziłeś sprzeczności z istniejącym niezmiennikiem?
   (`superpowers:verification-before-completion`)
7. **Self-review i sugestie.** Jeden przebieg pod kątem nadmiarowości i reużycia
   (`/ponytail-review` lub `/simplify`). Refaktor wart osobnej zmiany — zgłoś,
   nie doklejaj do bieżącego diffa. Jeśli zbudowane dane lub funkcja umożliwiają
   wartościowe, dotąd nierealizowane użycie — dopisz 1–2 zdania sugestii
   (kandydat na `spawn_task` albo wpis do `MEMORY.md`), nie realizuj w tym diffie.
   (`superpowers:requesting-code-review`)

## 15. Ekonomia działań i wypowiedzi

Sesje są drogie w tokenach. Domyślnie:

- Nie powtarzaj ustalonych faktów, nie streszczaj planu, którego nikt nie prosił,
  nie opisuj wariantów, których nie wybierasz. Zmiana najpierw, potem maks. 3
  krótkie linijki.
- Tryb plan: **jeden** Explore agent, nie trzy — mapę repo masz w tym pliku.
- Nie czytaj ponownie pliku, który właśnie zmieniłeś (Edit i tak by zawył).
- Duże zrzuty (`git diff`, `curl`, logi) zawężaj ścieżką/`head`; czytaj przez
  Grep/Read, nie `cat` w bashu.
- Jedno zadanie = jedna sesja. Do nowego tematu nowa sesja, nie `/compact`
  długiej.
- ponytail pilnuje minimalizmu *kodu*, caveman — *języka wypowiedzi* (oba
  aktywne stale przez plugin); ta sekcja spina je z *działaniami* w sesji.

## 16. Automatyczne testy UI (e2e)

`npm run e2e` to **wersjonowany pakiet regresji UI** (`@playwright/test`),
w trybie mock i zerowo-sieciowy jak reszta testów (#6, #8): serwer stawiany
przez `webServer` bez klucza PKP i z `GTFS_DATA_SOURCE=mock`, `/api/weather`
zablokowane w kontekście (stan `available:false` jest poprawny — #7). Odpalany
lokalnie przy zmianach UI i w CI (osobny job `e2e`, poza szybkim `quality`).

- Projekty: `desktop-chromium`, `mobile-chromium` (`devices['Pixel 7']`),
  `mobile-safari` (`devices['iPhone 15']`). Kolejny viewport = wpis w
  `playwright.config.ts`, nie nowy kod.
- Nowy widok lub interaktywny przepływ → dołóż smoke w `e2e/` przy desktop
  i mobile + skan a11y (`@axe-core/playwright`, fail na `serious`/`critical`).
  Lokatory **semantyczne** (rola/nazwa), nie CSS — stabilne między layoutami.
- Trzy stany wskaźników z #7 obowiązują też tu: test nie może przechodzić na
  kaflu „0" przy zepsutym pobraniu.
- playwright-skill (MCP) to co innego — eksploracja i jednorazowe sprawdzenia na
  żądanie, nie regresja.

`ponytail:` snapshoty wizualne (`toHaveScreenshot`) świadomie pominięte — dodać
dopiero, gdy realna regresja wizualna ugryzie; wtedy baseline w kontenerze CI.
