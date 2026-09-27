# 0002. Kryteria wydania 1.0.0

- Status: propozycja (2026-09-27) — do akceptacji przez właściciela

## Kontekst

Projekt od 0.9.0 (2026-08-02) jest oznaczony jako „beta" bez definicji wyjścia. Wersjonowanie
według SemVer 2.0.0 (`~/.claude/rules/versioning.md`): przed 1.0 zmiana łamiąca podbija MINOR,
od 1.0 — MAJOR, więc 1.0 to obietnica stabilności.

## Decyzja

1.0.0 wychodzi, gdy **wszystkie** poniższe są prawdziwe:

1. Stabilne publiczne URL-e widoków (`/station/…`, `/connection/…`, `/city/…`, `/lines/…`,
   `/map`) i kształt odpowiedzi `/api/*` używanych przez UI — zmiana = MAJOR.
2. Co najmniej 4 tygodnie produkcji bez incydentu widocznego dla użytkownika (pusta tablica,
   zły czas, fałszywe „na czas").
3. Monitoring działa: nocny kontrakt API i cron zdrowia produkcji zielone przez ten okres.
4. `main` chroniony (PR + wymagane `quality` i `e2e`), wydania tagowane i z GitHub Release.
5. „Znane ograniczenia" w README nie zawierają niczego, co przeczy danym na ekranie.

## Konsekwencje

- Do tego czasu wydania to 0.x (następne: 0.10.0), MINOR dla nowych funkcji.
- Po 1.0 zmiany URL-i i API wymagają ścieżki migracji albo MAJOR.

## Odrzucone alternatywy

- Wydać 1.0 od razu: brak okresu stabilności i monitoringu, obietnica bez pokrycia.
- Zostać w 0.x bez kryteriów: „beta" na zawsze, wersja nic nie komunikuje.
