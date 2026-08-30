import { readFile } from 'node:fs/promises'
import path from 'node:path'

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
 * tym samym wzorcem `once()` co fixture'y w `pkp/mock.ts`: obietnica, nie
 * wartość, żeby równoległe pierwsze wywołania dzieliły jedno odczytanie
 * dysku zamiast się o nie ścigać.
 */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    pending ??= load()
    return pending
  }
}

const loadCoordinates = once(async (): Promise<Record<string, StationCoordinatesEntry>> => {
  const raw = await readFile(DATA_PATH, 'utf-8')
  return JSON.parse(raw) as Record<string, StationCoordinatesEntry>
})

/**
 * `null` = brak użytecznych współrzędnych -- nieznane `stationId` albo jedna
 * z kilku stacji, których skrypt wzbogacający nie zdołał zgeokodować. Nigdy
 * nie rzuca: to plik własny, nie dane z sieci, ale mimo to zawsze niepełny
 * (patrz komentarz w pliku danych).
 */
export async function getStationCoordinates(stationId: string): Promise<{ lat: number; lon: number } | null> {
  const all = await loadCoordinates()
  const entry = all[stationId]
  if (entry === undefined || entry.lat === null || entry.lon === null) return null
  return { lat: entry.lat, lon: entry.lon }
}
