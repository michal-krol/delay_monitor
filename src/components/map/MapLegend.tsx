import { MODE_ICON } from '../transitMode'
import { MODE_COLOR } from './mapData'
import type { GtfsMode } from '@/lib/gtfs/types'

const POINTS: [GtfsMode, string][] = [
  ['rail', 'Stacja kolejowa'],
  ['metro', 'Stacja metra'],
  ['tram', 'Przystanek tramwajowy'],
  ['bus', 'Przystanek autobusowy'],
]
const VEHICLES: [GtfsMode, string][] = [
  ['bus', 'Autobus'],
  ['tram', 'Tramwaj'],
  ['rail', 'Pociąg'],
]

/**
 * Legenda RODZAJÓW obiektów (spec §8) — bez „na żywo" jako kategorii. Natywne
 * `<details>`: zwijanie i stan rozwinięcia dla czytników ekranu za darmo.
 * Domyślnie zwinięta (kompaktowa).
 */
export function MapLegend() {
  return (
    <details className="glass-strong group w-56 rounded-2xl text-sm shadow-lg">
      <summary className="flex min-h-11 cursor-pointer select-none list-none items-center justify-between rounded-2xl px-4 font-semibold [&::-webkit-details-marker]:hidden">
        Legenda <span className="text-text-muted group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <Section title="Punkty" items={POINTS} shape="dot" />
        <Section title="Pojazdy" items={VEHICLES} shape="icon" />
        <ul className="space-y-1 text-xs text-text-muted">
          <li>Linie metra i kolei miejskiej — w kolorze linii (M1, M2 jak na plakietkach).</li>
          <li>Strzałka przy pojeździe — kierunek jazdy.</li>
          <li>Wyblakły pojazd — pozycja sprzed ponad 1,5 min.</li>
          <li>Złota obwódka — Twoje ulubione.</li>
          <li>Prawy klik lub przytrzymanie — co jest w pobliżu.</li>
        </ul>
      </div>
    </details>
  )
}

function Section({ title, items, shape }: { title: string; items: [GtfsMode, string][]; shape: 'dot' | 'icon' }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      <ul className="space-y-1">
        {items.map(([mode, label]) => {
          const Icon = MODE_ICON[mode]
          return (
            <li key={label} className="flex items-center gap-2.5">
              {shape === 'dot' ? (
                <span className="ml-1 mr-1 h-3 w-3 rounded-full border-2 border-white" style={{ background: MODE_COLOR[mode] }} aria-hidden="true" />
              ) : (
                <span className="grid h-5 w-5 place-items-center rounded-md text-white" style={{ background: MODE_COLOR[mode] }} aria-hidden="true">
                  <Icon size={13} />
                </span>
              )}
              {label}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
