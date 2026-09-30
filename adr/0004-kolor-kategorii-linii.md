# 0004. Kolor linii oznacza jej kategorię, nie kolor z feedu

- Status: przyjęte (2026-09-30)
- Niezmiennik: AGENTS.md #13

## Kontekst

Plakietki linii i mapa brały `route_color` z feedu GTFS. W Warszawie ten sam czerwony miały
tramwaje, autobusy przyspieszone i (prawie) M2, a granat lokalnych autobusów był bliski M1.
Jeden kolor znaczył więc kilka różnych rzeczy. Właściciel zdecydował, że kolor ma oznaczać
jedną kategorię w całej aplikacji.

## Decyzja

Jedna paleta `LINE_PALETTE` / `lineColor(mode, kind)` w `src/components/transitMode.tsx`.
Z niej korzystają `LineBadge`, mapa (piny, pojazdy, przebiegi, szkielet metra i kolei)
i `MODE_COLOR`. Autobusy mają kolory ZTM według rodzaju, tramwaj morski, metro żółte, kolej
jeden niebieski. `route_color` nadal jest walidowany, ale interfejs go nie czyta. Metro ma
własny piktogram („M” w kole), a nie oficjalne logo Metra Warszawskiego: logo ma status
PD-textlogo, ale może być chronionym znakiem towarowym.

## Konsekwencje

- M1/M2 i linie SKM nie mają już na mapie własnych barw.
- Żółte metro potrzebuje ciemnej obwódki na jasnej mapie (`strokeFor`, WCAG 1.4.11).
- Zieleń linii podmiejskich (#006800) i czerwień przyspieszonych (#b60000) są bliskie
  kolorom statusów („na czas” / „odwołany”); ryzyko przyjęte świadomie, bo konwencja ZTM
  ma pierwszeństwo, a plakietki niosą numer linii, nigdy status (#13).
- Nowe miasto z inną konwencją kolorów wymaga zmiany palety albo reguł rodzaju linii.

## Odrzucone alternatywy

- Kolory z feedu: te same kolory dla różnych kategorii.
- Metro i SKM w barwach feedu, reszta w palecie: kolory nadal by się powtarzały.
- Paleta tylko na ekranie „Linie”: tramwaj miałby w aplikacji dwa kolory.
