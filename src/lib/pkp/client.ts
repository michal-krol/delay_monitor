import type { RawRoute, RawTrainOperation, Station } from './types'
import { operationsResponseSchema, schedulesResponseSchema, stationSearchResponseSchema } from './schema'
import { normalizeForSearch } from '../search'
import { createTtlCache } from '../cache'

const BASE_URL = 'https://pdp-api.plk-sa.pl'
const REQUEST_TIMEOUT_MS = 8000
const STATION_LIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const SCHEDULES_CACHE_TTL_MS = 24 * 60 * 60 * 1000

// Klucz cache'u rozkładów to posortowany zestaw obserwowanych stacji, więc
// każda zmiana ulubionych tworzy nowy wpis. Limit trzyma to w ryzach.
const SCHEDULES_CACHE_MAX_ENTRIES = 64

/**
 * Pozostały budżet zapytań wg nagłówków API. `null` znaczy „nie wiadomo",
 * a nie „zero" — brak nagłówka nie może wyglądać jak wyczerpany limit.
 */
export type RateLimitBudget = {
  hourly: number | null
  daily: number | null
}

export type GetOperationsResult = {
  trains: RawTrainOperation[]
  stationNames: Record<string, string>
  budget: RateLimitBudget
}

export interface PkpClient {
  searchStations(query: string): Promise<Station[]>
  getOperations(stationIds: string[]): Promise<GetOperationsResult>
  getSchedules(stationIds: string[]): Promise<RawRoute[]>
}

export class PkpApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'PkpApiError'
    this.status = status
  }
}

async function fetchWithTimeout(url: string, apiKey: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      headers: { 'X-API-Key': apiKey },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

function parseRemaining(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function parseBudget(response: Response): RateLimitBudget {
  return {
    hourly: parseRemaining(response.headers.get('X-RateLimit-Hourly-Remaining')),
    daily: parseRemaining(response.headers.get('X-RateLimit-Daily-Remaining')),
  }
}

/** Stacja z nazwą znormalizowaną raz, przy budowaniu cache'u słownika. */
type IndexedStation = { station: Station; normalizedName: string }

export function createLiveClient(apiKey: string): PkpClient {
  let stationListCache: { stations: IndexedStation[]; expiresAt: number } | null = null
  const schedulesCache = createTtlCache<RawRoute[]>({
    ttlMs: SCHEDULES_CACHE_TTL_MS,
    maxEntries: SCHEDULES_CACHE_MAX_ENTRIES,
  })

  async function fetchAllStations(): Promise<IndexedStation[]> {
    if (stationListCache && stationListCache.expiresAt > Date.now()) {
      return stationListCache.stations
    }

    const url = `${BASE_URL}/api/v1/dictionaries/stations?pageSize=10000`
    const response = await fetchWithTimeout(url, apiKey)
    if (!response.ok) {
      throw new PkpApiError(`Pobranie listy stacji nie powiodło się: ${response.status}`, response.status)
    }
    const json = await response.json()
    const stations = stationSearchResponseSchema.parse(json).stations
      .filter((station) => station.name !== '')
      .map((station) => ({ station, normalizedName: normalizeForSearch(station.name) }))
    stationListCache = { stations, expiresAt: Date.now() + STATION_LIST_CACHE_TTL_MS }
    return stations
  }

  return {
    async searchStations(query: string): Promise<Station[]> {
      const stations = await fetchAllStations()
      const normalized = normalizeForSearch(query)
      if (normalized === '') return stations.map((entry) => entry.station)
      return stations
        .filter((entry) => entry.normalizedName.includes(normalized))
        .map((entry) => entry.station)
    },

    async getOperations(stationIds: string[]): Promise<GetOperationsResult> {
      const url = `${BASE_URL}/api/v1/operations?stations=${stationIds.join(',')}&withPlanned=true&fullRoutes=true`
      const response = await fetchWithTimeout(url, apiKey)
      if (!response.ok) {
        throw new PkpApiError(`Pobranie realizacji nie powiodło się: ${response.status}`, response.status)
      }
      const json = await response.json()
      const parsed = operationsResponseSchema.parse(json)
      return { trains: parsed.trains, stationNames: parsed.stations, budget: parseBudget(response) }
    },

    async getSchedules(stationIds: string[]): Promise<RawRoute[]> {
      const cacheKey = [...stationIds].sort().join(',')
      const cached = schedulesCache.get(cacheKey)
      if (cached !== undefined) {
        return cached
      }

      const url = `${BASE_URL}/api/v1/schedules?stations=${stationIds.join(',')}`
      const response = await fetchWithTimeout(url, apiKey)
      if (!response.ok) {
        throw new PkpApiError(`Pobranie rozkładu nie powiodło się: ${response.status}`, response.status)
      }
      const json = await response.json()
      const routes = schedulesResponseSchema.parse(json).routes
      schedulesCache.set(cacheKey, routes)
      return routes
    },
  }
}
