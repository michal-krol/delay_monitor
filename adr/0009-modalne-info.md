# 0009. Modalny arkusz „Info” obok niemodalnego arkusza mapy

- Status: przyjęte (2026-10-09, decyzja właściciela)
- Reguła: `.claude/rules/maps.md` (#6), `.claude/rules/ui-states.md` (#7)

## Kontekst

Na telefonie kontekst tablicy (utrudnienia, statystyki, pogoda, mapa) był w `BottomSheet` — tym
samym niemodalnym arkuszu co na mapie transportu: przezroczysta część przepuszcza gesty, tło
przewija się dalej. Na mapie to konieczne (MapLibre pod arkuszem), na tablicy nie — brief UI/UX
§8 wymaga arkusza nad całą aplikacją, z blokadą tła, Escape i zwrotem fokusu.

## Decyzja

- „Info” tablic i arkusz pogody (`WeatherChip`) = `InfoSheet`: natywny `<dialog>` przez
  `showModal()` (tło `inert`, pułapka fokusu, `::backdrop`), od dołu, do 88% wysokości, nad
  dolnym paskiem, bez przeciągania. Zamykają „×”, Escape i tap w tło; przewijanie strony
  blokuje `body:has(dialog[open])`.
- Mapa transportu zostaje przy niemodalnym `BottomSheet` (gesty do mapy).
- Sekcje: utrudnienia → statystyki (zwinięte) → pogoda → mapa (zwinięta, montowana dopiero po
  rozwinięciu) → legenda; przystanek: linie → natężenie → mapa. Lista kierunków wypada
  z arkusza (filtr kierunku stoi nad tablicą).

## Konsekwencje

- Dwa wzorce arkusza w kodzie; reguła w `maps.md` mówi, który kiedy.
- Powiększona mapa portaluje się do otwartego dialogu (poza nim wszystko jest `inert`).
- iOS: blokada przewijania przez `overflow: hidden` bywa nieszczelna — do sprawdzenia na
  prawdziwym iPhonie (click-QA na staging).

## Odrzucone

- Modalny wariant `BottomSheet` (`aria-modal` + ręczne `inert`): dużo kodu, który `<dialog>`
  daje za darmo; brief zabrania `aria-modal` bez faktycznej blokady tła.
- Pełny ekran zamiast arkusza: traci kontekst tablicy pod spodem.
