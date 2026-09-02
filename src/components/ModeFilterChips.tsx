'use client'

import { BusIcon, MetroIcon, TrainIcon, TramIcon } from './icons'

/** `rail` = stacje kolejowe PKP. „kolej strefowa" GTFS pokazuje się tylko przy `all`. */
export type SearchMode = 'all' | 'metro' | 'tram' | 'bus' | 'rail'

const CHIPS: { value: SearchMode; label: string; icon: typeof BusIcon | null }[] = [
  { value: 'all', label: 'Wszystko', icon: null },
  { value: 'metro', label: 'Metro', icon: MetroIcon },
  { value: 'tram', label: 'Tramwaj', icon: TramIcon },
  { value: 'bus', label: 'Autobus', icon: BusIcon },
  { value: 'rail', label: 'Kolej', icon: TrainIcon },
]

/** Filtr rodzaju nad wyszukiwarką — zmienia `mode` w query wyszukiwarki. */
export function ModeFilterChips({ value, onChange }: { value: SearchMode; onChange: (mode: SearchMode) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtr rodzaju">
      {CHIPS.map((chip) => {
        const active = chip.value === value
        const Icon = chip.icon
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(chip.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${
              active ? 'text-white' : 'text-text-secondary hover:text-foreground'
            }`}
            style={
              active
                ? { background: 'var(--accent-gradient)', borderColor: 'transparent' }
                : { borderColor: 'var(--surface-border)' }
            }
          >
            {Icon !== null && <Icon size={13} />}
            {chip.label}
          </button>
        )
      })}
    </div>
  )
}
