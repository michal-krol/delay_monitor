'use client'

import { AlertCircleIcon, FilterIcon, ICON_SIZE } from '../icons'
import { LAYER_LABEL, LAYER_MODE, POINT_LAYERS, type LayerKey } from './mapData'
import { ModeChip } from './ModeChip'
import { useDropdown } from '@/hooks/useDropdown'

/**
 * Przycisk „Filtry" + panel warstw (spec §7). Domyślnie wszystko widoczne, więc
 * licznik na przycisku = liczba UKRYTYCH warstw — mówi „ile ograniczeń działa",
 * a chipy pod paskiem (rodzic) mówią „jakie". Panel niemodalny: Escape i klik
 * poza nim zamykają, fokus wraca na przycisk.
 */
export function MapFilters({
  hidden,
  vehicleLayers,
  onChange,
  alertsOnly = false,
  onAlertsOnly,
}: {
  hidden: ReadonlySet<LayerKey>
  /** Rodzaje pojazdów obecne w danych miasta — nie pokazujemy przełącznika do pustej warstwy. */
  vehicleLayers: LayerKey[]
  onChange: (next: Set<LayerKey>) => void
  /** „Tylko linie z utrudnieniami" — pomijane, gdy brak `onAlertsOnly`. */
  alertsOnly?: boolean
  onAlertsOnly?: (next: boolean) => void
}) {
  const { open, toggle: toggleOpen, rootRef, buttonRef, panelId } = useDropdown({ focusTriggerOnEscape: true })
  const restrictions = hidden.size + (alertsOnly ? 1 : 0)

  function toggle(key: LayerKey): void {
    const next = new Set(hidden)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(next)
  }

  const group = (title: string, keys: LayerKey[]) => (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</legend>
      {keys.map((key) => (
        <label key={key} className="press flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm hover:bg-black/5 max-sm:min-h-11 dark:hover:bg-white/10">
          <input type="checkbox" checked={!hidden.has(key)} onChange={() => toggle(key)} className="h-4 w-4 accent-indigo-600" />
          <ModeChip mode={LAYER_MODE[key]} />
          {LAYER_LABEL[key]}
        </label>
      ))}
    </fieldset>
  )

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggleOpen}
        // Telefon (poniżej `sm`): sama ikona 44×44, napis „Filtry” tylko dla czytnika, licznik w rogu.
        className="glass-chrome border border-surface-border shadow-md relative inline-flex h-full min-h-11 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-black/5 max-sm:w-11 max-sm:justify-center max-sm:px-0 dark:hover:bg-white/10"
      >
        <FilterIcon size={ICON_SIZE.button} />
        <span className="max-sm:sr-only">Filtry</span>
        {restrictions > 0 && (
          <span
            className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs text-white max-sm:absolute max-sm:-right-1.5 max-sm:-top-1.5"
            style={{ background: 'var(--accent-solid)' }}
          >
            {restrictions}
            <span className="sr-only"> aktywnych ograniczeń</span>
          </span>
        )}
      </button>
      {open && (
        // Strona mapy się nie przewija (PR3): panel przewija się sam, zamiast schodzić pod dolny pasek.
        // 15rem ≈ nagłówek + pasek tytułu + rząd kontrolek nad panelem (najwyższy przypadek: telefon).
        <div
          id={panelId}
          className="glass-chrome-strong border border-surface-border absolute right-0 z-30 mt-2 max-h-[calc(100dvh-var(--bottom-nav-h)-15rem)] w-72 max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto overscroll-contain rounded-2xl p-4 shadow-xl"
        >
          {group('Punkty', POINT_LAYERS)}
          {vehicleLayers.length > 0 && group('Pojazdy', vehicleLayers)}
          {onAlertsOnly !== undefined && (
            <label className="press flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm hover:bg-black/5 max-sm:min-h-11 dark:hover:bg-white/10">
              <input type="checkbox" checked={alertsOnly} onChange={() => onAlertsOnly(!alertsOnly)} className="h-4 w-4 accent-indigo-600" />
              <AlertCircleIcon size={ICON_SIZE.button} className="shrink-0 text-warning-text" />
              Tylko linie z utrudnieniami
            </label>
          )}
          <button
            type="button"
            disabled={restrictions === 0}
            onClick={() => {
              onChange(new Set())
              onAlertsOnly?.(false)
            }}
            className="press w-full rounded-lg border border-surface-border px-3 py-1.5 text-sm font-medium text-text-secondary transition hover:bg-black/5 disabled:opacity-50 max-sm:min-h-11 dark:hover:bg-white/10"
          >
            Pokaż wszystko
          </button>
        </div>
      )}
    </div>
  )
}
