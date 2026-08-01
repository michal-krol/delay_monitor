import type { RawTrainOperation, Station } from './types'
import { operationsResponseSchema, stationSearchResponseSchema } from './schema'

const BASE_URL = 'https://pdp-api.plk-sa.pl'
const REQUEST_TIMEOUT_MS = 8000

export type RateLimitBudget = {
  hourly: number
  daily: number
}

export type GetOperationsResult = {
  trains: RawTrainOperation[]
  stationNames: Record<string, string>
  budget: RateLimitBudget
}

export interface PkpClient {
  searchStations(query: string): Promise<Station[]>
  getOperations(stationIds: string[]): Promise<GetOperationsResult>
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

function parseBudget(response: Response): RateLimitBudget {
  const hourly = Number(response.headers.get('X-RateLimit-Hourly-Remaining') ?? '0')
  const daily = Number(response.headers.get('X-RateLimit-Daily-Remaining') ?? '0')
  return { hourly, daily }
}

export function createLiveClient(apiKey: string): PkpClient {
  return {
    async searchStations(query: string): Promise<Station[]> {
      const url = `${BASE_URL}/api/v1/dictionaries/stations?search=${encodeURIComponent(query)}`
      const response = await fetchWithTimeout(url, apiKey)
      if (!response.ok) {
        throw new PkpApiError(`Wyszukiwanie stacji nie powiodło się: ${response.status}`, response.status)
      }
      const json = await response.json()
      return stationSearchResponseSchema.parse(json).stations
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
  }
}
