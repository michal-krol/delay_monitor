# 0002. Wydanie 1.0.0 i od tego momentu ścisły SemVer

- Status: przyjęte (2026-09-27, decyzja właściciela)

## Kontekst

Wersje 0.9.0–0.9.10 (sierpień–wrzesień 2026) numerowano niekonsekwentnie: nowe funkcje szły
jako PATCH, tag miała tylko `v0.9.10`, „beta" nie miała definicji wyjścia. Na `dev` czekało
~140 commitów (mapy, GTFS, przebudowa instrukcji), czyli materiał na co najmniej MINOR.

## Decyzja

Najbliższa promocja `dev` → `main` to **1.0.0**. Od niej obowiązuje SemVer 2.0.0 bez wyjątków
(`~/.claude/rules/versioning.md`): zmiana łamiąca → MAJOR, `feat` → MINOR, `fix`/`perf` →
PATCH; każda promocja = tag `vX.Y.Z` + GitHub Release; CHANGELOG w formacie Keep a Changelog.

Kontrakt stabilności 1.x (zmiana = MAJOR):
1. Publiczne URL-e widoków: `/station/…`, `/connection/…`, `/city/…`, `/lines/…`, `/map`.
2. Kształt odpowiedzi `/api/*` używanych przez UI (pola mogą dochodzić, nie znikać).
3. Semantyka danych: „nie wiadomo" nigdy jako `0` (#7), GTFS nigdy „na czas" (#13).

## Konsekwencje

- Numer wersji od teraz coś komunikuje; rollback = redeploy poprzedniego tagu.
- Świadome ryzyko: 1.0 wychodzi bez okresu stabilizacji (monitoring produkcji i nocny
  kontrakt API startują razem z tym wydaniem). Pierwsze tygodnie 1.x obserwujemy przez cron
  zdrowia; poprawki idą jako PATCH.
- Historyczne 0.9.x zostają w CHANGELOG bez dotagowania.

## Odrzucone alternatywy

- 0.10.0 i kryteria wejścia do 1.0 (4 tygodnie bez incydentu): bezpieczniejsze, ale
  odsuwa porządną numerację; właściciel wybrał start od razu.
- Zostać w 0.x bez kryteriów: wersja dalej nic by nie mówiła.
