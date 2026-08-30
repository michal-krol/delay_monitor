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

Cały HTTP siedzi w `src/lib/pkp/client.ts`. Logika domenowa (`lib/board/`) to
czyste funkcje zależne od interfejsu `PkpClient`, nie od implementacji. Dzięki
temu testy nie potrzebują ani sieci, ani klucza API — i to ma tak zostać.

Wybór live/mock następuje raz, przy starcie, w `lib/board/instance.ts`. Żaden
inny moduł nie powinien wiedzieć, skąd pochodzą dane.

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

## 8. Fixture'y nie odwzorowują skali żywego API

Mock ma **prawdziwe** ID stacji (Warszawa Centralna `33605`, Kraków Główny
`80416`, Wrocław Główny `60103`, Gdańsk Główny `7500` — te same co na żywo),
ale to wciąż 8 pociągów zamiast kilkudziesięciu-kilkuset i 6 kodów
przewoźników zamiast 22. Nadają się do pracy nad UI — nie do wnioskowania
o rzeczywistym natężeniu ruchu produkcji.

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

## 10. Katalog `docs/` nie jest publikowany

`docs/` (projekt techniczny, plan implementacji) jest w `.gitignore` i celowo
nie trafia do repozytorium. Nie dodawaj go z powrotem.

## 11. Bramka jakości

Commity trafiają bezpośrednio na `main`, z którego deployuje Railway. Przed
oddaniem pracy:

```bash
npm run typecheck && npm run lint && npm run test
```

Zmiany widoczne w interfejsie weryfikuj w przeglądarce, nie tylko testami.
