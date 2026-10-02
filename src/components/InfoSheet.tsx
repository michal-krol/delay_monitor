import type { ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { PanelFrame } from './map/PanelFrame'
import { InfoIcon, ICON_SIZE } from './icons'

/** Przycisk „Info” w pasku zakładek tablicy — tylko telefon (od `sm` kontekst stoi w prawej kolumnie). */
export function InfoButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={open}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-surface-border px-3 text-sm font-medium text-text-secondary transition hover:text-foreground sm:hidden"
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
 * przewijanie strony. Od `sm` ukryty: tam ta sama treść stoi w prawej kolumnie.
 * Semantyka okna, „×” i Escape należą do `PanelFrame` (reguła z `maps.md`).
 */
export function InfoSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[var(--header-h)] bottom-[var(--bottom-nav-h)] z-40 sm:hidden">
      <BottomSheet initialSnap="half">
        <PanelFrame title={title} closeLabel="Zamknij informacje" onClose={onClose}>
          <div className="flex flex-col gap-4">{children}</div>
        </PanelFrame>
      </BottomSheet>
    </div>
  )
}
