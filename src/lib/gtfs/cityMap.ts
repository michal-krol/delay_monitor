/** Dane warstw mapy miasta: przystanki, środek zespołu, linie szynowe. Czysty, zero pola opóźnienia. */
import { MODE_ORDER, round5, shapeToPoints } from './lines'
import type { GtfsMode, GtfsSchedule } from './types'

/** Punkt przystanku na mapie miasta — przystanek albo (dla metra) cała stacja-rodzic. Bez pola opóźnienia (#13). */
export type CityStop = {
  id: string
  groupId: string
  name: string
  /** `stop_code` przystanku („01"); `null` dla stacji-rodzica i gdy feed nie podaje. */
  code: string | null
  lat: number
  lon: number
  /** Dominujący rodzaj obsługujących linii (kolejność `MODE_ORDER`: metro > tramwaj > autobus). */
  mode: Exclude<GtfsMode, 'rail'>
}

const cityStopsCache = new WeakMap<GtfsSchedule, CityStop[]>()

/**
 * Wszystkie przystanki miasta z pozycją — warstwa przystanków na mapie miasta.
 * Liczone RAZ na załadowany rozkład (skan wycinków CSR wszystkich przystanków),
 * potem z `WeakMap` — rozkład przeładowany = nowy obiekt = nowy wpis.
 *
 * - Przystanek z rodzicem (peron metra) zwija się do rodzica: jeden punkt na stację.
 * - Pomijane: brak kursów w oknie [wczoraj, dziś, jutro], pozycja (0,0) (schema
 *   daje `0` przy braku współrzędnych) i przystanki wyłącznie kolejowe — kolej to
 *   osobna warstwa stacji PKP.
 */
export function cityStops(schedule: GtfsSchedule): CityStop[] {
  const cached = cityStopsCache.get(schedule)
  if (cached !== undefined) return cached

  const n = schedule.stopIds.length
  const rank = new Map(MODE_ORDER.map((mode, index) => [mode, index]))
  // Najlepsza (najniższa) ranga trybu per punkt — przystanki dzieci zasilają rodzica.
  const bestRank = new Int8Array(n).fill(99)
  const hasChild = new Uint8Array(n)
  for (let s = 0; s < n; s += 1) {
    const target = schedule.stopParent[s] >= 0 ? schedule.stopParent[s] : s
    if (target !== s) hasChild[target] = 1
    for (let k = schedule.stopEventOffset[s]; k < schedule.stopEventOffset[s + 1]; k += 1) {
      const routeIdx = schedule.tripRoute[schedule.evTrip[schedule.stopEventOrder[k]]]
      if (routeIdx < 0) continue
      const r = rank.get(schedule.routes[routeIdx].mode) ?? 99
      if (r < bestRank[target]) bestRank[target] = r
    }
  }

  const stops: CityStop[] = []
  for (let s = 0; s < n; s += 1) {
    if (schedule.stopParent[s] >= 0) continue
    const mode = MODE_ORDER[bestRank[s]]
    if (mode === undefined || mode === 'rail') continue
    const lat = schedule.stopLat[s]
    const lon = schedule.stopLon[s]
    if (lat === 0 && lon === 0) continue
    const isParent = hasChild[s] === 1
    stops.push({
      id: schedule.stopIds[s],
      groupId: schedule.stopGroupIds[s],
      name: isParent ? (schedule.groupName.get(schedule.stopGroupIds[s]) ?? schedule.stopNames[s]) : schedule.stopNames[s],
      code: isParent ? null : (schedule.stopCodes[s] ?? schedule.stopPlatforms[s] ?? null),
      lat: round5(lat),
      lon: round5(lon),
      mode,
    })
  }
  cityStopsCache.set(schedule, stops)
  return stops
}

/** Środek zespołu (średnia przystanków z pozycją) — cel `flyTo` z wyszukiwarki. `null` gdy żaden przystanek nie ma pozycji. */
export function groupCentroid(schedule: GtfsSchedule, groupId: string): { lat: number; lon: number } | null {
  let lat = 0
  let lon = 0
  let count = 0
  for (const s of schedule.groupMembers.get(groupId) ?? []) {
    if (schedule.stopLat[s] === 0 && schedule.stopLon[s] === 0) continue
    lat += schedule.stopLat[s]
    lon += schedule.stopLon[s]
    count += 1
  }
  return count === 0 ? null : { lat: round5(lat / count), lon: round5(lon / count) }
}

/** Przebieg linii szynowej (metro / kolej miejska) jako tło orientacyjne mapy. */
export type BackboneLine = {
  routeId: string
  line: string
  mode: 'metro' | 'rail'
  points: [number, number][]
}

/**
 * Metro i kolej miejska — stałe tło mapy (widoczne od dalekiego zoomu, gdy
 * przystanki jeszcze się nie pokazują). Jeden kierunek na linię wystarcza (tory
 * te same); kształt `shapes.txt`, a bez niego łamana po przystankach. Z gotowego
 * indeksu `routePatterns` — bez skanu `stop_times`.
 */
export function backboneLines(schedule: GtfsSchedule): BackboneLine[] {
  const lines: BackboneLine[] = []
  schedule.routes.forEach((route, routeIdx) => {
    if (route.mode !== 'metro' && route.mode !== 'rail') return
    const pattern = schedule.routePatterns.get(`${routeIdx}:0`) ?? schedule.routePatterns.get(`${routeIdx}:1`)
    if (pattern === undefined) return
    const points =
      pattern.shape !== null && pattern.shape.length >= 4
        ? shapeToPoints(pattern.shape)
        : pattern.stops.map((s): [number, number] => [round5(schedule.stopLat[s]), round5(schedule.stopLon[s])])
    if (points.length < 2) return
    lines.push({ routeId: route.id, line: route.shortName || route.id, mode: route.mode, points })
  })
  return lines
}
