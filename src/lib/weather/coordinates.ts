import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { once } from '../cache'

export type StationCoordinatesEntry = {
  name: string
  lat: number | null
  lon: number | null
  /** `gtfs` = pozycja stacji z `polish_trains.zip` (`scripts/stations-from-gtfs.mjs`) — najdokładniejsze. */
  source: 'gtfs' | 'station' | 'city-fallback' | 'osm-railway' | 'failed'
  /** Ranga ruchu 1 (węzeł) – 3; tylko przy `source: 'gtfs'`. Mapa kraju pokazuje niskie tiery dopiero przy zbliżeniu. */
  tier?: 1 | 2 | 3
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

/** Stacja na ogólnopolskiej warstwie kolei mapy. */
export type MapRailStation = { id: string; name: string; lat: number; lon: number; tier: 1 | 2 | 3 }

/**
 * Stacje z PRAWDZIWĄ pozycją (bez `city-fallback` — centroid miejscowości
 * zlepiłby kilka stacji w jeden punkt — i bez `failed`). Liczone raz; plik jest
 * niezmienny przez życie procesu. Błąd wczytania rzuca, jak wyżej (#7).
 */
export const getMapRailStations = once(async (): Promise<MapRailStation[]> => {
  const all = await loadCoordinates()
  const stations: MapRailStation[] = []
  for (const [id, entry] of Object.entries(all)) {
    if (entry.lat === null || entry.lon === null || entry.source === 'city-fallback' || entry.source === 'failed') continue
    stations.push({ id, name: entry.name, lat: entry.lat, lon: entry.lon, tier: entry.tier ?? 3 })
  }
  return stations
})

/** Nazwa stacji z tego samego pliku — źródło nazw dla kart podglądu linków (zero zapytań do PKP, #3). `null` = nieznane ID. */
export async function getStationName(stationId: string): Promise<string | null> {
  const all = await loadCoordinates()
  return Object.hasOwn(all, stationId) ? all[stationId].name : null
}

/** ID wszystkich stacji słownika (mapa sitemap) — ten sam plik, zero zapytań do PKP (#3). Błąd wczytania rzuca, jak wyżej (#7). */
export async function getAllStationIds(): Promise<string[]> {
  return Object.keys(await loadCoordinates())
}
