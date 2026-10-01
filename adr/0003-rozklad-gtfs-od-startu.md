# 0003. Rozkład GTFS wczytywany przy starcie i trzymany w pamięci

- Status: przyjęte (2026-09-28)
- Niezmiennik: AGENTS.md #5, #13

## Kontekst

Rozkład miasta (~107 MB feedu, parsowanie rzędu kilkunastu sekund) ładował się leniwie, przy
pierwszym wejściu na widok komunikacji miejskiej, i był zwalniany po godzinie bez oglądających.
Pierwszy gość po wdrożeniu albo po nocy czekał na „Wczytuję…".

## Decyzja

Przy starcie procesu (`src/instrumentation.ts`, tylko środowisko Node.js) rozkład każdego
włączonego miasta zaczyna się wczytywać w tle, bez czekania na koniec. Rozkład zostaje
w pamięci na stałe i przeładowuje się raz na dobę. Pollery pozycji pojazdów i komunikatów
startują dopiero przy pierwszym oglądającym i zatrzymują się po czasie bezczynności
(`GTFS_IDLE_TTL_MS`). Rejestr pollerów leży w `globalThis`, bo hak startowy Next.js
i trasy API mają osobne kopie modułów.

## Konsekwencje

- Pamięć procesu ok. 0,5 GB RSS od startu, także bez ruchu — świadomie przyjęte.
- Każde wdrożenie pobiera pełny feed GTFS zaraz po starcie.
- `GTFS_IDLE_TTL_MS` nie zwalnia już rozkładu, tylko zatrzymuje pollery pozycji i komunikatów.

## Odrzucone alternatywy

- Leniwe ładowanie jak dotąd: długie oczekiwanie pierwszego gościa.
- Rozgrzewka ze zwalnianiem po czasie bezczynności: zysk znika godzinę po wdrożeniu.
- Rozgrzewka z ciągłym odpytywaniem pozycji pojazdów: ruch do zewnętrznych feedów bez widzów.
