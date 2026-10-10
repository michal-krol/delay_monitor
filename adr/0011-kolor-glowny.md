# 0011. Kolor główny: nasycony niebieski zamiast gradientu akcentu

- Status: przyjęte (2026-10-10, decyzja właściciela)
- Reguła: `src/app/globals.css` (tokeny `--primary*`), `.claude/rules/ui-motion.md`; makiety `docs/ui-mobile-first/references/`

## Kontekst

Aktywne zakładki, filtry i przyciski miały gradient `--accent-gradient` (cyjan → indygo) i
`--accent-solid`. Gradient nie unosi białego tekstu (biel na `#38bdf8` to 2,14:1), więc każdy
aktywny element potrzebował osobnego obejścia. Makiety nowych ekranów pokazują jeden nasycony
niebieski: aktywny segment, główny przycisk, aktywna pozycja nawigacji.

## Decyzja

- Cztery tokeny w obu motywach: `--primary` (wypełnienie), `--primary-fg` (tekst na nim),
  `--primary-soft` (tło aktywnego chipa i pastylki nawigacji), `--primary-text` (niebieski tekst
  na powierzchniach; w ciemnym motywie jaśniejszy niż wypełnienie).
- Wspólne klasy: `.segment`/`.segment-item`, `.chip-filter`, `.btn-primary`; aktywny stan to
  wypełnienie lub obrys, nie sam kolor (forced-colors ma jawny obrys).
- Kontrast jest liczony w `designTokens.test.ts` z wartości w CSS (tekst ≥ 4,5:1, wypełnienie
  względem tła ≥ 3:1); test nie sprawdza samej obecności heksa.
- `--accent-gradient` zostaje wyłącznie dla logo i ikon aplikacji; ekrany przechodzą na `--primary*`
  w swoich PR-ach (02–11).

## Konsekwencje

- Do czasu migracji ekranów aktywne stany bywają dwukolorowe (indygo na starych, niebieski w
  powłoce) — świadomy etap przejściowy.
- Kolory statusu (zieleń/pomarańcz/róż) i kategorii linii się nie zmieniają (#13).

## Odrzucone

- Zostawienie gradientu i dodanie koloru tylko dla nawigacji: dwa języki aktywności w jednej appce.
- Kolor z palety kategorii linii: barwa linii niesie rodzaj linii, nie stan interfejsu.
