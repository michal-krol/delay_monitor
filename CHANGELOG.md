# Historia zmian

Format zgodny z [Keep a Changelog 1.1](https://keepachangelog.com/pl/1.1.0/).
Od wersji 1.0.0 projekt stosuje [Semantic Versioning 2.0.0](https://semver.org/lang/pl/);
wersje 0.9.x powstały przed przyjęciem tej zasady.

## [Niewydane]

### Zmienione

- Biblioteka map MapLibre GL JS zaktualizowana z 6.9.0 do 6.11.1 (wraz z dołączonymi
  kopiami skryptów wątku roboczego mapy).
- Dziennik serwera ostrzega o niepełnej liście pociągów tylko wtedy, gdy pobieranie
  kolejnych stron danych o realizacji faktycznie zostało przerwane (limit stron lub
  budżet zapytań), a nie przy każdej kolejnej stronie.

### Naprawione

- Szczegóły połączenia zużywają mniej zapytań do PKP: trasa pociągu (lista stacji
  z rozkładu) jest zapamiętywana na dobę, a informacja „nie znaleziono połączenia" przez
  10 minut.
- Gdy w ciągu godziny przyjdzie zbyt wiele zapytań o szczegóły połączeń, aplikacja
  pokazuje komunikat „spróbuj ponownie za kilka minut" zamiast zużywać cały limit
  zapytań do PKP, z którego korzystają też tablice odjazdów.

### Bezpieczeństwo

- Szczegóły połączenia przyjmują tylko datę kursowania z zakresu od 7 dni wstecz do
  jutra.
- Ulubione stacje i przystanki zapisane w przeglądarce są sprawdzane pod kątem
  poprawności identyfikatorów; uszkodzony wpis jest pomijany, pozostałe zostają.
- Wyszukiwanie stacji nie zapamiętuje tysięcy nazw przy krótkim zapytaniu, a lista
  stacji w zapytaniu o tablicę jest poprawnie kodowana.
- Zaktualizowane zależności przechodnie `sharp` (0.35.5) i `nanoid` (3.3.19) — usuwa
  dwie podatności o wysokiej wadze zgłaszane przez `npm audit`.

## [1.0.0] — 2026-09-27

Pierwsze stabilne wydanie. Od tej wersji publiczne adresy widoków, kształt odpowiedzi
API wykorzystywanych przez interfejs oraz semantyka prezentowanych danych są objęte
gwarancją zgodności w obrębie wersji 1.x ([ADR 0002](adr/0002-kryteria-wersji-1-0.md)).

### Dodane

- **Mapa transportu** (`/city/[city]/map`): stacje kolejowe z całego kraju
  (wyświetlane stopniowo wraz z przybliżeniem), przystanki i pojazdy komunikacji
  miejskiej. Kolor oznacza rodzaj środka transportu.
  - Wyszukiwanie stacji, przystanków i linii; karta obiektu dokowana obok mapy na
    komputerze i wysuwana od dołu na telefonie.
  - Tryb linii: przebieg, przełącznik kierunku, lista przystanków, wyłącznie pojazdy
    danej linii.
  - Płynny ruch pojazdów, strzałka kierunku jazdy, śledzenie wybranego pojazdu,
    przebiegi metra i kolei miejskiej jako stałe tło w kolorach linii.
  - Filtry warstw i środków transportu (także „tylko linie z utrudnieniami”),
    ulubione na mapie, panel „W pobliżu” (promień 500 m, najbliższe odjazdy)
    i tekstowa lista obiektów w kadrze dla czytników ekranu.
  - Kadr i filtry zapisane w adresie oraz przycisk udostępnienia widoku.
- **Komunikacja miejska (GTFS, Warszawa):**
  - przegląd miasta, lista linii i strona linii z przebiegiem na mapie oraz osią
    przystanków;
  - rozkład linii w trzech stałych kolumnach: dni robocze, soboty, niedziele i święta;
  - tablica odjazdów przystanku z rozróżnieniem stanowisk w obrębie przystanku
    i oznaczeniem przystanków na żądanie;
  - pozycje pojazdów na żywo (odczyt co 15 s) na mapie i na osi linii;
  - komunikaty o utrudnieniach przy liniach i przystankach, zwijane do nagłówka
    z datami obowiązywania.
- **Mapa trasy pociągu** w szczegółach połączenia — przebieg stacja po stacji
  i szacowana pozycja pociągu, zawsze opisana jako wyznaczona z rozkładu.
- **Mapa lokalizacji** w widoku stacji kolejowej i przystanku miejskiego.
- **Współrzędne stacji kolejowych** z feedu GTFS kolei (dopasowanie po identyfikatorze
  PKP PLK): 3137 z 3266 stacji ma dokładną pozycję.
- **Nawigacja mobilna** — wysuwane menu z pełną obsługą klawiatury.
- **Ścieżka nawigacji (breadcrumb)** we wszystkich widokach.
- **Pogoda** w szczegółach połączenia (dla stacji początkowej).
- **Ustrukturyzowane logi serwera** — jedna linia JSON na zdarzenie ze stałym
  kluczem `event`.
- **Monitoring**: codzienne testy kontraktowe API PKP i GTFS oraz sprawdzanie stanu
  produkcji co 30 minut.

### Zmienione

- **Adresy URL w języku angielskim** (zmiana niezgodna wstecz, bez przekierowań):
  `/station/[id]`, `/connection/…`, `/city/[city]`, `/city/[city]/line/[id]`,
  `/city/[city]/stop/[id]`, `/lines`, `/map`; parametry `name`, `station`, `stop`,
  `direction`, `member`. Interfejs pozostaje w języku polskim.
- **Jednolity układ stron** — wspólna rama strony i prawa kolumna kontekstowa
  o jednej szerokości i zachowaniu na wszystkich ekranach.
- **Lista połączeń na tablicy stacji zawsze pochodzi z rozkładu**; dane o ruchu ją
  uzupełniają.

### Usunięte

- Zmienna środowiskowa `BOARD_SOURCE` (przełącznik źródła listy połączeń).

### Naprawione

- Adres przystanku metra zawierający dwukropek (`7014M:P1`) zwracał błąd 404.
- Ikona dostępności dla wózków pojawiała się przy przystankach z wartością domyślną;
  wyświetlana jest teraz wyłącznie dla przystanków oznaczonych jako niedostępne.
- Rozkład linii tracił kolumny „Soboty” i „Niedziele” w dni robocze.
- Przebieg linii bywał wybierany według kursu technicznego do zajezdni zamiast
  typowego kursu.
- Liczba kursów „w trasie” w przeglądzie miasta była niespójna z liczbą kursów dnia.
- Karta pogody linii znikała podczas wczytywania rozkładu.

### Bezpieczeństwo

- Gałąź produkcyjna przyjmuje zmiany wyłącznie przez pull request z pozytywnym
  wynikiem CI (`quality`, `e2e`).
- Automatyczne propozycje aktualizacji zależności (Dependabot).

## [0.9.10] — 2026-09-03

### Dodane

- **Widok stacji** jako osobna strona: wskaźniki dnia (odjazdy, przyjazdy, średnie
  opóźnienie, punktualność), prawa kolumna z najpopularniejszymi kierunkami,
  utrudnieniami i natężeniem ruchu.
- **Szczegóły połączenia** jako osobna strona: przebieg przystanek po przystanku,
  wykres prognozy opóźnienia do celu, szacowana pozycja pociągu przy opóźnionych
  potwierdzeniach PKP.
- **Pogoda dla stacji** (Open-Meteo).
- **Widżet stanu sieci** — ogólnopolska liczba pociągów według statusu, punktualność,
  przewoźnicy i liczba utrudnień.
- **Utrudnienia** — oznaczenie w wierszu tablicy, sekcja w szczegółach połączenia,
  licznik w widżecie stanu sieci.
- **Prognoza opóźnienia** dla pociągów, które jeszcze nie wyruszyły, wyznaczana ze stacji
  poprzedzającej i oznaczona jako szacunek.
- **Diagnostyka źródeł danych** w `/api/health` oraz panel diagnostyczny w środowiskach
  deweloperskim i testowym.
- **Testy kontraktowe** wobec publicznego schematu API PKP.

### Zmienione

- Lista połączeń na tablicy wyznaczana z rozkładu, uzupełniana danymi o ruchu —
  tablica pozostaje kompletna, gdy PKP nie publikuje bieżących danych o ruchu.
- Wykrywanie wstrzymanej publikacji danych o ruchu i czytelny komunikat
  „PKP nie podaje dziś danych o ruchu”.
- Pełne pobieranie realizacji ruchu z paginacją; komunikat przy niepełnych danych
  w godzinach szczytu.
- Dokładniejsze dopasowanie tras do dnia kursowania.
- Nowy system wizualny: krój Manrope, tokeny kolorów, zestaw ikon, zwijany pasek
  boczny, przełącznik motywu w stałym miejscu.
- Tablica: okno od 5 minut wstecz do 3 godzin naprzód, kierunek ze stacjami
  pośrednimi, peron i tor jako osobne wartości, wyróżnienie zmiany opóźnienia,
  układ kart na telefonie.
- Godziny zawsze w strefie czasowej Warszawy.

### Naprawione

- Bufor rozkładu mógł obsługiwać zapytania z dnia następnego oknem bez dnia bieżącego.
- Błąd wczytania współrzędnych stacji był prezentowany jako brak lokalizacji.
- Poprawki układu mobilnego, legendy statusów i ponawiania zapytań po przekroczeniu
  czasu.

## 0.9.9 — 2026-08-06

### Dodane

- Szczegóły połączenia po wybraniu pociągu: przebieg przystanek po przystanku
  z opóźnieniem dla każdego przystanku, peronami i torami.
- Stan widoku zapisywany w adresie URL oraz przycisk „Kopiuj link”.
- Ikona aplikacji.

### Zmienione

- Dane trybu mock oparte na prawdziwych identyfikatorach i nazwach stacji.
- Logika statusu i opóźnienia wspólna dla tablicy i szczegółów połączenia.

### Naprawione

- Pociąg przed odjazdem był prezentowany jako punktualny, gdy PKP podawało kopię
  czasu planowego jako czas rzeczywisty. Status opiera się teraz na potwierdzeniu
  przejazdu dla każdego przystanku.

## 0.9.8 — 2026-08-04

### Dodane

- Peron i tor na kartach ulubionych stacji.

### Zmienione

- Na wąskich ekranach karty pokazują kod przewoźnika; kolumna peronu i toru jest
  widoczna również na telefonie.
- Informacja o częstotliwości odświeżania danych.

## 0.9.7 — 2026-08-04

### Dodane

- Połączenia sprzed maksymalnie 5 minut pozostają widoczne i są wizualnie przygaszone.
- Status „jeszcze nie wyjechał”.
- Godzina odjazdu na kartach ulubionych stacji, które pokazują wyłącznie nadchodzące
  połączenia.
- Logo przewoźnika Polregio.

### Zmienione

- Pełna nazwa przewoźnika pochodzi ze słownika PKP.
- Kolumna przewoźnika widoczna na telefonie.
- Ok. 12-krotnie mniejsze odpowiedzi z danymi o realizacji ruchu, co wyeliminowało
  przekroczenia czasu odświeżania.

### Naprawione

- Część pociągów wyświetlała identyfikator wewnętrzny zamiast nazwy i nie miała
  przewoźnika — poprawione dopasowanie rozkładu do realizacji.

## 0.9.6 — 2026-08-03

### Naprawione

- Pociągi odjeżdżające tuż po północy nie miały nazwy, przewoźnika ani peronu.

## 0.9.5 — 2026-08-03

### Zmienione

- Przełącznik motywu w stałym miejscu w prawym górnym rogu.
- Kolumna „Peron/Tor” wypełniona danymi z rozkładu.

## 0.9.4 — 2026-08-03

### Dodane

- Przełącznik trybu jasnego i ciemnego.

### Zmienione

- Nazwa aplikacji: „Monitor opóźnień”.
- Kolumna „Pociąg” pokazuje nazwę lub numer pociągu z rozkładu.
- Tabela dopasowana do wąskich ekranów bez przewijania w poziomie.

## 0.9.3 — 2026-08-02

### Naprawione

- Baner błędu konfiguracji wyświetlał się razem z tablicą.
- Nieobsłużony błąd przy wczytywaniu danych trybu mock.

### Zmienione

- Porządki w kodzie klienta API, pollera i testów bez zmian w działaniu.
- Reguły lintera dla testów.

## 0.9.2 — 2026-08-02

### Bezpieczeństwo

- Walidacja i kodowanie identyfikatorów stacji przed wysłaniem do API PKP.
- Ochrona limitu zapytań przed nieznanymi identyfikatorami i nadmiarem wymuszonych
  odświeżeń.
- Deduplikacja równoległych zapytań o te same dane.
- Limity liczby stacji i długości zapytania wyszukiwarki.
- Nagłówki bezpieczeństwa (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`).
- Aktualizacja zależności z podatnościami.

### Naprawione

- Uszkodzone dane ulubionych w `localStorage` blokowały interfejs — dane są teraz
  walidowane, a błędne wpisy pomijane.

### Zmienione

- Wyrównane szerokości cyfr w kolumnach godzin; systemowy krój pisma.

## 0.9.1 — 2026-08-02

### Naprawione

- Czasy bez oznaczenia strefy były interpretowane w strefie procesu serwera, co na
  produkcji przesuwało godziny pociągów o 2 godziny.

## 0.9.0 — 2026-08-02

Pierwsza wersja funkcjonalna.

### Dodane

- Pulpit ulubionych stacji z najbliższymi odjazdami i liczbą opóźnionych pociągów.
- Tablica odjazdów i przyjazdów stacji.
- Wyszukiwarka stacji z obsługą klawiatury.
- Ulubione stacje zapisywane w przeglądarce.
- Poller z oszczędnym wykorzystaniem limitu zapytań PKP.
- Przewoźnik, kategoria handlowa i logotypy przewoźników.
- Tryb mock bez klucza API.
- Tryb jasny i ciemny.
- Wdrożenie na Railway i bramka jakości w GitHub Actions.

[Niewydane]: https://github.com/michal-krol/delay_monitor/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/michal-krol/delay_monitor/compare/v0.9.10...v1.0.0
[0.9.10]: https://github.com/michal-krol/delay_monitor/releases/tag/v0.9.10
