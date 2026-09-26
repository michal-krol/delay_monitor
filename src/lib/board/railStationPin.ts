import type { MapPin } from '@/components/MapView'
import type { RealizationStatus } from './realization'
import { formatClockTime } from '@/lib/format'
import { BORDER_COLOR, NEUTRAL_PIN_COLOR } from '@/components/realizationColors'

export type RailStationDeparture = {
  plannedAt: string
  headsign: string | null
  delayMinutes: number | null
  status: RealizationStatus
}

/** Kontrakt `GET /api/rail-stations?city=` (`src/app/api/rail-stations/route.ts`). */
export type RailStationApiEntry = {
  id: string
  name: string
  lat: number
  lon: number
  coordSource: 'station' | 'osm-railway' | 'city-fallback'
  status: RealizationStatus | null
  nextDepartures: RailStationDeparture[] | null
  ageMs: number | null
}

export type RailStationPin = MapPin & {
  status: RealizationStatus | null
  coordSource: RailStationApiEntry['coordSource']
}

function formatDeparturePreview(departure: RailStationDeparture): string {
  const time = formatClockTime(departure.plannedAt)
  const delay = departure.delayMinutes !== null && departure.delayMinutes > 0 ? ` (+${departure.delayMinutes} min)` : ''
  // Ten sam fallback co BoardRowList.tsx dla nierozpoznanego kierunku ('—'),
  // nie pusty string — headsign bywa `null` (BoardRow.headsign), a puste pole
  // po strzałce wyglądałoby jak brakujące dane, nie jak świadomy fallback.
  return `${time} → ${departure.headsign ?? '—'}${delay}`
}

/**
 * Kolor markera na mapie wg statusu najbliższego odjazdu — ten sam kod barw co
 * `StationCard.tsx` (`BORDER_COLOR`, decyzja brainstormingu: mapa nie wymyśla
 * nowej skali). `status: null` (stacja nigdy nie oglądana) to inny stan niż
 * `RealizationStatus.unknown` — osobny, wyraźnie neutralny kolor.
 */
export function railMarkerBackground(pin: RailStationPin): string {
  return pin.status === null ? NEUTRAL_PIN_COLOR : BORDER_COLOR[pin.status]
}

/**
 * `/api/rail-stations` → `MapPin` rozszerzony o `status`/`coordSource` (do
 * koloru markera, `CityVehicleMap.tsx`). `preview` gotowy do wyświetlenia —
 * `MapView`/`CityVehicleMap` niczego nie liczą, tylko renderują (ten sam
 * kontrakt co `MapPin.preview` już wymaga).
 */
export function toRailStationPin(entry: RailStationApiEntry): RailStationPin {
  return {
    id: entry.id,
    lat: entry.lat,
    lon: entry.lon,
    label: entry.name,
    mode: 'rail',
    href: `/station/${entry.id}`,
    preview: entry.nextDepartures === null ? ['Brak danych — otwórz stację'] : entry.nextDepartures.map(formatDeparturePreview),
    status: entry.status,
    coordSource: entry.coordSource,
  }
}
