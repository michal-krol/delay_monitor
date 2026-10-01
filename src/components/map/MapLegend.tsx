import { useId } from 'react'
import { ChevronDownIcon, VehicleHeadingIcon, ICON_SIZE } from '../icons'
import { BUS_KIND_LABEL, BUS_KIND_ORDER, darkRingClass, lineColor } from '../transitMode'
import { MODE_COLOR, outlineFilter, strokeFor } from './mapData'
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
 * Domyślnie zwinięta (kompaktowa). Rozwinięta nie wyjdzie poza mapę: rodzic na mapie ma wysokość
 * (`top`…`bottom`), legenda `max-h-full` + własne przewijanie — inaczej na niskim telefonie jej
 * nagłówek (jedyne zwinięcie) chował się pod nagłówkiem strony. Rodzic zaczyna się pod kontrolkami
 * prawego rogu (zoom, „Pokaż całe miasto”), żeby rozwinięta legenda ich nie przykrywała.
 */
export function MapLegend() {
  return (
    <details className="glass-strong group pointer-events-auto max-h-full w-56 overflow-y-auto rounded-2xl text-sm shadow-lg">
      <summary className="flex min-h-11 cursor-pointer select-none list-none items-center justify-between rounded-2xl px-4 font-semibold [&::-webkit-details-marker]:hidden">
        Legenda <ChevronDownIcon size={ICON_SIZE.inline} className="text-text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <Section title="Punkty" items={POINTS} shape="dot" />
        <Section title="Pojazdy" items={VEHICLES} shape="vehicle" />
        <BusKinds />
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
                <span className="absolute -top-3 left-0 h-3 w-3" style={{ color: MODE_COLOR[mode], filter: outlineFilter(MODE_COLOR[mode]) }}>
                  <VehicleHeadingIcon className="block h-full w-full" />
                </span>
              </span>
            )}
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Pojazd autobusu ma kolor RODZAJU linii (`lineColor('bus', kind)`), nie jeden fiolet — objaśnienie
 * tymi samymi etykietami i próbkami co podsekcje strony „Linie” (`LineGrid`).
 */
function BusKinds() {
  const titleId = useId()
  return (
    <div>
      <p id={titleId} className="mb-1 text-xs text-text-muted">
        Autobusy według rodzaju linii
      </p>
      <ul aria-labelledby={titleId} className="space-y-0.5 text-xs text-text-secondary">
        {BUS_KIND_ORDER.map((kind) => (
          <li key={kind} className="flex items-center gap-2">
            <span className={`ml-1 h-2.5 w-2.5 flex-none rounded-[3px] ${darkRingClass(kind)}`} style={{ background: lineColor('bus', kind).bg }} aria-hidden="true" />
            {BUS_KIND_LABEL[kind]}
          </li>
        ))}
      </ul>
    </div>
  )
}
