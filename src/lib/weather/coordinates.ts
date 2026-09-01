import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { once } from '../cache'

export type StationCoordinatesEntry = {
  name: string
  lat: number | null
  lon: number | null
  source: 'station' | 'city-fallback' | 'failed'
}

const DATA_PATH = path.join(process.cwd(), 'data', 'station-coordinates.json')

/**
 * Plik jest generowany raz, offline (`scripts/enrich-station-coords.mjs`) i
 * niezmienny przez cały czas życia procesu -- parsujemy go raz, leniwie,
 * tym samym `once()` co fixture'y w `pkp/mock.ts`.
 */
const loadCoordinates = once(async (): Promise<Record<string, StationCoordinatesEntry>> => {
  const raw = await readFile(DATA_PATH, 'utf-8')
  return JSON.parse(raw) as Record<string, StationCoordinatesEntry>
})

/**
 * `null` = brak użytecznych współrzędnych DLA TEJ STACJI -- nieznane
 * `stationId` albo jedna z kilku stacji, których skrypt wzbogacający nie
 * zdołał zgeokodować (`source: 'failed'`, `lat/lon: null`).
 *
 * Awaria samego wczytania pliku (brak, uszkodzony JSON) **rzuca** i celowo nie
 * jest tu tłumaczona na `null`: to dwie różne rzeczy i mają się różnie
 * pokazać użytkownikowi (AGENTS.md #7). `/api/weather` łapie wyjątek, oddaje
 * 500 i -- co ważne -- nie zapisuje go do cache'u, więc kolejne żądanie
 * spróbuje ponownie; UI pisze wtedy „Nie udało się pobrać pogody" zamiast
 * mylącego „Brak danych lokalizacyjnych dla tej stacji".
 */
export async function getStationCoordinates(stationId: string): Promise<{ lat: number; lon: number } | null> {
  const all = await loadCoordinates()
  const entry = all[stationId]
  if (entry === undefined || entry.lat === null || entry.lon === null) return null
  return { lat: entry.lat, lon: entry.lon }
}
