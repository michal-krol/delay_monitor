'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircleIcon, FilterIcon } from '../icons'
import { LAYER_LABEL, LAYER_MODE, POINT_LAYERS, type LayerKey } from './mapData'
import { ModeChip } from './ModeChip'

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
  const [open, setOpen] = useState(false)
  const restrictions = hidden.size + (alertsOnly ? 1 : 0)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault() // zjadamy Escape — ramka panelu (PanelFrame) się wtedy nie zamyka
      setOpen(false)
      buttonRef.current?.focus()
    }
    const onPointer = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

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
        className="glass inline-flex h-full min-h-11 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-black/5 dark:hover:bg-white/10"
      >
        <FilterIcon size={16} />
        Filtry
        {restrictions > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs text-white" style={{ background: 'var(--accent-solid)' }}>
            {restrictions}
            <span className="sr-only"> aktywnych ograniczeń</span>
          </span>
        )}
      </button>
      {open && (
        <div id={panelId} className="glass-strong absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-3 rounded-2xl p-4 shadow-xl">
          {group('Punkty', POINT_LAYERS)}
          {vehicleLayers.length > 0 && group('Pojazdy', vehicleLayers)}
          {onAlertsOnly !== undefined && (
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10">
              <input type="checkbox" checked={alertsOnly} onChange={() => onAlertsOnly(!alertsOnly)} className="h-4 w-4 accent-indigo-600" />
              <AlertCircleIcon size={16} className="shrink-0 text-warning-text" />
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
