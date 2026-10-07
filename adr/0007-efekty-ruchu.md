# 0007. Efekty ruchu: natywne przejścia widoku i szkło, dwie małe zależności

- Status: przyjęte (2026-10-07)
- Reguła: `.claude/rules/ui-motion.md`

## Kontekst

Aplikacja na telefonie była „sucha”: strony podmieniały się bez związku między kartą a tablicą, liczby
opóźnień przeskakiwały, wiersze pojawiały się i znikały bez śladu, a paski nawigacji były płaskie.
Roadmapa mobilna (PR6) chciała ruchu, który mówi coś o strukturze (do przodu, wstecz, to samo miejsce),
bez kosztu dla wydajności i dostępności (tanie telefony z Androidem, `prefers-reduced-motion`).

## Decyzja

Najpierw platforma, biblioteki tylko tam, gdzie platforma nie sięga:

- **Przejścia stron:** `<ViewTransition>` z Reacta (Next 16 obsługuje go bez konfiguracji) + typy przejść
  w `Link`/`router.push`. Do przodu = ślizg w lewo, wstecz = w prawo, zakładka paska = krzyżowy zanik,
  tytuł kafelka Pulpitu „przepływa” w nagłówek tablicy, Odjazdy↔Przyjazdy to krzyżowy zanik w obrębie strony.
  Nagłówek, dolny pasek i pasek boczny są kotwicami (stoją w miejscu).
- **Nagłówek telefonu przy przewijaniu:** nazwa aplikacji ustępuje nazwie tablicy przez CSS
  `animation-timeline: scroll()` (progressive enhancement). Zamiast zwijanego hero — bez zmian układu,
  więc test „pierwszy odjazd nad dolnym paskiem” zostaje nietknięty.
- **Szkło** tylko na pływającym chromie (`glass-chrome*`); karty treści prawie kryjące i bez
  `backdrop-filter`; `prefers-reduced-transparency` i `forced-colors` dają pełne tło.
- **Wejścia** menu, okna wyszukiwania i pastylki offline: `@starting-style`. Halo aktywnej zakładki,
  pulsująca kropka „świeże dane”, poświata opóźnionego wiersza, ugięcie karty: CSS.
- **Dwie zależności (MIT, wersje przypięte):** `@number-flow/react` 0.6.2 (toczące się cyfry opóźnienia
  i KPI) oraz `@formkit/auto-animate` 0.10.0 (wejście/przesunięcie wierszy). Każda za jednym
  opakowaniem (`AnimatedNumber`, `useRowAnimation`), które niesie `prefers-reduced-motion` i ładuje
  bibliotekę leniwie: pierwszy pomiar z importem statycznym pogorszył LCP strony przystanku o
  100–260 ms (Lighthouse 85 → 82), więc liczba jest do tego czasu zwykłym tekstem o tych samych
  wymiarach, a biblioteki dociągają się po pierwszym malowaniu.
- Pod `prefers-reduced-motion` żaden `ViewTransition` nie jest montowany (przeglądarka nie dostaje
  `startViewTransition`), a pulsy, `@starting-style`, ugięcia i animacja nagłówka nie istnieją.

## Dlaczego nie samo natywnie

- Toczenie cyfr (każda kolumna osobno, kierunek wg znaku zmiany) w CSS nie istnieje; ręczna wersja to
  kilkaset linii i pułapki dostępności.
- Animacja wejścia/przesunięcia wierszy przy zmianie listy wymaga FLIP (pomiar pozycji przed i po).
  View Transitions nie nadają się, bo odpytywanie co 30 s odpalałoby je na całej stronie.

## Konsekwencje

- Pomiar (`next build --webpack`, suma `.next/static/chunks/**/*.js`): przed 2 424 584 B
  (720 953 B gzip), po 2 460 105 B (732 810 B gzip): +35,5 kB surowo, +11,9 kB gzip, w tym obie
  biblioteki i cały kod PR6.
- Lighthouse mobile (3 przebiegi, mediana) i INP (Pixel 7, procesor 4× wolniej) nie są gorsze niż
  przed zmianą; liczby w opisie PR. Pomiar wykrył też, że wcześniej **żadne szkło nie renderowało się
  w Chromium**: ręcznie dopisany `-webkit-backdrop-filter` sprawiał, że build zostawiał wyłącznie
  wersję z prefiksem. Dziś `backdrop-filter` pisany jest bez prefiksu (pilnuje tego test), a promień
  rozmycia i brak rozmycia na arkuszu (94% krycia, rozmycie niewidoczne) dobrano pomiarem INP.
- Zagnieżdżony `ViewTransition` nie dostaje wejścia/wyjścia, gdy otacza go węzeł DOM, który sam się
  montuje: opakowanie siedzi na korzeniu `PageShell`. Duplikat `view-transition-name` przerywa całe
  przejście, więc nazwy dostają tylko kafelki Pulpitu i nagłówki tablic (nie wyniki wyszukiwania).
- Safari przed 26 nie ma `animation-timeline`, a część `view-transition-class` zachowuje się inaczej:
  w obu przypadkach efekt po prostu się nie pokazuje, treść jest pełna.
- Dwie nowe zależności do aktualizacji (Dependabot). `@number-flow/react` rejestruje element
  niestandardowy, którego jsdom nie ma — testy używają zastępnika w `vitest.setup.ts`.

## Odrzucone alternatywy

- `motion` / Framer Motion, `react-spring`, GSAP: duże (kilkadziesiąt kB), a przejścia stron robi
  platforma; własny stan animacji dublowałby Reacta.
- Własny FLIP dla wierszy i własne toczenie cyfr: więcej kodu do utrzymania niż dwie małe biblioteki.
- Zwijany, przyklejony hero: przesuwa układ, ryzykuje test pierwszego odjazdu i przesuwa `top` paska zakładek.
- Szkło także na kartach treści: nic nie widać na płaskim tle, kosztuje GPU na tanich telefonach i psuje kontrast.
- Morph wyniku wyszukiwania do nagłówka tablicy: wynik i kafelek Pulpitu tej samej stacji są na ekranie
  razem (zduplikowana nazwa przerywa przejście); wyszukiwarka dostaje sam ślizg do przodu.
