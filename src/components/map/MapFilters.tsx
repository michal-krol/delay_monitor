'use client'

import { AlertCircleIcon, FilterIcon, ICON_SIZE } from '../icons'
import { LAYER_LABEL, LAYER_MODE, POINT_LAYERS, activeFilterCount, toggleLayer, type LayerKey } from './mapData'
import { ModeChip } from './ModeChip'
import { useDropdown } from '@/hooks/useDropdown'

/**
 * Przycisk „Filtry" + panel warstw (spec §7). Domyślnie wszystko widoczne, więc licznik na przycisku =
 * liczba aktywnych ograniczeń (ukryte warstwy, linia, „tylko z utrudnieniami" — `activeFilterCount`, ta
 * sama liczba co przy „Wyczyść filtry") — mówi „ile ograniczeń działa", a czipy pod paskiem „jakie".
 * Panel niemodalny: Escape i klik poza nim zamykają, fokus wraca na przycisk. „Pokaż wszystko" w panelu
 * resetuje tylko warstwy i „tylko z utrudnieniami"; pełny reset (z linią) to „Wyczyść filtry" w pasku.
 */
export function MapFilters({
  hidden,
  vehicleLayers,
  onChange,
  alertsOnly = false,
  onAlertsOnly,
  lineActive = false,
  className = '',
}: {
  hidden: ReadonlySet<LayerKey>
  /** Rodzaje pojazdów obecne w danych miasta — nie pokazujemy przełącznika do pustej warstwy. */
  vehicleLayers: LayerKey[]
  onChange: (next: Set<LayerKey>) => void
  /** „Tylko linie z utrudnieniami" — pomijane, gdy brak `onAlertsOnly`. */
  alertsOnly?: boolean
  onAlertsOnly?: (next: boolean) => void
  /** Wybrana linia (`?line=`) liczy się do ograniczeń, choć nie jest tu przełączana. */
  lineActive?: boolean
  /** Układ korzenia (np. `max-sm:flex-1` w rzędzie przycisków telefonu). */
  className?: string
}) {
  const { open, toggle: toggleOpen, rootRef, buttonRef, panelId } = useDropdown({ focusTriggerOnEscape: true })
  const restrictions = activeFilterCount({ hidden, line: lineActive, alertsOnly })
  const layerRestrictions = activeFilterCount({ hidden, line: false, alertsOnly })

  const group = (title: string, keys: LayerKey[]) => (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</legend>
      {keys.map((key) => (
        <label key={key} className="press flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm hover:bg-black/5 max-sm:min-h-11 dark:hover:bg-white/10">
          <input type="checkbox" checked={!hidden.has(key)} onChange={() => onChange(toggleLayer(hidden, key))} className="h-4 w-4 accent-primary" />
          <ModeChip mode={LAYER_MODE[key]} />
          {LAYER_LABEL[key]}
        </label>
      ))}
    </fieldset>
  )

  return (
    // Telefon: panel nie jest przypięty do przycisku (ten leży w środku rzędu), tylko rozciąga się na cały rząd przycisków (`relative` u rodzica).
    <div ref={rootRef} className={`relative max-sm:static ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggleOpen}
        className="glass-chrome border border-surface-border shadow-md control-44 relative inline-flex h-full items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-black/5 max-sm:w-full dark:hover:bg-white/10"
      >
        <FilterIcon size={ICON_SIZE.button} />
        <span>Filtry</span>
        {restrictions > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs text-primary-fg">
            {restrictions}
            <span className="sr-only"> aktywnych ograniczeń</span>
          </span>
        )}
      </button>
      {open && (
        // Strona mapy się nie przewija (PR3): panel przewija się sam, zamiast schodzić pod dolny pasek.
        // 15rem ≈ nagłówek + pasek tytułu + rzędy kontrolek nad panelem (najwyższy przypadek: telefon).
        <div
          id={panelId}
          className="glass-chrome-strong border border-surface-border enter-pop absolute right-0 z-30 mt-2 max-h-[calc(100dvh-var(--bottom-nav-h)-15rem)] w-72 max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto overscroll-contain rounded-2xl p-4 shadow-xl max-sm:inset-x-0 max-sm:right-auto max-sm:w-auto max-sm:max-w-none"
        >
          {group('Punkty', POINT_LAYERS)}
          {vehicleLayers.length > 0 && group('Pojazdy', vehicleLayers)}
          {onAlertsOnly !== undefined && (
            <label className="press flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm hover:bg-black/5 max-sm:min-h-11 dark:hover:bg-white/10">
              <input type="checkbox" checked={alertsOnly} onChange={() => onAlertsOnly(!alertsOnly)} className="h-4 w-4 accent-primary" />
              <AlertCircleIcon size={ICON_SIZE.button} className="shrink-0 text-warning-text" />
              Tylko linie z utrudnieniami
            </label>
          )}
          <button
            type="button"
            disabled={layerRestrictions === 0}
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
