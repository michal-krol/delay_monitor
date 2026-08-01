# Monitor opóźnień PKP

Aplikacja webowa pokazująca opóźnienia pociągów na wybranych stacjach w czasie
zbliżonym do rzeczywistego. Zapisujesz ulubione stacje, widzisz je razem na
dashboardzie i rozwijasz dowolną do pełnej tablicy stacyjnej.

Pełny projekt techniczny: [`docs/superpowers/specs/2026-08-01-pkp-opoznienia-design.md`](docs/superpowers/specs/2026-08-01-pkp-opoznienia-design.md).

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
