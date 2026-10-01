# 0006. Jedno źródło ikon: Lucide przez `icons.tsx`

- Status: przyjęte (2026-10-01)
- Reguła: `.claude/rules/ui-icons.md`

## Kontekst

Ikony były rysowane ręcznie w `icons.tsx`, a kilka miejsc miało własne kopie ścieżek (mapa,
karta stacji, favicona). Jedno pojęcie miało kilka ikon (odjazd jako zegar albo strzałka,
przypięte jako pełna albo pusta gwiazdka), a jedna ikona kilka znaczeń (`ListIcon` dla
nawigacji „Odjazdy" i dla list). Rozmiary dla tej samej roli wahały się od 10 do 20 px.
Kolejne PR-y mobilnego refaktoru potrzebują nowych ikon (wyszukiwanie, pasek dolny, PWA).

## Decyzja

Jedynym źródłem jest pakiet `lucide` 1.49.0 (licencja ISC, wersja przypięta). Importuje go
wyłącznie `src/components/icons.tsx`, co pilnuje ESLint i test. Plik rysuje węzły Lucide
przez dotychczasowy kontrakt `base()` (`size`, `label`). Te same węzły trafiają do DOM mapy
(`iconElement()`) i do rastra strzałek pojazdów (`arrowImage()`). Favicona i ikony PWA
(32, 192, 512 oraz 180 dla iOS) powstają z `AppLogo` w trasach `app/icon.tsx` i
`app/apple-icon.tsx`. Rozmiary wynikają z roli (`ICON_SIZE`: 13, 14, 16, 18). Własne
rysunki zostają tylko trzy: „M" metra, logo aplikacji i logotypy przewoźników.

## Konsekwencje

- Pomiar (`next build --webpack`, suma `.next/static/chunks/*.js`): przed 2 379 704 B
  (704 164 B gzip), po 2 384 913 B (706 909 B gzip). Różnica to +5,2 kB surowo i +2,7 kB po
  kompresji, łącznie z nowymi ikonami i trasami favicony.
- Nowa zależność wymaga aktualizacji (Dependabot). Zmiana kształtu ikony w nowej wersji
  Lucide zmienia wygląd aplikacji bez zmiany naszego kodu.
- Strzałka kierunku pojazdu na mapie ma kształt Lucide `navigation-2` zamiast trójkąta.
- Lokalny build `standalone` w worktree zapisuje śledzone `node_modules` do
  `.claude/worktrees/node_modules`. Ten katalog przesłania `next` i psuje `next/og`
  (dotyczy tylko worktree; CI i produkcja budują w zwykłym katalogu).

## Odrzucone alternatywy

- `lucide-react`: nie eksportuje węzłów ikon, a mapa potrzebuje ich poza Reactem. Zostałby
  tylko głęboki import wewnętrznego `__iconData` bez typów.
- `lucide-react` razem z `lucide`: dwie zależności do trzymania w tej samej wersji i dwie
  ścieżki rysowania jednego zestawu.
- Dalsze rysowanie ręczne: każda nowa ikona to nowy rysunek, a spójności nikt nie pilnuje.
