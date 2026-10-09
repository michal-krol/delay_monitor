# Historia zmian

Format zgodny z [Keep a Changelog 1.1](https://keepachangelog.com/pl/1.1.0/).
Od wersji 1.0.0 projekt stosuje [Semantic Versioning 2.0.0](https://semver.org/lang/pl/);
wersje 0.9.x powstały przed przyjęciem tej zasady.

## [Niewydane]

### Dodane

- Własne ekrany błędu i „Nie znaleziono strony”: po nieudanym wczytaniu strony są przyciski
  „Spróbuj ponownie” i „Wróć do Pulpitu”, a nawigacja aplikacji zostaje na miejscu. Treści
  błędu nie widać — pokazujemy tylko polski komunikat.
- Szkielet zamiast pustego ekranu na stronach Linie, Mapa i Linia oraz przy wyborze miasta na
  `/city`, `/lines` i `/map` (wcześniej przez kilka sekund widać było sam napis „Wybieram miasto…”).
- `robots.txt` (wyszukiwarki omijają `/api/`) i `sitemap.xml` ze stacjami, ekranami miast
  i listami linii. Nie wysyła zapytań do PKP.
- Instalacja jako aplikacja: jednorazowa podpowiedź „Zainstaluj aplikację” (Android i
  komputer) albo instrukcja „Udostępnij → Do ekranu początkowego” (iPhone, iPad); zamknięta
  lub zainstalowana nie wraca. Manifest ma kategorie, skrót „Odjazdy” i zrzuty
  ekranu do okna instalacji. Na iOS tryb aplikacji z przezroczystym paskiem stanu.
- W trybie aplikacji wiek danych podpowiada „dotknij, by odświeżyć”.

### Zmienione

- Tablica stacji na telefonie: górny rząd to „←”, nazwa stacji, gwiazdka i menu „Więcej” z
  „Udostępnij” i „Informacje o stacji”. Wskaźniki dnia nie stoją już nad tablicą — są w arkuszu
  „Info”, a w ich miejscu jest jeden wybór kierunku („Wszystkie kierunki”; na przyjazdach „Skąd”),
  zbudowany z pociągów na tablicy, bez dodatkowych zapytań do PKP. Komputer bez zmian.
- Ekran stacji na telefonie: pierwszy odjazd jest wyżej (z ok. 470 do najwyżej 340 px od góry
  ekranu 375×812). Nazwa stacji występuje raz, a „←”, gwiazdka i „Udostępnij” są w jej karcie;
  wskaźniki dnia to cztery równe kafelki w jednym rzędzie; zakładki „Odjazdy/Przyjazdy” i „Info”
  stoją w jednej siatce. Legenda statusów i filtr najpopularniejszych kierunków są w arkuszu „Info”.
- Pogoda na ekranach miasta (Odjazdy, Linie, linia, przystanek) to chip z ikoną i temperaturą
  w górnym pasku; dotknięcie otwiera szczegóły (arkusz na telefonie, dymek na komputerze). Bez
  danych chip nie pokazuje temperatury.
- Ekran miasta na telefonie: pod wyszukiwarką „Ostatnio oglądane”, statystyki miasta zwinięte do
  jednej linii „Statystyki”. Nagłówek mapy zajmuje mniej miejsca.
- Ekran Linie: pomarańczowe „dane sprzed N h” pojawia się dopiero po dobie bez odświeżenia
  rozkładu albo przy nieudanym odświeżeniu (rozkład zmienia się raz dziennie), a blok stanu
  rozkładu nie powtarza się już u góry i na dole strony.
- Wybór miasta jest ukryty, dopóki w aplikacji jest jedno miasto.
- Po powrocie do aplikacji dane odświeżają się od razu, gdy zwykły termin odpytywania już minął
  (zawieszona aplikacja na iPhonie). Nie zwiększa to liczby zapytań do PKP ponad zwykły rytm.
- Pełnoekranowa mapa wyłącza gest „pociągnij, by odświeżyć” przeglądarki (Android; do sprawdzenia na urządzeniu).
- Decyzja o braku service workera i powiadomień push: `adr/0008-pwa-bez-service-workera.md`.
- Skróty w menu ikony zainstalowanej aplikacji (Pulpit, Odjazdy, Mapa, Linie) mają własne
  ikony — te same znaki co w dolnym pasku nawigacji — zamiast wspólnego logo aplikacji.

## [1.2.0] — 2026-10-07

### Dodane

- Dolny pasek nawigacji na telefonie: „Pulpit”, „Odjazdy”, „Linie” i „Mapa” zawsze pod
  kciukiem. U góry cienki nagłówek z wyszukiwarką i przełącznikiem motywu.
- Jedna wyszukiwarka stacji kolejowych z całej Polski i przystanków miejskich, dostępna
  z każdego ekranu: na telefonie przyciskiem „Szukaj” w nagłówku, na komputerze przyciskiem
  w pasku bocznym, skrótem Ctrl+K (⌘K) albo klawiszem „/”.
- „Ostatnio oglądane”: aplikacja pamięta do 8 ostatnio otwartych stacji i przystanków
  (wybrany przystanek zespołu razem z numerem). Cztery najnowsze są na Pulpicie, wszystkie —
  w pustej wyszukiwarce. „Wyczyść” usuwa listę.
- Aplikację można zainstalować na ekranie początkowym telefonu: ma własną ikonę (na
  Androidzie wypełnia cały kształt ikony, bez białej obwódki), kolor paska przeglądarki
  dopasowany do motywu — także wybranego ręcznie przełącznikiem — i skróty do Pulpitu,
  Mapy i Linii. Działa tylko z dostępem do internetu.
- Komunikat „Brak połączenia — dane sprzed N min”, gdy telefon traci zasięg; ekran nadal
  pokazuje ostatnio pobrane dane.
- Karty na Pulpicie oznaczają pociągi z utrudnieniem tą samą ikoną co pełna tablica.
- Filtr mapy „Tylko linie z utrudnieniami” ma ikonę utrudnienia, a przycisk „Lista” —
  ikonę listy.
- Tryb mock pokazuje więcej funkcji z wersji 1.0.x–1.1.0: autobusy każdego rodzaju (zwykłe,
  podmiejskie, lokalne, zastępcze), przystanek „na żądanie”, kilka komunikatów o utrudnieniach
  (z zakresem dat, bardzo długi, z nieznanym skutkiem), pojazd z nieświeżą pozycją, więcej
  stacji Warszawy i licznik utrudnień PKP zgodny z danymi.
- Zmienna `MOCK_BUDGET` (`low` lub `unknown`) pokazuje w trybie mock panel diagnostyczny przy
  niskim lub nieznanym limicie zapytań PKP. Zmienna `WEATHER_DATA_SOURCE=mock` podaje stałą
  pogodę bez zapytań do Open-Meteo (testy e2e).
- Odliczanie „za N min” przy godzinie odjazdu na tablicy stacji, na kartach Pulpitu i na liście
  odjazdów przystanku, gdy do odjazdu zostało mniej niż godzina. Pociąg odlicza do godziny
  faktycznej albo prognozowanej, jeśli PKP ją podaje; odwołany nie odlicza wcale. Komunikacja
  miejska pisze „za N min · wg rozkładu”, bo to plan, nie pomiar.
- Przycisk „Info” na tablicy stacji i przystanku w telefonie otwiera panel od dołu ze
  statystykami, pogodą, natężeniem ruchu, mapą i liniami — tym samym, co na komputerze stoi
  w prawej kolumnie.
- Dotknięcie „Aktualizacja … temu” na tablicy stacji i na Pulpicie od razu odświeża dane.
  Pełna data i godzina aktualizacji są w podpowiedzi.
- Podgląd linku do stacji, przystanku i linii (komunikator, media społecznościowe): karta
  z logo, nazwą miejsca, ikoną rodzaju transportu i miastem oraz tytuł strony z nazwą zamiast
  samego „Monitor opóźnień”. Nazwy pochodzą wyłącznie z naszych danych (słownik stacji,
  rozkład) — nigdy z adresu; nieznany lub niepoprawny identyfikator daje kartę ogólną.
- Płynne przejścia między ekranami: wejście w stację z Pulpitu „przenosi” nazwę z karty do
  nagłówka tablicy, głębsze ekrany wjeżdżają z prawej, powrót odjeżdża w prawo, a zakładki
  dolnego paska i przełączenie Odjazdy ↔ Przyjazdy przenikają się. Pasek u góry i dolny
  stoją w miejscu.
- Na telefonie, gdy przewijasz tablicę stacji lub przystanku, nagłówek zamienia nazwę aplikacji
  na nazwę miejsca (bez przesuwania treści).
- Liczby opóźnień i kafelki statystyk „toczą się” przy zmianie wartości, a wiersze tablicy
  i listy odjazdów płynnie się pojawiają i przesuwają.
- Drobne sygnały żywych danych: poświata pod aktywną zakładką dolnego paska, pulsująca kropka
  przy świeżych danych i pojazdach z pozycją na żywo, miękka poświata przy opóźnionych
  pociągach (status zawsze jest też napisany) oraz ugięcie karty Pulpitu pod palcem.
- Wszystkie efekty wyłączają się przy ustawieniu systemu „ogranicz ruch”, a przy „ogranicz
  przezroczystość” paski i arkusze mają pełne tło. Przejścia między ekranami są na razie tylko
  w przeglądarkach z silnikiem Chromium (Chrome, Edge, Samsung Internet); w Safari ich nie ma.

### Zmienione

- Mapa transportu na telefonie zajmuje cały ekran między nagłówkiem a dolnym paskiem, a strona
  się nie przewija. Karta przystanku, stacji, pojazdu albo linii otwiera się w panelu od dołu
  na jednej czwartej ekranu. Panel można podnieść do połowy albo prawie do góry, przeciągając
  go palcem albo dotykając uchwytu. „×” i Escape go zamykają, a mapę nad nim nadal da się
  przesuwać.
- Kontrolki mapy na telefonie mieszczą się w dwóch rzędach: przełącznik „Przystanek | Linia”,
  „Filtry”, „Przypięte” i nowe menu „Więcej” (w nim „Lista” i „Udostępnij widok”), a pod nimi
  pole wyszukiwania na całą szerokość. Nagłówek mapy jest niższy.
- Komunikaty o utrudnieniach w karcie na mapie w telefonie są zwinięte w jeden wiersz
  „Komunikaty (n)”, żeby odjazdy były widać od razu.
- Małe mapy na stronach przystanku, stacji, linii i połączenia nie przechwytują już przewijania:
  jednym palcem przewijasz stronę, dwoma przesuwasz mapę (na komputerze Ctrl + kółko).
- Menu za przyciskiem „hamburgera” na telefonie zastąpił dolny pasek nawigacji.
- Strzałka „Wróć” w szczegółach połączenia otwartych z udostępnionego linku (albo
  z zainstalowanej aplikacji) prowadzi na Pulpit, zamiast nie robić nic.
- Pole wyszukiwania pokazuje na telefonie klawiaturę z przyciskiem „Szukaj”, a podpowiedzi
  mają większy obszar dotyku i wybierają się zwykłym stuknięciem.
- Precyzyjne nazwy przystanków komunikacji miejskiej. Sama nazwa („Centrum”) oznacza
  teraz zawsze cały zespół przystanków, a konkretny przystanek ma numer („Centrum 02”):
  w „Najbliższym odjeździe”, na kartach Pulpitu i mapy, przy następnym przystanku
  pojazdu, w panelu linii i na stronie linii. Z aplikacji zniknęło słowo „słupek”.
- Przypinasz to, co widzisz: przypięty „Centrum 02” pokazuje na Pulpicie odjazdy tylko
  z tego przystanku, a przypięty zespół — wszystkie, z numerami przystanków. Wcześniej
  przypięte przystanki działają dalej jako cały zespół.
- Wybrany przystanek zespołu zapisuje się w linku jako `?przystanek=`. Starsze linki
  z `?slupek=` otwierają cały zespół.
- Jeden zestaw ikon w całej aplikacji (Lucide). Każde pojęcie ma jedną ikonę: „Odjazdy”
  w menu mają własną ikonę tablicy, odjazd i przyjazd w szczegółach połączenia mają
  strzałki zamiast zegara, a przypięte miejsca zawsze mają pełną gwiazdkę. Rozwijane
  sekcje mają strzałkę w dół, która po rozwinięciu obraca się w górę. Rozmiary ikon
  zależą od ich roli (w czipie, w tekście, w przycisku, na kafelku).
- Strzałka kierunku pojazdu na mapie i w legendzie ma kształt grotu nawigacji zamiast
  trójkąta.
- Favicona i ikony aplikacji (także na ekran początkowy iPhone’a) mają teraz to samo
  logo co w aplikacji.
- Usunięto nieczytane kolumny kolorów z przykładowego pliku `routes.txt` oraz nieaktualne
  komentarze o liczbie pociągów w mocku.
- Tablice na telefonie zaczynają się od odjazdów: na ekranie 375×667 pierwszy odjazd stacji,
  przystanku i stacji wybranej na ekranie miasta widać bez przewijania. Nagłówek tablicy jest
  zwarty, statystyki są pigułkami w jednym–dwóch rzędach, a przystanki zespołu — rzędem
  przycisków z samym numerem.
- Zakładki „Odjazdy | Przyjazdy” (i zakładki przystanku z filtrem linii) przyklejają się pod
  nagłówkiem przy przewijaniu, mają przyciski 44 px, a obok nich jest legenda statusów „?”
  (wcześniej w nagłówku tabeli, którego na telefonie nie widać).
- Najpopularniejsze kierunki są na tablicy stacji przyciskami nad listą (na węższych ekranach
  niż szeroki monitor); dotknięcie filtruje tablicę i zapisuje kierunek w linku.
- Ekran miasta na telefonie: najpierw wyszukiwarka, statystyki pod nią.
- Strona linii poniżej szerokości laptopa: przełącznik „Trasa | Rozkład”; wybór przystanku na
  trasie od razu pokazuje jego rozkład.
- Mapa na telefonie: chipy „Aktywne filtry”, komunikat „Skopiowano link…” i komunikaty
  o problemach z danymi jadą nad górną krawędzią panelu, zamiast chować się pod nim.
- Rozmycie tła (szkło) jest tylko na pływających elementach: paski, menu i kontrolki mapy,
  pastylka offline i arkusze. Karty z treścią są prawie kryjące i bez rozmycia.

### Naprawione

- Telefon: wszystkie przyciski i pola listy mają cel dotyku co najmniej 44 px (wybór miasta,
  filtry mapy, strona linii, „Wróć do wyszukiwania”), a tekst nigdzie nie jest mniejszy niż
  12 px. Pola formularzy mają 16 px, więc iPhone nie powiększa ekranu po dotknięciu pola.
  Karty nie „zostają uniesione” po dotyku, a przyciski mają własny stan wciśnięcia.
- Ładowanie tablic pokazuje szkielety wierszy zamiast samego napisu „Wczytywanie…”; komunikaty
  o nieudanym pobraniu mówią jednolicie „Nie udało się …” (słownik w `.claude/rules/ui-copy.md`).
- Mapa: otwarcie przypiętego zespołu przystanków z menu „Przypięte” pokazuje kartę zespołu
  z zapełnioną gwiazdką, a stare przypięcia zespołu zapisane pod id przystanku są po wczytaniu
  Pulpitu przepisywane na id zespołu.
- Arkusz od dołu nie przeskakuje już na mijany punkt, gdy animacja uchwytu jest wolna
  (obciążone urządzenie); testy arkusza mapy czekają na dojazd zamiast ścigać się z animacją.

- Ikonę utrudnienia na trasie widać teraz także na tablicy w telefonie (wcześniej stała
  w kolumnie ukrytej w widoku kart).
- Zakładka „Komunikaty” przystanku podczas wczytywania pisze „Wczytywanie komunikatów…”
  zamiast twierdzić, że dla „tego przystanku” nie ma komunikatów.
- Metro: oznaczenie z numerem peronu czytnik ekranu odczytuje jako „peron P1”, a nie
  „Odjazd z przystanku P1”.
- Karta przypiętego zespołu na Pulpicie i karta przystanku na mapie pokazują numer przystanku
  przy odjeździe tylko wtedy, gdy zespół ma więcej niż jeden przystanek.

- Metro: numer peronu nie wyświetla się już dwa razy przy odjeździe.
- Przycisk zmiany kierunku na stronie linii podaje czytnikowi ekranu wybrany kierunek
  („Centrum do Dworzec Centralny zmień kierunek”), a nie tylko „Zmień kierunek”.
  Strzałka „skąd → dokąd” w nagłówku połączenia jest odczytywana jako „do”.
- Rozmycie tła na paskach i kartach nie działało w Chrome (build gubił właściwość bez
  prefiksu). Teraz działa, ale tylko tam, gdzie ma działać.
- Plakietka „opóźniony” bez znanej liczby minut pokazuje samo słowo zamiast „+null min”.

## [1.1.0] — 2026-10-01

### Dodane

- Nowy ekran „Linie” (dawniej „Trasy”). Każdy środek transportu ma zwijaną sekcję, a
  autobusy dzielą się dodatkowo na zwykłe, przyspieszone, podmiejskie, lokalne, nocne i
  zastępcze. Nagłówki tych podsekcji objaśniają zarazem kolory. Kafel linii pokazuje jej
  numer i końcówki „A → B”, więc kierunek widać także na telefonie, bez najeżdżania kursorem.
  Stan zwinięcia sekcji zostaje zapamiętany. Na telefonie sekcje startują zwinięte.
- Pasek „Ostatnio oglądane” z sześcioma ostatnio otwartymi liniami.
- Wyszukiwarka linii przeszukuje wszystkie środki naraz. Wyniki mają oznaczenie rodzaju
  linii („nocna”, „przyspieszona”…).
- Rodzaje linii „podmiejska” (7xx, 8xx) i „lokalna” (L). Widżet komunikacji miejskiej
  podaje ich liczbę.
- Legenda mapy objaśnia kolory autobusów według rodzaju linii (zwykłe, przyspieszone,
  podmiejskie, lokalne, nocne, zastępcze), tymi samymi nazwami i kolorami co ekran „Linie”.

### Zmienione

- Jeden kolor oznacza w całej aplikacji jedną kategorię linii: na plakietkach, tablicach
  przystanków i na mapie. Metro jest żółte, tramwaje morskie, a kolej niebieska. Autobusy
  mają kolory ZTM: zwykłe fioletowe, przyspieszone czerwone, podmiejskie zielone, lokalne
  granatowe, nocne czarne i zastępcze szare. Wcześniej tramwaje i autobusy przyspieszone
  miały ten sam czerwony kolor, a M2 niemal ten sam.
- Metro ma nowy piktogram: „M” w kole.
- Ekran „Linie” ma w prawej kolumnie pogodę i widżet komunikacji miejskiej, jak ekran
  „Odjazdy / Przyjazdy”. Godzina aktualizacji rozkładu jest w stopce. Ostrzeżenie o
  nieświeżym rozkładzie zostaje na górze.
- Powrót z widoku połączenia na tablicę stacji pokazuje od razu ostatnio pobrane dane razem
  z ich wiekiem, a odświeża je w tle, zamiast wyświetlać pusty ekran „Ładowanie". To samo
  dotyczy ponownego otwarcia tego samego połączenia; zakończony przejazd nie jest już
  odpytywany.
- Rozkład PKP jest pobierany raz dla całego kraju i trzymany w pamięci przez 12 godzin
  (2–3 zapytania na dobę), zamiast osobno dla zestawu stacji oglądanych przez użytkowników.
  Dawniej każda zmiana tego zestawu, także czyjeś odejście, kosztowała nowe pobranie z limitu
  PKP. Szczegóły połączenia biorą trasę z tej samej migawki, więc pierwsze otwarcie pociągu
  kosztuje o jedno zapytanie mniej (patrz `adr/0004-rozklad-pkp-ogolnopolski-w-pamieci.md`).
  Kosztem jest ok. 230 MB pamięci serwera.
- Rozkład komunikacji miejskiej zaczyna się wczytywać zaraz po starcie serwera i zostaje
  w pamięci, więc pierwsze wejście na widok miasta nie czeka już na jego pobranie. Pozycje
  pojazdów i komunikaty nadal są pobierane tylko wtedy, gdy ktoś je ogląda.
- Odświeżanie danych w przeglądarce działa wszędzie tak samo: na ukrytej karcie wstrzymuje
  się, a po powrocie na kartę dane odświeżają się od razu, jeśli minął termin odświeżenia.
- Szczegóły połączenia nie odpytują już serwera przy każdym powrocie do okna przeglądarki;
  odświeżają się co 5 minut, gdy karta jest widoczna.
- Widoki linii, listy linii, przystanków i statystyk miasta ponawiają wczytywanie aż do
  skutku, zamiast poddawać się po ok. 30 sekundach, i ponawiają je także po błędzie.
- Godziny aktualizacji na tablicy i w statusie rozkładu oraz wyróżniona bieżąca godzina na
  wykresie natężenia ruchu są zawsze liczone w czasie polskim, niezależnie od strefy
  czasowej urządzenia.
- Długi wiek danych w szczegółach połączenia jest podawany w godzinach i minutach
  (np. „1 h 5 min" zamiast „65 min").
- Rejestr miast jest pobierany raz na stronę we wszystkich widokach i sprawdzany; błędny wpis
  nie psuje już całej listy miast.
- Mapy na stronach linii, przystanku, stacji i połączenia wyglądają tak samo jak mapa
  transportu. Pinezki i trasa mają kolor rodzaju środka transportu. Pojazd to kropka w tym
  samym kolorze ze strzałką kierunku jazdy. Na osi czasu linii pojazd ma ten sam kolor
  i strzałkę w dół zamiast fioletowego trójkąta.
- Kolory statusu (poświata karty stacji, podbarwienie wierszy tablicy, pierścień stanu sieci)
  pochodzą z tej samej palety co plakietki statusu. W stanie sieci pociągi, które „jeszcze nie
  wyruszyły", mają kolor statusu „jeszcze nie wyjechał" zamiast szarego.
- Komunikaty o błędach mają w całej aplikacji jeden odcień czerwieni. Nieudane odświeżenie
  tablicy, gdy widać jeszcze ostatnie dane, jest oznaczone na bursztynowo jako ostrzeżenie,
  tak jak w rozkładzie komunikacji miejskiej.
- Przyciski zamykania, przypinania i usuwania mają wszędzie ten sam wygląd: okrągłe,
  z cienką obwódką. Karta obiektu, panel linii i listy na mapie transportu mają wspólną ramkę.
- Przystanek na żądanie jest oznaczony wszędzie tak samo: plakietką „na żądanie" na tablicy
  odjazdów, na trasie linii (zamiast skrótu „NŻ") i w panelu linii na mapie.
- Najbliższy odjazd na tablicy przystanku i „aktualna" pozycja pojazdu na mapie są wyróżnione
  kolorem akcentu zamiast zielonego — w komunikacji miejskiej nie znamy opóźnień, więc nic
  nie powinno wyglądać jak „na czas".
- Ikony mają jeden styl, a każde pojęcie ma własną ikonę. Strzałka „→" oznacza wyłącznie
  kierunek jazdy, a „otwórz" i „rozwiń" to szewron. Średnie opóźnienie, punktualność, czas
  podróży, liczba przystanków, liczba środków transportu i „Pokaż całe miasto" dostały
  własne ikony zamiast pożyczonych od innych pojęć. Po skopiowaniu linku pojawia się
  „ptaszek". Odjazdy i przyjazdy na stronie stacji mają parę strzałek od peronu i do peronu.
- Logo w pasku bocznym, w nagłówku na telefonie i na pustym Pulpicie to ten sam rysunek co
  ikona aplikacji w przeglądarce.
- Autobusy i przystanki autobusowe na mapie są fuksjowe zamiast zielonych, bo zieleń oznacza
  „na czas". Środki transportu spoza listy („inne") mają szary kolor i własną ikonę zamiast
  autobusu. Legenda mapy pokazuje pojazdy tak, jak rysuje je mapa: kropka ze strzałką
  kierunku.
- Gwiazdka przypięcia ma wszędzie ten sam bursztynowy odcień i jest pełna, gdy obiekt jest
  przypięty. Na kartach Pulpitu odpina się ją tą samą gwiazdką co na stronie stacji
  i przystanku, zamiast krzyżyka widocznego dopiero po najechaniu.
- Oznaczenie „tylko dla wysiadających" w szczegółach połączenia jest neutralne zamiast
  bursztynowego, żeby nie mylić go z utrudnieniem. Zakładka „Komunikaty" przystanku
  sygnalizuje aktywne utrudnienia ikoną ostrzeżenia zamiast kropki.
- Przypinanie ma jedną nazwę: „Przypnij do Pulpitu" i „Odepnij z Pulpitu" na stronie stacji,
  na karcie mapy i na kartach Pulpitu (zamiast „Dodaj do ulubionych" i „Usuń z ulubionych").
  Przycisk szybkiego przeskoku na mapie nazywa się „Przypięte".
- Teksty są spójne w całej aplikacji: wczytywanie to zawsze „Wczytywanie…", przyciski powrotu
  mówią „Wróć do …", zerowe opóźnienie pociągu to „punktualnie", a trend w stanie sieci nazywa
  się „bez odwołań" (tyle mierzy). Wyszukiwarka stacji i przystanków przy braku wyników pisze
  „Brak stacji ani przystanków o tej nazwie".
- Strony stacji, przystanku, linii i połączenia mają u góry jeden wiersz: przycisk „wstecz",
  ścieżkę nawigacji, „Udostępnij" i przełącznik motywu. Strona stacji nie ma już osobnego
  krzyżyka i drugiego przełącznika motywu w karcie, a szczegóły połączenia — drugiego
  przycisku udostępniania. Tytuły stron mają jeden styl, a każda strona ma dokładnie jeden
  główny nagłówek.
- Prawa kolumna ma na wszystkich stronach tę samą szerokość: 320 px przy ekranie 1280 px,
  rośnie do 380 px na szerokich ekranach (także karta obiektu na mapie transportu). Na
  węższych ekranach i na telefonie jej karty (np. „Dziś w Polsce", pogoda) są pod treścią
  zamiast znikać.
- Karty na Pulpicie mają co najmniej ok. 270 px szerokości — przy 1280 px nie ścieśniają się
  już do ok. 150 px i nie ucinają treści.
- Na telefonie wiersz odjazdu z plakietką „na żądanie" i peronem przenosi dodatkowe
  oznaczenia do drugiej linii, więc kierunek i czas „za … min" są w całości widoczne.
- Małe przyciski-ikony (przypnij, zamknij, motyw, menu, zwijanie paska, powiększenie mapy,
  „wstecz") reagują na dotyk w polu 44 × 44 px, bez zmiany wyglądu. Minuty w rozkładzie linii
  mają co najmniej 24 × 24 px.
- Ostrzeżenia („dane sprzed …", utrudnienia, degradacja źródła) mają w całej aplikacji jeden
  odcień bursztynu zamiast trzech.
- Aktywna zakładka „Odjazdy"/„Przyjazdy" na stronie stacji ma ten sam kolor akcentu co
  zakładki na stronie przystanku.
- Na wąskim ekranie ścieżka nawigacji obok przycisku „wstecz" pokazuje tylko bieżącą stronę,
  w jednym wierszu (długa nazwa kończy się wielokropkiem); „wstecz" prowadzi do rodzica.
- Strona linii i lista linii mówią „Wczytywanie rozkładu…", jak reszta aplikacji.

### Usunięte

- Filtr środka transportu na ekranie „Linie”. Dublował podział na sekcje.
- Wyłączone pozycje menu „Ulubione", „Powiadomienia" i „Ustawienia" („Wkrótce") — nie
  prowadziły nigdzie. Przypięte stacje i przystanki są na Pulpicie.

### Naprawione

- Pole wyszukiwania na mapie transportu ma na telefonie pełną szerokość. Przyciski „Lista”,
  „Filtry” i „Udostępnij” są teraz w osobnym rzędzie pod polem, przy prawej krawędzi.
  Wcześniej na ekranie o szerokości 375 px pole kurczyło się do kilkudziesięciu pikseli i
  widać było tylko „Sz…”. Dotyczyło to obu zakładek: „Przystanek” i „Linia”. Karta wybranej
  linii lub przystanku zajmuje tylko miejsce pod tymi kontrolkami i nie zasłania już
  aktywnych filtrów (np. „Linia 20 ×”).
- Rozwinięta legenda mapy transportu nie zasłania już przycisków przybliżania i oddalania ani
  przycisku „Pokaż całe miasto” w prawym górnym rogu. Zaczyna się pod nimi, a na niskim
  ekranie (np. laptop 800 × 600 albo telefon 375 × 667) przewija się w pozostałym miejscu.
  Na telefonie zaczyna się także pod przyciskami „Lista”, „Filtry” i „Udostępnij”, które
  schodzą tam do drugiego rzędu (wcześniej zasłaniała ich dolną część).
- Linia zapisana w rozkładzie GTFS dwa razy pod tym samym identyfikatorem pokazuje się na
  ekranie „Linie” raz, a liczniki linii w widżecie komunikacji miejskiej liczą ją raz.
  Wcześniej taka linia (w Warszawie 30.09 była to „10”) miała dwa kafle.
- Ostrzeżenie „dane sprzed …" na tablicy i pulpicie liczy wiek danych od chwili ich
  pobrania w przeglądarce, a nie tylko od chwili ich zapisania na serwerze. Wcześniej stare
  dane, które przy nieudanym odświeżeniu zostawały na ekranie, wciąż wyglądały na świeże;
  teraz wiek rośnie razem z upływem czasu.
- Pogoda „bezchmurnie" pokazuje słońce zamiast księżyca, a przełącznik motywu rysuje
  słońce i księżyc tam, gdzie powinien.
- Czytniki ekranu odczytują ikony, które niosą znaczenie bez tekstu obok: niedostępność
  przystanku dla osób na wózku, utrudnienie na trasie w tablicy, aktywne utrudnienia na
  zakładce „Komunikaty" i strzałkę kierunku („do"). Kropki legend są pomijane.
- Zakładka „Komunikaty" na stronie przystanku nie twierdzi już przez pierwsze pół minuty, że
  nie ma komunikatów, gdy serwer dopiero je pobiera — pokazuje „Wczytywanie komunikatów…",
  a utrudnienie pojawia się po kilku sekundach.
- Mapy na stronach linii, przystanku, stacji i połączenia mają ciemny podkład w ciemnym
  motywie i przełączają go razem z motywem. Przycisk powiększenia i zamknięcia mapy,
  przyciski przybliżania na mapie transportu oraz krzyżyk i grot dymka mają ciemne style
  w ciemnym motywie.
- Informacja o źródłach mapy (przycisk „i" z listą źródeł) ma ciemne tło w ciemnym motywie
  zamiast białego.
- Linie oddzielające wiersze na listach odjazdów i w szczegółach połączenia mają kolor
  obramowania kart zamiast koloru tekstu.
- Gdy źródło rozkładu komunikacji miejskiej jest niedostępne, serwer nie próbuje go pobierać
  ponownie przy każdym odświeżeniu otwartych widoków — kolejne próby są coraz rzadsze
  (od 30 sekund do godziny), a po udanym pobraniu wszystko wraca do normy.
- Gdy nie da się pobrać komunikatów o utrudnieniach, widżet komunikacji miejskiej przestaje
  co 15 sekund ponawiać zapytania i pokazuje „Nie udało się pobrać utrudnień." zamiast
  wiecznego „Wczytuję…". Jeśli wcześniej udało się je pobrać, pokazuje ostatnie znane
  utrudnienia z informacją, jak stare są dane.
- Widżet komunikacji miejskiej sam zauważa, że komunikaty o utrudnieniach znów są dostępne:
  po nieudanym pobraniu sprawdza je ponownie co 5 minut, gdy karta jest widoczna, zamiast
  czekać na przeładowanie strony. Wiek pokazywanych danych też się wtedy aktualizuje.
- Opis wydania 1.0.0 obiecywał „ścieżkę nawigacji we wszystkich widokach" i „prawą kolumnę
  o jednej szerokości". W rzeczywistości strona stacji nie miała ścieżki ani głównego
  nagłówka, a prawa kolumna miała cztery różne szerokości i znikała poniżej szerokiego
  ekranu. Teraz obie obietnice są spełnione (patrz „Zmienione").
- Czytniki ekranu dostają informacje, które dotąd były tylko w dymku po najechaniu myszą:
  wiek pozycji pojazdu na tablicy przystanku i na osi czasu linii, słupek odjazdu oraz powód
  ograniczonego odświeżania tablicy.
- Karta obiektu, panel linii i listy na mapie transportu zamykają się klawiszem Escape
  i oddają fokus tam, skąd go wzięły; Escape w otwartej liście rozwijanej zamyka najpierw
  tylko listę. Po zamknięciu powiększonej mapy fokus wraca na przycisk „Powiększ mapę".
- Zakładki „Odjazdy" i „Przyjazdy" na stronie stacji przełącza się strzałkami, Home i End,
  a czytniki ekranu wiedzą, którą tablicę zakładka pokazuje.
- Link „Zobacz pełną tablicę" w dymku mapy ma szewron zamiast tekstowej strzałki „→".
- Pusty Pulpit i ekran miasta z wybranym przystankiem miały dwa główne nagłówki naraz.
- Na ekranie 375 px strona linii nie przewija się już w poziomie (karty trasy i rozkładu były
  szersze od ekranu), a przyciski w nagłówku ekranu miasta schodzą pod tytuł, zamiast
  wystawać poza stronę.
- Kafelki z liczbą pociągów, średnim opóźnieniem i punktualnością na stronie stacji przy
  oknie 1280 px mieszczą się w dwóch kolumnach zamiast czterech ściśniętych (napis
  „Punktualność" był ucięty), a tablica odjazdów nie przewija się w poziomie. Nazwa
  przewoźnika w tablicy kończy się wielokropkiem zamiast nachodzić na kolumnę „Kierunek".
  Długa lista stacji pośrednich („przez Warszawa Wschodnia, Wołomin, Tłuszcz · +15
  przystanków”) też kończy się wielokropkiem, zamiast poszerzać tablicę.
- Na stronach stacji, połączenia i przystanku przy oknie węższym niż 1280 px prawa kolumna
  (kierunki, pogoda, mapa, natężenie ruchu) schodzi pod treść. Przy 1024 px tablica odjazdów
  nie przewija się już w poziomie, a treść ma dwa razy więcej miejsca.
- Escape w wyszukiwarce na mapie transportu, gdy widać „Szukam…", „Brak …" albo błąd, czyści
  pole zamiast zamykać otwarty panel mapy.
- Zakładki na stronie przystanku („Najbliższe odjazdy", „Wszystkie linie", …) i wybór słupka
  przełącza się strzałkami, Home i End, a klawisz Tab zatrzymuje się tylko na wybranej
  zakładce — jak na stronie stacji.
- Prawa kolumna, podsumowanie połączenia, treść paneli mapy i rozwinięty komunikat
  o utrudnieniu są przystankiem klawisza Tab tylko wtedy, gdy faktycznie się przewijają
  (na telefonie był to zbędny przystanek).
- Przycisk usuwania filtra („Linia …") na mapie transportu reaguje na dotyk w polu 44 × 44 px.
- Pełna albo zablokowana pamięć przeglądarki nie wywraca już strony przy przypinaniu stacji
  ani przy zwijaniu paska bocznego — przypięcie działa do końca wizyty, tylko się nie zapisze.
- Pojazd na mapie transportu i jego plakietka w karcie mają kolor tej samej kategorii linii
  co na ekranie „Linie”. Wcześniej mapa zgadywała kategorię tylko z numeru linii i pomijała
  opis linii z rozkładu (np. „nocna”, „zastępcza”).

## [1.0.2] — 2026-09-28

### Zmienione

- Wyłącznie narzędzia deweloperskie, bez wpływu na działanie aplikacji: TypeScript 6.0.3
  i Vitest 5.0.2, szybsze testy jednostkowe (wątki zamiast procesów), kontrola zgodności
  zainstalowanych zależności z `package-lock.json` przed wypchnięciem zmian oraz czytelny
  komunikat, gdy brakuje przeglądarek do testów e2e.

## [1.0.1] — 2026-09-28

### Zmienione

- Szybsze odpowiedzi widoków komunikacji miejskiej (statystyki miasta, tablica
  przystanku, wyszukiwarka przystanków) dzięki zapamiętywaniu wyników obliczeń
  dla danego rozkładu.
- Szybsze wyznaczanie pozycji pojazdów na tablicy przystanku i mapie miasta.
- Zawieszone połączenie z serwerem danych GTFS nie blokuje już odświeżania
  pozycji pojazdów i alertów (rezygnacja po 10 s); pobieranie pełnego rozkładu
  czeka najwyżej 30 s na pierwszą odpowiedź serwera.
- Biblioteka map MapLibre GL JS zaktualizowana z 6.9.0 do 6.11.2 (wraz z dołączonymi
  kopiami skryptów wątku roboczego mapy).
- Dziennik serwera ostrzega o niepełnej liście pociągów tylko wtedy, gdy pobieranie
  kolejnych stron danych o realizacji faktycznie zostało przerwane (limit stron lub
  budżet zapytań), a nie przy każdej kolejnej stronie.
- Czcionka nagłówków (Manrope) jest dołączona do aplikacji, więc budowanie nie pobiera
  jej już z Google Fonts i nie zależy od dostępności tej usługi.

### Usunięte

- Ulubione zapisane w starym formacie (sprzed wersji 1.0.0) nie są już wczytywane — takie
  stacje trzeba przypiąć ponownie.

### Naprawione

- Szczegóły połączenia zużywają mniej zapytań do PKP: trasa pociągu (lista stacji
  z rozkładu) jest zapamiętywana na dobę, a informacja „nie znaleziono połączenia" przez
  10 minut.
- Gdy w ciągu godziny przyjdzie zbyt wiele zapytań o szczegóły połączeń, aplikacja
  pokazuje komunikat „spróbuj ponownie za kilka minut" zamiast zużywać cały limit
  zapytań do PKP, z którego korzystają też tablice odjazdów.
- Otwarta karta szczegółów połączenia dociągająca dane w tle (co 5 minut oraz przy
  powrocie na kartę) nie blokuje już innym użytkownikom pierwszego wczytania —
  ostatnie kilka zapytań w każdej godzinie jest zarezerwowane dla nowych wejść.
  Nieudane dociągnięcie w tle nie pokazuje błędu — strona zostaje przy ostatnich
  dobrych danych i pokazuje, ile mają minut (chyba że pociąg już dojechał —
  wtedy nic nie ma się już zmienić).
- Widżet „Dziś w Polsce” nie pokazuje już zer ani 100 % pociągów zgodnie z planem, gdy
  dane są niedostępne — pokazuje „—” / „Brak danych o ruchu”, błąd przed pierwszym
  pobraniem danych oraz „nieaktualne · HH:MM” przy danych nieświeżych. Statystyki nie
  pokazują już po północy liczb z poprzedniej doby.
- Strona miasta: kafelek z liczbą stacji kolejowych pokazuje „—” zamiast 0, gdy ta
  liczba nie jest znana; karta pogody nie ładuje się już w nieskończoność, gdy miasto
  nie ma stacji lub nie uda się pobrać listy miast; widżet komunikacji miejskiej
  pokazuje błąd przy niepowodzeniu oraz „Brak rozkładu na dziś.”, gdy nie da się
  ustalić dzisiejszego dnia rozkładowego.
- Strona przystanku i karta przystanku na Pulpicie odróżniają teraz ładowanie, błąd i
  pusty rozkład oraz pokazują nazwę miasta zamiast fragmentu adresu.
- Karta stacji na Pulpicie po nieudanym odświeżeniu zachowuje ostatnią tablicę i
  pokazuje „Nie udało się odświeżyć · dane z HH:MM” zamiast czerwonego błędu.
- Strony wyboru miasta (/city, /lines, /map) po nieudanym pobraniu listy miast pokazują
  błąd z przyciskiem „Spróbuj ponownie” zamiast twierdzić, że miast nie ma.
- Pozycje pojazdów bez poprawnego znacznika czasu nie są już pokazywane jako aktualne —
  są pomijane.

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

[Niewydane]: https://github.com/michal-krol/delay_monitor/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/michal-krol/delay_monitor/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/michal-krol/delay_monitor/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/michal-krol/delay_monitor/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/michal-krol/delay_monitor/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/michal-krol/delay_monitor/compare/v0.9.10...v1.0.0
[0.9.10]: https://github.com/michal-krol/delay_monitor/releases/tag/v0.9.10
