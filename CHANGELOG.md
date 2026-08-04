# Changelog

Format oparty na [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/).
Wersjonowanie semantyczne.

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

### Zmienione

- Kolumna „Przewoźnik" w pełnej tablicy (`FullBoard`) jest teraz widoczna
  także poniżej ~640px (wcześniej całkiem ukryta) — na wąskim ekranie pokazuje
  sam kod przewoźnika (np. „IC"), od `sm` wzwyż pełną nazwę.

- Pełna nazwa przewoźnika pochodzi teraz ze słownika `dictionaries.carriers`
  dołączonego do każdej odpowiedzi `/api/v1/schedules` (kod → pełna nazwa
  prawna, np. „POLREGIO S.A.") zamiast z ręcznie zgadywanej lokalnej listy —
  bez dodatkowego zapytania, dane już przychodziły w tej samej odpowiedzi.
  `src/lib/carriers.ts` mapuje już tylko kod → logo.

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
