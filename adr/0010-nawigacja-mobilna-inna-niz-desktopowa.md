# 0010. Nawigacja mobilna ≠ desktopowa, nazwa „Start”

- Status: przyjęte (2026-10-10, decyzja właściciela)
- Reguła: `.claude/rules/ui-copy.md`, `.claude/rules/ui-icons.md`; wytyczne `docs/ui-mobile-first/00-start-here.md` (F0)

## Kontekst

Dolny pasek telefonu i pasek boczny desktopu czytały tę samą listę `NAV_ITEMS` (Pulpit, Odjazdy,
Linie, Mapa). Na telefonie szukanie to główne zadanie (znaleźć stację, przystanek lub linię), a
„Odjazdy” (`/city`) dublują Start i wyszukiwarkę; desktop zostaje narzędziem do monitorowania
wielu miejsc naraz. Strona główna nazywała się „Pulpit”, co na telefonie nic nie mówi.

## Decyzja

- Dwie listy: `MOBILE_NAV_ITEMS` (Start `/`, Mapa `/map`, Szukaj, Linie `/lines`) i `NAV_ITEMS`
  (desktop: Start, Odjazdy / Przyjazdy, Linie, Mapa). Aktywność: `mobileActiveItemFromPath()`
  osobno od `activeItemFromPath()`; stacja, połączenie, przystanek i ekrany `/city` wskazują
  Start, linia i jej rozkład — Linie.
- „Szukaj” jest akcją, nie ekranem: jedna `openSearch` w `AppChrome` obsługuje dolny pasek,
  pasek boczny i skróty klawiaturowe (Ctrl/Cmd+K, „/”). Do czasu trasy `/search` (PR 2) otwiera
  dialog także na telefonie; potem poniżej `sm` przechodzi na `/search`. Nagłówek telefonu nie
  ma drugiego przycisku „Szukaj”.
- „Pulpit” → „Start” wszędzie, gdzie widzi go użytkownik (nawigacja, H1, ścieżka, „Wróć do
  Startu”, „Przypnij do Startu”). Identyfikatory w kodzie i klucze `localStorage` bez zmian.

## Konsekwencje

- Dwa źródła pozycji menu: testy pilnują, że desktop zachowuje Odjazdy, a telefon ma cztery cele
  ≥ 44 × 44 px.
- Na telefonie „Odjazdy” osiągalne tylko przez Start/wyszukiwanie; adres `/city` działa dalej.
- Przejściowo (do PR 2) „Szukaj” w pasku to `<button>`, nie link — bez JS nic nie robi.

## Odrzucone

- Jedna lista z pozycją chowaną CSS-em: ukryta pozycja nadal w drzewie dostępności i w testach.
- „Szukaj” jako osobna strona od razu: trasa i wyszukiwarka to osobny PR (07 w pakiecie).
