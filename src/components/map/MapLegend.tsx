import { ChevronRightIcon } from '../icons'
import { MODE_COLOR, strokeFor } from './mapData'
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
        Legenda <ChevronRightIcon size={14} className="rotate-90 text-text-muted group-open:-rotate-90" />
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <Section title="Punkty" items={POINTS} shape="dot" />
        <Section title="Pojazdy" items={VEHICLES} shape="vehicle" />
        <ul className="space-y-1 text-xs text-text-muted">
          <li>Linie metra i kolei miejskiej — w kolorze linii (M1, M2 jak na plakietkach).</li>
          <li>Strzałka przy pojeździe — kierunek jazdy.</li>
          <li>Wyblakły pojazd — pozycja sprzed ponad 1,5 min.</li>
          <li>Złota obwódka — przypięte do Pulpitu.</li>
          <li>Prawy klik lub przytrzymanie — co jest w pobliżu.</li>
        </ul>
      </div>
    </details>
  )
}

/**
 * Punkt = kropka; pojazd = to, co rysuje mapa (`vehicles` + `vehicles-arrows` w `TransitMap`,
 * `createMoverElement` w `MapView`): kółko w kolorze rodzaju ze strzałką kierunku przed nim.
 */
function Section({ title, items, shape }: { title: string; items: [GtfsMode, string][]; shape: 'dot' | 'vehicle' }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      <ul className="space-y-1">
        {items.map(([mode, label]) => (
          <li key={label} className="flex items-center gap-2.5">
            {shape === 'dot' ? (
              <span className="ml-1 mr-1 h-3 w-3 rounded-full border-2 border-white" style={{ background: MODE_COLOR[mode], borderColor: strokeFor(MODE_COLOR[mode]) }} aria-hidden="true" />
            ) : (
              <span className="relative ml-1 mr-1 mt-1.5 h-3 w-3" aria-hidden="true">
                <span className="block h-3 w-3 rounded-full border-2 border-white" style={{ background: MODE_COLOR[mode], borderColor: strokeFor(MODE_COLOR[mode]) }} />
                <span className="absolute -top-[8px] left-[2px] h-0 w-0 border-x-[4px] border-b-[6px] border-x-transparent" style={{ borderBottomColor: MODE_COLOR[mode] }} />
              </span>
            )}
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}
