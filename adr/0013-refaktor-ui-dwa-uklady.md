# 0013. Refaktor UI: dashboard desktopowy i szybki dostęp na telefonie

- Status: przyjęte przez właściciela, 2026-10-19; realizacja etapowa.
- Rozwija [0010 — oddzielną nawigację](0010-nawigacja-mobilna-inna-niz-desktopowa.md).
- Punkt odniesienia: `0bb10c8` (`dev`, 2026-10-19). PR 01 nie zmienia produkcyjnego UI.

## Decyzja

Refaktor obejmuje całą aplikację. Desktop służy przeglądaniu wielu informacji: zachowuje
nawigację boczną, topbar, tabele, zestawienia i prawą kolumnę kontekstową. Telefon służy
szybkiemu znalezieniu przystanku, stacji, linii lub pociągu oraz najbliższego odjazdu.
Wspólne są dane, reguły i komponenty; kompozycje ekranów i gęstość informacji są różne.
Tablet i wąskie okno korzystają z uproszczonego układu, gdy dashboard przestaje się mieścić.

Na telefonie: cztery kolumny porządkujące wyrównania, odstęp 12 px, margines 16 px
(12 px przy 320 px), skala 4/8/12/16/24/32 px. Manrope, tekst główny 16 px,
pomocniczy minimum 13 px, godziny 24–28 px. Listy zajmują pełną szerokość.
Nagłówki rosną z treścią; przyklejone kontrolki uwzględniają ich rzeczywistą wysokość.
Jeden widoczny H1, pełne istotne nazwy, cele dotykowe minimum 44 × 44 px.

### Stałe miejsca i zachowania

- Topbar telefonu: powrót, tytuł, pogoda, menu „Więcej”. Jeden właściciel pogody;
  miasto, stacja albo początek połączenia określają lokalizację, bez samoczynnego GPS.
- Menu: motyw, udostępnianie i „Źródła danych” z rozwijanymi opisami dostawców.
  Statystyki i komunikaty trafiają pod treść na telefonie, do paneli kontekstowych desktopu.
  Statystyki sieci kolejowej są zwijane na Starcie.
- Aktualizacja danych: pełna data z godziną i minutą, raz dla tego samego zestawu danych,
  pod główną nazwą miejsca/linii. Odrębne źródła zachowują własne stany i czas danych.
- Minimum trzy najbliższe dostępne kursy w kartach; rzeczywisty brak kursów nie jest uzupełniany.
- Przystanek identyfikuje pełna nazwa i numer w zespole, np. „Centrum 02”.
  Kierunek bez odmiany, np. „kierunek Służewiec”. Filtry transportu mają piktogramy z etykietami dostępnymi.
- Przystanek pokazuje chronologiczną listę odjazdów wielu linii. Numer linii otwiera
  całodzienny rozkład we właściwym kierunku i przystanku; główna akcja odjazdu wybiera kurs.
  Nie ma dodatkowej sekcji „Rozkłady linii” ani zagnieżdżonych linków.
- Trasa i rozkład są powiązane: przystanek wybiera rozkład, minuta wybiera kurs.
  Dni: „Poniedziałek – Piątek”, „Sobota”, „Niedziela i święta”, z zachowaniem wariantów feedu.
- NŻ przy odpowiednim przystanku i odjeździe, z rozwinięciem „Przystanek na żądanie”
  i widocznym objaśnieniem na trasie. Decyduje kurs/wariant, nie globalna flaga miejsca.
- Liczba przystanków obejmuje pełny wybrany kierunek, także gdy lista jest zwinięta.
  Pozostałe kierunki mają osobne liczby. Pętle i powtórzone przystanki nie są usuwane po nazwie.
- Mapa ma wyszukiwarkę rozwijaną pod „Szukaj”, wspólną ze Startem. Domyślny panel
  odpowiada zadaniu; zbiorcza lista wszystkich pojazdów nie jest domyślnym ekranem.
  Zachowujemy filtry warstw, transportu, linii, kierunku, komunikatów i ich reset.
- Pojazd ze znanym kierunkiem: chevron 18–24 px, wybrany około 28 px; bez kierunku neutralny znacznik.
  Numery boczne i liczba dostępnych pozycji obu kierunków są w statystykach linii, bez rzędu czipów nad mapą.
- Szczegóły kursu miejskiego i kolejowego zawierają mapę oraz zsynchronizowaną oś.
  GPS miejski nie określa punktualności. Pozycja PKP jest oznaczonym oszacowaniem, nigdy GPS.
  Brak geometrii torów oznacza schemat, nie zmyśloną dokładną trasę.
- Animacje domyślne, bez przycisków pauzy pojazdu; respektują ograniczony ruch.
  Motyw, szerokość i otwarcie pogody nie resetują stanu ani nie dodają żądań.

## Macierz zgodności funkcji

„Istnieje” oznacza potwierdzenie w kodzie. Wymieniony test oznacza istniejący scenariusz,
nie dowód świeżego przejścia. Wyniki i zrzuty są osobnymi artefaktami PR.

| Funkcja i obecne źródło | Docelowo telefon | Docelowo desktop | Scenariusze regresji |
|---|---|---|---|
| Start i piny: `Dashboard`, `StartEntry`, `usePinned` | Wyszukiwanie, przypięte miejsca, ≥3 dostępne odjazdy, dodanie/edycja/cofnięcie | Siatka kart z informacjami sieci obok | `pulpit`, `smoke`, `mobile-layout` |
| Historia: `useRecentPlaces`, `useRecentLines` | Ostatnie miejsca i linie | Te same zapisane dane | `search-dialog`, `lines`; testy hooków |
| Szukanie miejsc/linii: `UnifiedSearch`, `useUnifiedSearch` | Strona i wspólny komponent na Starcie/mapie | Dialog i skróty klawiatury | `unified-search`, `search-dialog` |
| Pociągi po nazwie/numerze — NOWE | Wyniki konkretnego kursu z datą i relacją | Ta sama funkcja w dialogu | PR 04: nowe kontrakty i e2e; obecnie brak |
| Lokalizacja: `UserLocationProvider`, `LocateControl` | GPS po kliknięciu; okolica, odmowa, wyszukiwanie jako alternatywa | Panel okolicy | `smoke`, `map`; brak samoczynnego GPS |
| Miasto: `CityPicker`, `CityTransitWidget` | Wybór miasta, tablica i kontekst | Tablica i statystyki obok | `gtfs-transit-flows`, `boards-mobile`, `error-pages` |
| PKP: `FullBoard`, `BoardRowList`, `BoardTable` | Odjazdy/przyjazdy, kierunek, peron, status, odświeżenie | Tabela z przewoźnikiem i panelem informacji | `boards-mobile`, `aside-layout`, `smoke` |
| PKP: popularne kierunki, ruch dobowy, statystyki stacji | Rozwinięcia pod tablicą, kierunek filtruje odjazdy | Prawy panel informacyjny | `boards-mobile`, `mobile-layout`; testy statystyk |
| PKP: `ConnectionDetails`, `TrainRouteList`, `DelayForecast` | Mapa, oś, okno długiej trasy, rozwinięcie, komunikaty | Pełna relacja i kontekst obok | `boards-mobile`, `map`, `smoke` |
| GTFS: `TransitStopDetail`, `useTransitBoard` | Numerowany przystanek/zespół, wybór stanowiska, filtry linii i trybu | Tablica z mapą i kontekstem | `gtfs-stop-member`, `boards-mobile`, `gtfs-alerts` |
| GTFS: `TransitDepartureList`, `OnRequestBadge` | Chronologiczne odjazdy, NŻ, częstotliwość, numer/peron; osobne wejście do rozkładu | Te same znaczenia w gęstszym układzie | `boards-mobile`, testy komponentów; nowe akcje PR 06 |
| Katalog: `LineGrid`, `useSectionOpen` | Wszystkie tryby i kategorie, wyszukiwanie, ostatnie linie | Siatka zależna od szerokości | `lines`, `touch-targets` |
| Linia: `LineRouteList`, `LineTimetable`, `lineViewState` | Trasa/rozkład, kierunek, przystanek, dzień i kurs | Trasa i rozkład równolegle | `lines`, `gtfs-transit-flows`; kurs PR 07 |
| Pętle, powtórzone przystanki, dni i warianty GTFS | Właściwe wystąpienie przystanku i wariant | Te same reguły | Testy GTFS i `lines`; rozszerzenie PR 07 |
| Mapa: `MapToolbar`, `MapFilters`, `MapLegend` | Wyszukiwanie pod kontrolką, filtry i legenda bez kolizji | Kontrolki i panele obok mapy | `map`, `a11y-map`, `touch-targets` |
| Mapa: `MapPanels`, `MapCard`, `LinePanel`, `OverviewPanel` | Wybrany obiekt/linia/pojazd, okolica, pin i przejście do szczegółów | Kontekst równoległy do mapy | `map`, `gtfs-vehicles` |
| Mapa: śledzenie pojazdu, kierunek, warstwy PKP/GTFS | Chevron lub neutralny znacznik, dostępna obsługa klawiaturą | Te same obiekty i dane | `map`, `gtfs-vehicles`; stare/brak pozycji |
| Pogoda: `WeatherChip`, `useStationWeather`, `StationAside` | Zawsze topbar, właściwa lokalizacja | Topbar i informacje kontekstowe bez powtórnego pobierania | `gtfs-transit-flows`; testy pogody; nowe żądania PR 03 |
| Komunikaty: `ContextAlerts`, `AlertBanner` | Rozwinięcie na właściwym ekranie | Widoczny kontekst | `gtfs-alerts`, `gtfs-vehicles`; niezależne awarie |
| Statystyki: `NetworkStatsCard`, `StationStatsCards`, `CityStatTiles` | Kontekstowe rozwinięcia; sieć na Starcie | Zestawienia i panele | `mobile-layout`, `boards-mobile`; null ≠ 0 |
| Udostępnienie: `ShareButton`, `useShareUrl` | Menu, właściwy obiekt i stan | Te same linki i fallback kopiowania | `share-preview`, `headings`; systemowy Web Share manualnie |
| Nawigacja i fokus: `AppChrome`, `BottomSheet`, `useDropdown` | Cztery cele; Escape, powrót fokusu, klawiatura ekranowa | Sidebar, Ctrl/Cmd+K, `/` | `mobile-nav`, `search-dialog`, `boards-mobile`, `map` |
| Stan: `urlState`, `lineViewState`, storage | Wstecz, filtry, przewijanie, wybrany kurs | Dodatkowo kamera i zwinięcie sidebara | `unified-search`, `lines`, `boards-mobile`, `map` |
| PWA/offline: `InstallPrompt`, `OfflineBanner`, `ThemeColorSync` | Instalacja iOS/Chromium, safe area, ostatnie dane | Stan sieci i motyw | `pwa`; brak service workera, bez obietnicy startu offline |
| Błędy, puste stany, loading, retry, stale | Czytelny stan źródła bez utraty treści | Ten sam model danych | `error-pages`, testy hooków, źródła wyszukiwania i mapy |
| Diagnostyka: `PollerDiagnostics` | Dostęp zgodny z przeznaczeniem środowiska | Diagnostyka w dozwolonym środowisku | `next.config.test`; nie rozszerzać widoczności produkcyjnej |

Nazwy scenariuszy w tabeli wskazują pliki `e2e/<nazwa>.spec.ts`.

## Realizacja: jedna sesja i jeden PR na etap

| PR | Rezultat | Model | Główne kryterium |
|---|---|---|---|
| 01 | Macierz, decyzje, zrzuty i scenariusze punktu odniesienia | Sol | Wszystkie funkcje mają cel i weryfikację |
| 02 | Tokeny, typografia, kolory, ikony | Terra + Sol review | Oba motywy, kontrast, semantyka transportu/statusów |
| 03 | Powłoka obu układów, pogoda, źródła danych | Sol | Jeden właściciel danych i brak duplikatów paneli |
| 04 | Wspólna wyszukiwarka z pociągami | Sol | Nazwa/numer, brak żądań upstream od wpisywania |
| 05 | Start, przypięte miejsca i statystyki sieci | Sol | Istniejący storage, kolejność, historia, cofnięcie |
| 06 | Przystanek, odjazdy i konkretny kurs GTFS | Sol | Numer miejsca, data odjazdu, osobne akcje rozkładu i kursu, rzeczywisty wariant mapy/osi/NŻ |
| 07 | Ogólny widok linii GTFS, pojazdy i statystyki | Sol | Kompozycja linii, statystyki i lista pojazdów; wybór kursu realizuje już PR06 |
| 08 | Stacja PKP | Sol | Komplet danych, poprawna realizacja i stany |
| 09 | Połączenie PKP | Sol | Mapa, szacowana pozycja, kontekst i powrót |
| 10 | Mapa transportu | Sol | Warstwy, filtry, kamera i brak kolizji |
| 11 | Dashboard jako całość | Sol | Gęstość i komplet informacji desktopowych |
| 12 | Animacje, deduplikacja, wydajność | Sol; mechaniczne zadania Luna | Zachowany fokus, stan, ograniczony ruch |
| 13 | Odbiór całości na staging | niezależny Sol | Macierz zgodności i dowody, brak otwartego FAIL |

Każdy etap ekranowy obejmuje telefon i desktop. PR 11 nie odracza napraw desktopu.
Następny etap zaczyna od aktualnego `dev` po integracji poprzedniego, na gałęzi `codex/…`.
Za zgodą właściciela z 2026-10-21 PR 04 i PR 05 mogą powstawać równolegle na bazie PR 03,
z integracją 04 → 05. PR 04 jest jedynym właścicielem kontraktu, komponentów i tekstów
wyszukiwania (także `StartEntry` oraz adaptera mapy). PR 05 obejmuje kompozycję Startu,
karty i statystyki; nie zmienia powłoki, storage ani plików wyszukiwania. Po integracji
PR 04 gałąź PR 05 aktualizuje bazę i ponownie sprawdza szukanie oraz przypinanie.
Za zgodą właściciela z 2026-10-22 PR06 i PR08 powstają równolegle na bazie PR05 (#201),
z integracją 06 → 08 i ponowną weryfikacją PR08 po aktualizacji bazy. PR06 jest właścicielem
przystanku i całego wyboru konkretnego kursu GTFS (przeniesionego z PR07), jego indeksów,
kontraktów API/URL, mapy i osi. PR08 obejmuje wyłącznie tablicę i kontekst stacji PKP.
PR06 koordynuje zmiany współdzielone; implementerzy nie edytują równolegle tych samych plików.
Identyfikacja kursu to `trip` + dzień kursowania `date`; `seq` wskazuje wystąpienie przystanku.
Za zgodą właściciela z 2026-10-24 etapy 07 i 09 są realizowane równolegle na bazie
zintegrowanych PR06 i PR08 (`21c170b`). Etap 07 jest właścicielem ogólnego widoku linii,
statystyk obu kierunków i zwartej listy numerów bocznych; etap 09 szczegółów połączenia
PKP oraz jego osi. Oba etapy zawierają identyczną poprawkę kontenera mapy (`relative`), aby zachować
przycinanie znaczników po zmianie szerokości; pozostałe wspólne komponenty mapy są poza podziałem. Dokumentację
wspólną i weryfikację integracyjną prowadzi koordynator; etap 10 zaczyna po odbiorze tych prac.
Rozkład linii zachowuje `dir`, `stop`, `pane`, `day` i addytywne `occ` dla powtórzeń na pętli.
Minuta rozkładu wybiera rzeczywisty kurs w najbliższym dostępnym dniu jego kalendarza,
z zachowaniem osobnego piątku i wyjątków. Kursy częstotliwościowe pozostają orientacyjne;
nie dostają fikcyjnej tożsamości konkretnego kursu. Wzorce kursów są internowane przy ładowaniu
rozkladu; mapa korzysta z geometrii danego wariantu albo jawnie opisanego schematu.
Terra wymaga potwierdzonej dostępności dla danej sesji; w razie braku zadanie przejmuje Sol.
Luna nie ustala samodzielnie semantyki danych ani architektury. Model i rozumowanie
dobieramy do ryzyka; nie uruchamiamy wielu implementerów na tych samych plikach.

Nowe wyszukiwanie rozszerzy addytywnie `/api/search` i `DiscoveryResult` o pociąg.
Indeks powstaje z istniejącej krajowej migawki PKP, bez dodatkowego pobierania przy wpisywaniu.
Brak migawki jest stanem niedostępnego źródła, nie pustym wynikiem. Stare kontrakty,
adresy i format ulubionych pozostają zgodne. Pogoda i kontekst strony mają wspólnego właściciela.

## Dowody i bramki

`node scripts/capture-ui-baseline.mjs` zbiera zrzuty 10 widoków × 375/1440 px × oba motywy,
metadane commita, błędy JS, przepełnienie i liczbę lokalnych żądań API. Wymaga lokalnego,
produkcyjnego serwera mock na porcie 3137 (`UI_BASELINE_URL` zmienia adres).
Wynik: ignorowane `docs/ui-refactor/baseline/` (poza katalogiem czyszczonym przez Playwright).
Raport ma pole `complete`, odróżniające pełne zebranie od przerwanego przebiegu.
To materiał przeglądu, nie golden snapshots,
test WCAG ani pomiar rzeczywistej skali feedu. Zrzuty nie są publikowane w repo.

Przed commitem: odpowiednie testy i `npm run check`. Po commicie: SHA/diff/status oraz
smoke zmienionego przepływu, a przy UI kontrola obu układów. Przed integracją PR:
build przy zmianach aplikacji, właściwe e2e, przegląd kodu, niezależny weryfikator kryteriów,
przegląd UI na działającej aplikacji i CI aktualnego SHA. Poprawka unieważnia dotyczący jej wynik.
Po integracji: potwierdzenie wdrożonego SHA i smoke stagingu z uwzględnieniem wspólnego limitu PKP.

Weryfikator dostaje kryteria i zakres diffu, nie opis sukcesów implementera; wynik
PASS / FAIL / UNVERIFIED z dowodem. Przegląd Impeccable na początku i końcu rozdziela
niezależną ocenę projektu i kontrolę techniczną. Znaleziska obecnego UI są backlogiem;
błąd wprowadzony przez PR blokuje jego odbiór. Niewykonane testy pozostają jawnie nieweryfikowane.

Macierz końcowa: 320/375/390/430 px, desktop 1280/1440 px, oba motywy, tekst 200%,
zoom 400%, klawiatura/czytniki, niezasłonięty fokus, kontrast na rzeczywistych tłach,
WCAG 2.2 AA, Safari i rzeczywisty telefon. Sprawdzamy wszystkie środki transportu,
długie nazwy/trasy, błędy/stare dane, brak kierunku i pozycji, null ≠ 0 oraz liczbę żądań.
Kontrola wydajności porównuje kod klienta i mapę na większej liczbie obiektów przed/po.
Pełna macierz jest odbiorem PR 13, nie deklaracją wykonania w PR 01.

## Bezpieczna kontynuacja

### Znaleziska początkowego przeglądu

Niezależny przegląd wizualny pięciu tras w obu motywach na 375 i 1440 px wskazał:

| Priorytet | Problem istniejącego UI | Etap naprawy i dowód odbioru |
|---|---|---|
| P1 | Odjazd GTFS następnego dnia pokazuje samą godzinę, bez dnia | PR 06: przejście przez północ z widoczną datą/względnym dniem kursu |
| P2 | Odjazdy przystanku są nisko pod zestawem kontrolek i informacjami | PR 06: najbliższe kursy przed informacjami pomocniczymi w obu układach |
| P2 | Kolej miejska wypada poza widoczną część mobilnego paska trybów mapy | PR 10: wszystkie tryby odnajdywalne bez ukrywania końca paska |
| P2 | Desktop ucina przewoźnika i stacje pośrednie mimo szerokiego panelu bocznego | PR 08/11: pełna istotna treść, właściwe proporcje tabeli i panelu |
| P3 | Ciężar kart i rozproszone opisy świeżości utrudniają skanowanie | PR 02/03: wspólna hierarchia i jeden opis dla tego samego zestawu danych |

Detektor Impeccable nie zgłosił trafień w komponentach i stronach. Nie potwierdza to braku
problemów wizualnych ani zgodności WCAG. Nakładka detektora w przeglądarce nie została uruchomiona.
Szczegółowe wyniki i zrzuty są artefaktami przeglądu, poza publicznym repo.

Aktualizacja zależności w bazowym `dev` ujawniła nieaktualny worker MapLibre i różnicę
serializacji skrótu CSS w JSDOM. PR 01 synchronizuje kopię workera z pakietem i zmienia
asercję koloru na `backgroundColor`, zachowując testowany warunek. Na Windows testy
narzędzi wymagają dostępnego Git Bash w PATH. Kryteria bramki nie są osłabiane.
Publikacja przez hook ujawniła też dziedziczenie `GIT_DIR` przez test tworzący repozytorium
tymczasowe. Wspólny uruchamiacz poleceń bramki usuwa zmienne lokalne repozytorium wskazane
przez `git rev-parse --local-env-vars`, zachowując pozostałe ustawienia procesu.
Regresja sprawdza środowisko procesu bez wykonywania potencjalnie niebezpiecznego `git init`.

Handoff zawiera bazowe SHA, zakres, kryteria, dowody, ryzyka, otwarte znaleziska i kolejny PR.
PR utrwala aktualny wynik, ponieważ `docs/` jest ignorowane; nie polegamy na hookach Claude w Codex.
Nie usuwamy zastępowanej funkcji przed weryfikacją jej nowego wejścia. Każdy PR ma działać
samodzielnie i pozwalać na revert bez utraty zapisanych danych. Nie tworzymy trwałej drugiej
aplikacji ani nie przenosimy schematycznego prototypu jako kodu produkcyjnego.

Zakres kończy się odbiorem `dev` na Railway. Promocja `dev` → `main` i wydanie produkcyjne
pozostają osobnym zadaniem po pełnym odbiorze. README opisuje obecny produkt, nie plan.
