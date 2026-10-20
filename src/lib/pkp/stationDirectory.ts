import type { Station } from './types'
import { stationSearchResponseSchema } from './schema'
import { BASE_URL, type FetchJson } from './http'
import { normalizeForSearch } from '../search'

const STATION_LIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** Stacja z nazwą znormalizowaną raz, przy budowaniu cache'u słownika. */
export type IndexedStation = { station: Station; normalizedName: string }

export type StationDirectory = {
  /** Pełna lista (z cache'u 24 h albo jednego wspólnego pobrania). */
  all(): Promise<IndexedStation[]>
  search(query: string): Promise<Station[]>
  /** Wyłącznie z pamięci, nigdy nie wyzwala pobrania; `null` = słownik jeszcze niewczytany. */
  getCachedIds(): ReadonlySet<string> | null
}

export function createStationDirectory(fetchJson: FetchJson): StationDirectory {
  let stationListCache: { stations: IndexedStation[]; ids: ReadonlySet<string>; expiresAt: number } | null = null
  // Uchwyt na trwające pobranie: cache sprawdzamy przed `await`, a zapisujemy po nim, więc bez niego
  // równoległe żądania (zimny start, wygaśnięcie po dobie) odpalają każde własne pobranie z limitu.
  let stationListInFlight: Promise<IndexedStation[]> | null = null

  async function loadStationList(): Promise<IndexedStation[]> {
    const url = `${BASE_URL}/api/v1/dictionaries/stations?pageSize=10000`
    const { json } = await fetchJson(url, 'Pobranie listy stacji nie powiodło się')
    const stations = stationSearchResponseSchema.parse(json).stations
      .filter((station) => station.name !== '')
      .map((station) => ({ station, normalizedName: normalizeForSearch(station.name) }))
    stationListCache = {
      stations,
      ids: new Set(stations.map((entry) => entry.station.id)),
      expiresAt: Date.now() + STATION_LIST_CACHE_TTL_MS,
    }
    return stations
  }

  async function all(): Promise<IndexedStation[]> {
    const cached = stationListCache
    if (cached !== null && cached.expiresAt > Date.now()) {
      return cached.stations
    }

    if (stationListInFlight === null) {
      stationListInFlight = loadStationList().finally(() => {
        stationListInFlight = null
      })
    }
    return stationListInFlight
  }

  return {
    all,

    async search(query: string): Promise<Station[]> {
      const stations = await all()
      const normalized = normalizeForSearch(query)
      if (normalized === '') return stations.map((entry) => entry.station)
      return stations
        .filter((entry) => entry.normalizedName.includes(normalized))
        .map((entry) => entry.station)
    },

    getCachedIds(): ReadonlySet<string> | null {
      if (stationListCache === null || stationListCache.expiresAt <= Date.now()) return null
      return stationListCache.ids
    },
  }
}
