'use client'

import { useId, useRef, useState } from 'react'
import { AlertCircleIcon, FilterIcon, ICON_SIZE } from '../icons'
import { LAYER_LABEL, LAYER_MODE, POINT_LAYERS, type LayerKey } from './mapData'
import { ModeChip } from './ModeChip'
import { useDismiss } from '@/hooks/useDismiss'

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
  compact = false,
}: {
  hidden: ReadonlySet<LayerKey>
  /** Rodzaje pojazdów obecne w danych miasta — nie pokazujemy przełącznika do pustej warstwy. */
  vehicleLayers: LayerKey[]
  onChange: (next: Set<LayerKey>) => void
  /** „Tylko linie z utrudnieniami" — pomijane, gdy brak `onAlertsOnly`. */
  alertsOnly?: boolean
  onAlertsOnly?: (next: boolean) => void
  /** Telefon: sama ikona (44×44), napis „Filtry” tylko dla czytnika; licznik zostaje. */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const restrictions = hidden.size + (alertsOnly ? 1 : 0)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useDismiss(open, rootRef, (byEscape) => {
    setOpen(false)
    if (byEscape) buttonRef.current?.focus()
  })

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
        <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10">
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
        onClick={() => setOpen((o) => !o)}
        className={`glass relative inline-flex h-full min-h-11 items-center rounded-xl text-sm font-semibold text-foreground transition hover:bg-black/5 dark:hover:bg-white/10 ${
          compact ? 'w-11 justify-center' : 'gap-2 px-3.5 py-2.5'
        }`}
      >
        <FilterIcon size={ICON_SIZE.button} />
        <span className={compact ? 'sr-only' : undefined}>Filtry</span>
        {restrictions > 0 && (
          <span
            className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs text-white ${compact ? 'absolute -right-1.5 -top-1.5' : ''}`}
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
          className="glass-strong absolute right-0 z-30 mt-2 max-h-[calc(100dvh-var(--bottom-nav-h)-15rem)] w-72 max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto overscroll-contain rounded-2xl p-4 shadow-xl"
        >
          {group('Punkty', POINT_LAYERS)}
          {vehicleLayers.length > 0 && group('Pojazdy', vehicleLayers)}
          {onAlertsOnly !== undefined && (
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10">
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
            className="w-full rounded-lg border border-surface-border px-3 py-1.5 text-sm font-medium text-text-secondary transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
          >
            Pokaż wszystko
          </button>
        </div>
      )}
    </div>
  )
}
