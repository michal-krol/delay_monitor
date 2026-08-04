import type { RawRoute, RawTrainOperation, Station } from './types'
import { operationsResponseSchema, schedulesResponseSchema, stationSearchResponseSchema } from './schema'
import { normalizeForSearch } from '../search'
import { createTtlCache } from '../cache'
import { warsawDateString } from './time'

const BASE_URL = 'https://pdp-api.plk-sa.pl'
const REQUEST_TIMEOUT_MS = 8000
const STATION_LIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const SCHEDULES_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

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

export type GetSchedulesResult = {
  routes: RawRoute[]
  /** Kod przewoźnika → pełna nazwa, ze słownika dołączonego do tej samej odpowiedzi (za darmo, bez dodatkowego zapytania). */
  carrierNames: Record<string, string>
  /**
   * ID stacji → nazwa, ze słownika dołączonego do tej samej odpowiedzi.
   * `/operations` nie ma już własnego pełnego słownika (patrz `fullRoutes`
   * niżej) — ten zasila „Kierunek" (origin/destination trasy).
   */
  stationNames: Record<string, string>
}

export interface PkpClient {
  searchStations(query: string): Promise<Station[]>
  getOperations(stationIds: string[]): Promise<GetOperationsResult>
  getSchedules(stationIds: string[]): Promise<GetSchedulesResult>
  /**
   * Zbiór znanych ID stacji — **wyłącznie z pamięci**, nigdy nie wyzwala
   * pobrania. `null` znaczy „słownik nie jest jeszcze wczytany".
   *
   * Istnieje po to, żeby `/api/board` mógł odrzucić nieznane identyfikatory,
   * nie łamiąc zasady, że route handler nigdy nie czeka na PKP.
   */
  getCachedStationIds(): ReadonlySet<string> | null
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

/**
 * `fetchWithTimeout` + sprawdzenie statusu + parsowanie JSON-a — dokładnie ten
 * sam wzorzec powtarzał się w trzech miejscach (słownik stacji, rozkłady,
 * realizacja). Zwraca też surowy `response`, bo `getOperations` potrzebuje
 * z niego nagłówków budżetu po odczytaniu ciała.
 */
async function fetchJson(url: string, apiKey: string, errorMessage: string): Promise<{ json: unknown; response: Response }> {
  const response = await fetchWithTimeout(url, apiKey)
  if (!response.ok) {
    throw new PkpApiError(`${errorMessage}: ${response.status}`, response.status)
  }
  const json = await response.json()
  return { json, response }
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

/**
 * Identyfikatory stacji pochodzą z parametru URL `/api/board`, czyli spoza
 * aplikacji. Wklejone surowo do zapytania pozwalałyby dopisać własne parametry
 * do żądania kierowanego do PKP (`5100&pageSize=5000`) albo uciąć jego resztę
 * znakiem `#`.
 *
 * Kodujemy każdy identyfikator osobno, a przecinek separatora zostawiamy
 * dosłowny — dokładnie tak, jak wygląda działające dziś zapytanie. Kodowanie
 * całego łańcucha zamieniłoby przecinki na `%2C` i zmieniło kontrakt z API bez
 * potrzeby.
 */
function encodeStationIds(stationIds: string[]): string {
  return stationIds.map((id) => encodeURIComponent(id)).join(',')
}

/** Stacja z nazwą znormalizowaną raz, przy budowaniu cache'u słownika. */
type IndexedStation = { station: Station; normalizedName: string }

export function createLiveClient(apiKey: string, now: () => Date = () => new Date()): PkpClient {
  let stationListCache: { stations: IndexedStation[]; ids: ReadonlySet<string>; expiresAt: number } | null = null
  const schedulesCache = createTtlCache<GetSchedulesResult>({
    ttlMs: SCHEDULES_CACHE_TTL_MS,
    maxEntries: SCHEDULES_CACHE_MAX_ENTRIES,
  })

  /**
   * Uchwyty na trwające pobrania.
   *
   * Cache sprawdzamy przed `await`, a zapisujemy po nim — bez tych uchwytów
   * równoległe żądania (odświeżenie kilku kart naraz, zimny start, wygaśnięcie
   * cache'u po dobie) trafiają wszystkie w pustą pamięć i każde odpala własne
   * pobranie. Osiem równoległych zapytań to osiem pozycji z limitu zamiast
   * jednej. Kolejni chętni dołączają się do już trwającego pobrania.
   */
  let stationListInFlight: Promise<IndexedStation[]> | null = null
  const schedulesInFlight = new Map<string, Promise<GetSchedulesResult>>()

  async function fetchAllStations(): Promise<IndexedStation[]> {
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

  async function loadStationList(): Promise<IndexedStation[]> {
    const url = `${BASE_URL}/api/v1/dictionaries/stations?pageSize=10000`
    const { json } = await fetchJson(url, apiKey, 'Pobranie listy stacji nie powiodło się')
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

  /**
   * `/schedules` domyślnie zwraca tylko dzisiejsze kursy (`dateFrom`/`dateTo`
   * domyślnie = dziś). Pociąg odjeżdżający tuż po północy formalnie kursuje
   * "jutro" — bez jawnego okna dat taki pociąg nie miał dopasowanej trasy
   * (pusta nazwa, przewoźnik, peron/tor), mimo że `/operations` już go
   * pokazywał w widoku 2h naprzód. Jawne żądanie dziś+jutro (wg kalendarza
   * warszawskiego, nie strefy procesu — patrz `time.ts`) domyka tę lukę bez
   * dodatkowego zapytania: to wciąż jedno wywołanie `/schedules` na cykl.
   */
  function scheduleDateWindow(): { dateFrom: string; dateTo: string } {
    const instant = now()
    return {
      dateFrom: warsawDateString(instant),
      dateTo: warsawDateString(new Date(instant.getTime() + ONE_DAY_MS)),
    }
  }

  async function loadSchedules(stationIds: string[], cacheKey: string): Promise<GetSchedulesResult> {
    const { dateFrom, dateTo } = scheduleDateWindow()
    // fullRoute=true: /operations celowo NIE dokłada już pełnej trasy (patrz
    // getOperations niżej) — origin/destination do „Kierunku" idą stąd.
    // Koszt jednorazowy: /schedules jest cache'owane 24h, w przeciwieństwie do
    // /operations pobieranego co cykl pollera.
    const url = `${BASE_URL}/api/v1/schedules?stations=${encodeStationIds(stationIds)}&dateFrom=${dateFrom}&dateTo=${dateTo}&fullRoute=true`
    const { json } = await fetchJson(url, apiKey, 'Pobranie rozkładu nie powiodło się')
    const parsed = schedulesResponseSchema.parse(json)
    const result: GetSchedulesResult = { routes: parsed.routes, carrierNames: parsed.carrierNames, stationNames: parsed.stationNames }
    schedulesCache.set(cacheKey, result)
    return result
  }

  return {
    getCachedStationIds(): ReadonlySet<string> | null {
      if (stationListCache === null || stationListCache.expiresAt <= Date.now()) return null
      return stationListCache.ids
    },

    async searchStations(query: string): Promise<Station[]> {
      const stations = await fetchAllStations()
      const normalized = normalizeForSearch(query)
      if (normalized === '') return stations.map((entry) => entry.station)
      return stations
        .filter((entry) => entry.normalizedName.includes(normalized))
        .map((entry) => entry.station)
    },

    async getOperations(stationIds: string[]): Promise<GetOperationsResult> {
      // Świadomie BEZ fullRoutes=true: dokładałoby pełną trasę (śr. 15
      // przystanków) do KAŻDEGO pociągu, choć transformOperations używa tylko
      // jednego przystanku na zapytaną stację — 8.6 MB zamiast 680 KB na
      // żywym pomiarze (Warszawa Centralna), co cykl pollera (~90 s). Origin/
      // destination do „Kierunku" idą teraz z dopasowanej trasy /schedules
      // (fullRoute=true tam — patrz loadSchedules — ale cache 24h, nie co 90s).
      // Nie dopisuj tego z powrotem bez przeliczenia kosztu.
      const url = `${BASE_URL}/api/v1/operations?stations=${encodeStationIds(stationIds)}&withPlanned=true`
      const { json, response } = await fetchJson(url, apiKey, 'Pobranie realizacji nie powiodło się')
      const parsed = operationsResponseSchema.parse(json)
      return { trains: parsed.trains, stationNames: parsed.stations, budget: parseBudget(response) }
    },

    async getSchedules(stationIds: string[]): Promise<GetSchedulesResult> {
      const cacheKey = [...stationIds].sort().join(',')
      const cached = schedulesCache.get(cacheKey)
      if (cached !== undefined) {
        return cached
      }

      const pending = schedulesInFlight.get(cacheKey)
      if (pending !== undefined) {
        return pending
      }

      const request = loadSchedules(stationIds, cacheKey).finally(() => {
        schedulesInFlight.delete(cacheKey)
      })
      schedulesInFlight.set(cacheKey, request)
      return request
    },
  }
}
