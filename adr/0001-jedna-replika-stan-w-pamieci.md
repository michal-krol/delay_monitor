# 0001. Jedna replika, stan w pamięci procesu

- Status: przyjęte (2026-08, spisane 2026-09-27)
- Niezmiennik: AGENTS.md #5

## Kontekst

Klucz PKP Basic daje 100 zapytań/h i 1000/dobę. Poller zużywa ~40/h. Snapshoty tablic,
rejestr nazw stacji, rozkład GTFS (~107 MB) i cache'e żyją w pamięci procesu.

## Decyzja

Aplikacja działa jako **jedna replika** na Railway. Brak współdzielonego magazynu (Redis, baza).
Każdy cache w długo żyjącym procesie ma TTL i limit wpisów (`createTtlCache()`).

## Konsekwencje

- Dwie repliki = dwa pollery = podwójne zużycie limitu PKP. Skalowanie poziome wymaga
  najpierw współdzielonego pollera/cache'u i nowego ADR.
- Restart = zimny start: pusta pamięć, GTFS ładuje się od nowa. UI to znosi (#7: wiek danych,
  nie biały ekran).
- Brak kosztów i złożoności zewnętrznego magazynu.

## Odrzucone alternatywy

- Redis/baza na snapshoty: koszt i nowa zależność bez realnej potrzeby przy obecnym ruchu.
- Wiele replik z osobnymi kluczami PKP: łamie warunki klucza i komplikuje spójność danych.
