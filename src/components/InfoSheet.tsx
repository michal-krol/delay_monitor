import { useCallback, useState, type ReactNode } from 'react'
import { SM_UP, useMediaQuery } from '@/hooks/useMediaQuery'
import { BottomSheet } from './BottomSheet'
import { PanelFrame } from './map/PanelFrame'
import { InfoIcon, ICON_SIZE } from './icons'

/**
 * Pasek zakładek tablicy na telefonie: przyklejony pod nagłówkiem aplikacji, nieprzezroczysty (wiersze
 * jadą pod nim). Ujemne marginesy znoszą `max-sm:p-4` sekcji, w której leży — zmieniasz jedno, zmień drugie.
 */
export const STICKY_TABS_BAR =
  'max-sm:sticky max-sm:top-[var(--header-h)] max-sm:z-20 max-sm:-mx-4 max-sm:-mt-4 max-sm:rounded-t-2xl max-sm:bg-[var(--sheet-surface)] max-sm:px-4 max-sm:py-2'

/**
 * Gdzie stoi kontekst tablicy (kafelki, pogoda, mapa…): od `sm` w prawej kolumnie (`wide`), na telefonie
 * tylko w arkuszu „Info”. Jedno miejsce naraz — ukryta klasą kopia montowałaby drugą mapę MapLibre
 * i dublowała tekst (`ui-states.md`). W SSR „szeroko”; do hydracji kolumnę na telefonie chowa CSS.
 */
export function useBoardContext(): { wide: boolean; infoOpen: boolean; toggleInfo: () => void; closeInfo: () => void } {
  const wide = useMediaQuery(SM_UP, true)
  const [infoOpen, setInfoOpen] = useState(false)
  const toggleInfo = useCallback(() => setInfoOpen((open) => !open), [])
  const closeInfo = useCallback(() => setInfoOpen(false), [])
  return { wide, infoOpen: infoOpen && !wide, toggleInfo, closeInfo }
}

/** Przycisk „Info” w pasku zakładek tablicy — tylko telefon (od `sm` kontekst stoi w prawej kolumnie). */
export function InfoButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={open}
      className="press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-surface-border px-3 text-sm font-medium text-text-secondary transition hover:text-foreground sm:hidden"
    >
      <InfoIcon size={ICON_SIZE.button} />
      Info
    </button>
  )
}

/**
 * Arkusz „Info” tablicy stacji/przystanku na telefonie: kontekst z prawej kolumny (kafelki,
 * pogoda, wykres, mapa) w tych samych komponentach, nad tablicą zamiast pod nią.
 *
 * `BottomSheet` jest `absolute inset-0` w pozycjonowanym rodzicu; na mapie rodzicem jest obszar
 * mapy, tu strona się przewija, więc host jest `fixed` między nagłówkiem a dolnym paskiem
 * (`--header-h`/`--bottom-nav-h`), z `pointer-events-none` — przezroczysta część przepuszcza
 * przewijanie strony. Renderowany tylko na telefonie (`useBoardContext`); od `sm` treść stoi w kolumnie.
 * Semantyka okna, „×” i Escape należą do `PanelFrame` (reguła z `maps.md`).
 */
export function InfoSheet({ title, onClose, closeLabel = 'Zamknij informacje', children }: { title: string; onClose: () => void; closeLabel?: string; children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[var(--header-h)] bottom-[var(--bottom-nav-h)] z-40">
      <BottomSheet initialSnap="half">
        <PanelFrame title={title} closeLabel={closeLabel} onClose={onClose}>
          <div className="flex flex-col gap-4">{children}</div>
        </PanelFrame>
      </BottomSheet>
    </div>
  )
}
