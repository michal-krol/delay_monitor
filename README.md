# Monitor opóźnień PKP

Aplikacja webowa pokazująca opóźnienia pociągów na wybranych stacjach w czasie
zbliżonym do rzeczywistego. Zapisujesz ulubione stacje, widzisz je razem na
dashboardzie i rozwijasz dowolną do pełnej tablicy stacyjnej.

Pełny projekt techniczny: [`docs/superpowers/specs/2026-08-01-pkp-opoznienia-design.md`](docs/superpowers/specs/2026-08-01-pkp-opoznienia-design.md).

## Funkcjonalność

- **Dashboard ulubionych** — karty z nazwą stacji, 3 najbliższymi odjazdami,
  licznikiem opóźnionych pociągów i wiekiem danych. Ładuje się z pamięci
  serwera, nie z API PKP, więc jest natychmiastowy.
- **Wyszukiwarka stacji** — combobox z podpowiedziami (debounce 300 ms),
  pełna obsługa klawiatury (strzałki, Enter, Escape).
- **Pełna tablica stacyjna** — do 20 najbliższych pozycji w oknie 2 godzin,
  przełącznik odjazdy/przyjazdy, numer peronu, status i wielkość opóźnienia
  w minutach. Dodawanie/usuwanie z ulubionych jednym kliknięciem.
- **Status opóźnienia** — `onTime` / `delayed` / `cancelled` / `unknown`,
  zawsze opisany tekstem (np. „+12 min"), nigdy samym kolorem.
- **Tryb jasny/ciemny** — automatyczny wg preferencji systemowej, przez
  `next-themes`, bez mignięcia przy ładowaniu.
- **Ulubione stacje w `localStorage`** — przechowywane lokalnie w
  przeglądarce, przetrwają odświeżenie strony; brak kont użytkowników.
- **Tryb mock bez klucza API** — pełna funkcjonalność UI działa od razu po
  `npm install && npm run dev`, dane pochodzą z `fixtures/` z czasami
  przesuniętymi względem „teraz".
- **Odporność na błędy** — UI nigdy nie jest puste: przy awarii API (401,
  429, 5xx, timeout, błąd walidacji) pokazywane są ostatnie znane dobre
  dane wraz z ich wiekiem, a nie biały ekran. Baner ostrzegawczy pojawia
  się tylko przy błędzie konfiguracji (zły/brak klucza).
- **Dostępność** — tablica jako semantyczny `<table>` z `<caption>` i
  `scope` na nagłówkach, `aria-live="polite"` tylko na linijce statusu
  (nie na całej tablicy), widoczny focus, kontrast min. 4.5:1 w obu
  trybach.
- **Świadomość limitów API** — poller w tle pilnuje budżetu zapytań i sam
  spowalnia się, zanim limit zostanie przekroczony (patrz sekcja niżej).

## Struktura projektu

```
src/
├── app/
│   ├── api/{board,stations,health}/route.ts   endpointy HTTP
│   └── page.tsx                                strona główna
├── components/                                 UI (React)
├── hooks/                                       useFavourites, useBoard
└── lib/
    ├── config.ts                                walidacja zmiennych środowiskowych
    ├── pkp/{client,mock,schema,types}.ts         warstwa danych PKP (live/mock)
    └── board/{poller,transform,instance}.ts      logika domenowa (czyste funkcje + poller)
fixtures/          nagrane/ręcznie napisane odpowiedzi API do trybu mock
docs/superpowers/  projekt techniczny i plan implementacji
```

## Zdobycie klucza API

Zarejestruj się na stronie głównej PKP PLK „Otwarte Dane"
(`https://pdp-api.plk-sa.pl`) i poproś o poziom **Basic**
(100 zapytań/godzinę, 1000 zapytań/dobę — to wystarczy). Skopiuj klucz do
`PKP_API_KEY`.

## Uruchomienie lokalne (tryb mock, bez klucza)

```bash
npm install
npm run dev
```

Bez `PKP_API_KEY` i przy domyślnym `PKP_DATA_SOURCE=auto` aplikacja startuje
w trybie mock — dane pochodzą z `fixtures/` i mają czasy przesunięte tak, by
zawsze mieściły się w widocznym oknie. Cała funkcjonalność UI działa bez
klucza.

## Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PKP_API_KEY` | brak | Klucz API. Brak → tryb mock |
| `PKP_DATA_SOURCE` | `auto` | `auto` \| `live` \| `mock`. Jawny override |
| `POLL_INTERVAL_MS` | `90000` | Interwał pollera |
| `INTEREST_TTL_MS` | `300000` | Po tym czasie ciszy stacja przestaje być obserwowana |
| `PORT` | `3000` | Ustawiane przez Railway |

Skopiuj `.env.example` do `.env.local` i uzupełnij, żeby uruchomić w trybie
`live` lokalnie.

## Testy

```bash
npm run test
npm run typecheck
npm run lint
```

Testy nie wymagają sieci ani klucza API.

## Deployment (Railway)

Jeden projekt Railway, dwa środowiska: `main` → produkcja (`live`, prawdziwy
klucz), `dev` → staging (`mock`, zero zużycia limitu). Railway deployuje
automatycznie po pushu na podstawie `Dockerfile` (`output: 'standalone'`);
`railway.json` wskazuje `/api/health` jako healthcheck. GitHub Actions
(`.github/workflows/ci.yml`) pełni wyłącznie rolę bramki jakości na pull
requestach — `typecheck`, `lint`, `test`.

Uwaga kosztowa: dwa działające kontenery to podwójne zużycie kredytów
Railway. Warto trzymać `dev` wyłączone i włączać przed większym mergem.

## Limity API i działanie pollera

Basic pozwala na 100 zapytań/godzinę **oraz** 1000/dobę jednocześnie. Poller
(`src/lib/board/poller.ts`) odpytuje PKP co 90s dla wszystkich obserwowanych
stacji w jednym zapytaniu, usypia po 5 minutach ciszy, budzi się natychmiast
na pierwsze żądanie, i spowalnia do 5 minut, gdy `X-RateLimit-Daily-Remaining`
spadnie poniżej 50. Przeglądarka odpytuje własny serwer (`/api/board`) co 30s
niezależnie od tego rytmu — serwowanie z pamięci nic nie kosztuje.
