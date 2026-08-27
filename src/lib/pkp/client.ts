import type { RawDisruption, RawRoute, RawTrainOperation, Station } from './types'
import {
  carriersResponseSchema,
  commercialCategoriesResponseSchema,
  dailyRoutesResponseSchema,
  disruptionsCountResponseSchema,
  disruptionsResponseSchema,
  operationsResponseSchema,
  operationsStatisticsResponseSchema,
  rawRouteSchema,
  rawTrainOperationSchema,
  schedulesResponseSchema,
  stationSearchResponseSchema,
} from './schema'
import { normalizeForSearch } from '../search'
import { createTtlCache } from '../cache'
import { warsawDateString } from './time'

const BASE_URL = 'https://pdp-api.plk-sa.pl'
const REQUEST_TIMEOUT_MS = 8000
const STATION_LIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const SCHEDULES_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000
/**
 * W przeciwieństwie do /schedules (24h — trasa/przewoźnik się nie zmieniają),
 * utrudnienia zmieniają się w czasie. Zmierzone empirycznie na żywym API
 * (2026-08-26): 36/36 dzisiejszych disruptionId istniało już wczoraj, tylko
 * 2/38 zniknęło — dane żyją w skali dni, nie minut. 15 min to nadwyżka
 * ostrożności (łapie nagłe zdarzenia w ciągu dnia), nie wymóg zmienności.
 */
const DISRUPTIONS_CACHE_TTL_MS = 15 * 60 * 1000
// Klucz dzieli przestrzeń ze stacjami pollera (rzadkie zestawy) i z /api/train
// (per-pociąg zestawy stacji) -- szerszy niż SCHEDULES (64) na tę drugą oś.
const DISRUPTIONS_CACHE_MAX_ENTRIES = 200
/** Przewoźnicy/kategorie zmieniają się rzadko (patrz `validFrom`/`validTo` w odpowiedzi przewoźników) -- ta sama długość co słownik stacji. */
const NAME_DICTIONARIES_CACHE_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Odstęp z jitterem przed jedynym ponowieniem po 5xx -- natychmiastowe
 * ponowienie najczęściej trafia w tę samą awarię po stronie API i zjada drugie
 * zapytanie z limitu na nic. Świadomie w `fetchJsonWithRetry` (niżej), nie w
 * pojedynczym call-site jak wcześniej w `poller.ts` -- każde wywołanie PKP
 * (słownik stacji, rozkłady, realizacja, szczegóły przejazdu) ma dostawać tę
 * samą odporność, nie tylko to, które akurat ktoś owinął ręcznie.
 */
const RETRY_BASE_DELAY_MS = 500
const RETRY_JITTER_MS = 1000

// Klucz cache'u rozkładów to posortowany zestaw obserwowanych stacji, więc
// każda zmiana ulubionych tworzy nowy wpis. Limit trzyma to w ryzach.
const SCHEDULES_CACHE_MAX_ENTRIES = 64

/**
 * Pozostały budżet zapytań wg nagłówków API. `null` znaczy „nie wiadomo",
 * a nie „zero" — brak nagłówka nie może wyglądać jak wyczerpany limit.
 */
export type RateLimitBudget = {
  /** Ile zapytań zostało w oknie godzinowym. `null` = nie wiadomo (brak nagłówka), NIGDY „zero" — patrz AGENTS.md #3. */
  hourly: number | null
  daily: number | null
  /**
   * Sufity przypisane do klucza. Też z nagłówków (zweryfikowane na żywym API:
   * `X-RateLimit-Hourly-Limit: 100`, `X-RateLimit-Daily-Limit: 1000`), więc
   * nigdzie nie musimy ich wpisywać na sztywno ani zgadywać poziomu klucza.
   * `null` znaczy „nie wiadomo" dokładnie tak samo jak wyżej.
   */
  hourlyLimit: number | null
  dailyLimit: number | null
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
  /** Kod kategorii handlowej → pełna nazwa (bez rozbicia per przewoźnik — patrz komentarz w `schema.ts`), też za darmo z tej samej odpowiedzi. */
  categoryNames: Record<string, string>
  /**
   * ID stacji → nazwa, ze słownika dołączonego do tej samej odpowiedzi.
   * `/operations` nie ma już własnego pełnego słownika (patrz `fullRoutes`
   * niżej) — ten zasila „Kierunek" (origin/destination trasy).
   */
  stationNames: Record<string, string>
}

/** Zagregowane liczniki statusów pociągów w całym kraju na dany dzień — patrz `getOperationsStatistics()`. */
export type OperationsStatistics = {
  generatedAt: string
  totalTrains: number
  notStarted: number
  inProgress: number
  completed: number
  cancelled: number
  partialCancelled: number
}

export type NameDictionaries = {
  /** Kod przewoźnika -> pełna nazwa. */
  carrierNames: Record<string, string>
  /** Klucz `carrierCode|code` -> pełna nazwa kategorii handlowej (patrz `commercialCategoriesResponseSchema`). */
  categoryNames: Record<string, string>
}

export type GetDisruptionsResult = {
  disruptions: RawDisruption[]
  /** Kod utrudnienia -> tekst, dołączony w tej samej odpowiedzi (dictionaries=true) bez dodatkowego zapytania. */
  disruptionTypes: Record<string, string>
}

export type TrainDetailResult = {
  /** Realizacja: pełna lista przystanków z planowymi/faktycznymi czasami. */
  operation: RawTrainOperation
  /**
   * Trasa rozkładowa: peron/tor/kategoria per przystanek. `null`, gdy nie ma
   * dopasowanej trasy (patrz „Znane ograniczenia" w README — dotyczy mniejszości
   * pociągów) — realizacja i tak zostaje pokazana, tylko bez peronu/toru.
   */
  route: RawRoute | null
  /**
   * ID stacji → nazwa, dla każdego przystanku z `operation.stations`. Ani
   * `/operations/train/...`, ani `/schedules/route/...` nie niosą nazw stacji
   * (tylko ID) — źródłem jest pełny słownik stacji (ten sam co `searchStations`
   * w live, fixture `operations.json` w mock), nie wynik samego zapytania.
   */
  stationNames: Record<string, string>
}

export interface PkpClient {
  searchStations(query: string): Promise<Station[]>
  getOperations(stationIds: string[]): Promise<GetOperationsResult>
  getSchedules(stationIds: string[]): Promise<GetSchedulesResult>
  /**
   * Szczegóły jednego przejazdu — wywoływane dopiero po kliknięciu w wiersz
   * na tablicy, nigdy z pollera. `scheduleId`/`orderId`/`operatingDate` muszą
   * pochodzić z już zwalidowanego `BoardRow` (patrz `/api/train`), nie wprost
   * od klienta.
   */
  getTrainDetail(scheduleId: string, orderId: string, operatingDate: string): Promise<TrainDetailResult>
  /**
   * Pełne nazwy przewoźników i kategorii handlowych, dla panelu szczegółów
   * połączenia (`/api/train`) -- w przeciwieństwie do `getSchedules()` ten
   * endpoint nie dostaje ich "za darmo" przy okazji innego zapytania.
   * `/dictionaries/carriers` i `/dictionaries/commercial-categories` są
   * publiczne (bez klucza) -- zweryfikowane na żywo (patrz
   * `docs/pkp-api-slowniki-statusy.md` #1), więc to nie kosztuje budżetu
   * klucza Basic. Cache'owane długo, bo dane zmieniają się rzadko.
   */
  getNameDictionaries(): Promise<NameDictionaries>
  /**
   * Zbiór znanych ID stacji — **wyłącznie z pamięci**, nigdy nie wyzwala
   * pobrania. `null` znaczy „słownik nie jest jeszcze wczytany".
   *
   * Istnieje po to, żeby `/api/board` mógł odrzucić nieznane identyfikatory,
   * nie łamiąc zasady, że route handler nigdy nie czeka na PKP.
   */
  getCachedStationIds(): ReadonlySet<string> | null
  /**
   * Zagregowane liczniki statusów pociągów w całym kraju, bez filtra po
   * stacji — API nie oferuje takiego filtra dla tego endpointu (patrz
   * README, sekcja o widżecie "stan sieci"). Wywołujący (patrz
   * `board/networkStats.ts`) cache'uje wynik po swojej stronie — ta metoda
   * jest surowym fetcherem, jak `getOperations()`.
   */
  getOperationsStatistics(date: string): Promise<OperationsStatistics>
  /**
   * Liczba pociągów danego dnia w całym kraju, pogrupowana po kodzie
   * przewoźnika — z `/schedules/routes/{date}` (lekki, bez przystanków,
   * bez filtra stacji). Skład rozkładu na dany dzień, nie stan realizacji.
   */
  getDailyCarrierCounts(date: string): Promise<Record<string, number>>
  /** Liczba zgłoszonych utrudnień w całym kraju w danym oknie dat — tylko licznik, nie treść (patrz `disruptionsCountResponseSchema`). */
  getDisruptionCount(dateFrom: string, dateTo: string): Promise<number>
  /**
   * Pełna treść utrudnień dla podanych stacji — w przeciwieństwie do
   * `getDisruptionCount()` (tylko licznik, bez filtra stacji). `dateFrom`/
   * `dateTo` domyślnie = to samo okno co `/schedules` (dziś+jutro wg
   * kalendarza warszawskiego); `/api/train` przekazuje jawnie samo
   * `operatingDate` tego jednego przejazdu. Cache 15 min, osobny od
   * `getSchedules()` — patrz `DISRUPTIONS_CACHE_TTL_MS`.
   */
  getDisruptions(stationIds: string[], dateFrom?: string, dateTo?: string): Promise<GetDisruptionsResult>
}

export class PkpApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'PkpApiError'
    this.status = status
  }
}

/**
 * `apiKey: null` pomija nagłówek `X-API-Key` -- używane przez
 * `getNameDictionaries()`: te dwa endpointy są publiczne, a wysłanie klucza
 * mimo to (zweryfikowane na żywo) przełącza żądanie z darmowej, anonimowej
 * puli limitów na tę samą pulę 100/h co `/operations` -- dokładnie ten koszt,
 * którego to wywołanie ma unikać.
 */
async function fetchWithTimeout(url: string, apiKey: string | null): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      headers: apiKey === null ? {} : { 'X-API-Key': apiKey },
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
async function fetchJson(url: string, apiKey: string | null, errorMessage: string): Promise<{ json: unknown; response: Response }> {
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
    hourlyLimit: parseRemaining(response.headers.get('X-RateLimit-Hourly-Limit')),
    dailyLimit: parseRemaining(response.headers.get('X-RateLimit-Daily-Limit')),
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

export function createLiveClient(
  apiKey: string,
  now: () => Date = () => new Date(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => number = Math.random
): PkpClient {
  let stationListCache: { stations: IndexedStation[]; ids: ReadonlySet<string>; expiresAt: number } | null = null
  const schedulesCache = createTtlCache<GetSchedulesResult>({
    ttlMs: SCHEDULES_CACHE_TTL_MS,
    maxEntries: SCHEDULES_CACHE_MAX_ENTRIES,
  })
  const disruptionsCache = createTtlCache<GetDisruptionsResult>({
    ttlMs: DISRUPTIONS_CACHE_TTL_MS,
    maxEntries: DISRUPTIONS_CACHE_MAX_ENTRIES,
  })
  // Ten sam wzorzec co stationListCache/stationListInFlight -- jeden blob,
  // nie klucz-po-kluczu, więc zwykły TtlCache (klucz -> wartość) tu nie pasuje.
  let nameDictionariesCache: { value: NameDictionaries; expiresAt: number } | null = null
  let nameDictionariesInFlight: Promise<NameDictionaries> | null = null

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
  const disruptionsInFlight = new Map<string, Promise<GetDisruptionsResult>>()

  /**
   * Zaobserwowane na żywo (staging): PKP bywa chwilowo wolne i przekracza
   * `REQUEST_TIMEOUT_MS` (`fetchWithTimeout` przerywa żądanie przez
   * `AbortController`) -- to samo przejściowe zjawisko co 5xx, ale bez tego
   * warunku w ogóle nie było ponawiane. Rozpoznanie po `name`, nie po
   * `instanceof DOMException` -- Node/undici i przeglądarka zgadzają się co
   * do `name: 'AbortError'`, ale globalny `DOMException` bywał niedostępny
   * w starszych środowiskach Node, więc sprawdzanie `instanceof` jest tu
   * niepotrzebnym dodatkowym ryzykiem.
   */
  function isAbortError(err: unknown): boolean {
    return err instanceof Error && err.name === 'AbortError'
  }

  /**
   * `fetchJson` + jedno ponowienie na 5xx lub na timeout (AbortError), z
   * odstępem i jitterem. Wcześniej to ponowienie żyło tylko wokół
   * `getOperations` w `poller.ts` -- `/schedules` miał inną (catch-i-degraduj),
   * a `getTrainDetail` (patrz `/api/train`) nie miał żadnej. Jeden wspólny
   * wrapper na poziomie `fetchJson` daje tę samą odporność każdemu zapytaniu
   * do PKP, nie tylko temu, które akurat ktoś owinął ręcznie.
   */
  async function fetchJsonWithRetry(url: string, key: string | null, errorMessage: string): Promise<{ json: unknown; response: Response }> {
    try {
      return await fetchJson(url, key, errorMessage)
    } catch (err) {
      if ((err instanceof PkpApiError && err.status >= 500) || isAbortError(err)) {
        await sleep(RETRY_BASE_DELAY_MS + random() * RETRY_JITTER_MS)
        return fetchJson(url, key, errorMessage)
      }
      throw err
    }
  }

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
    const { json } = await fetchJsonWithRetry(url, apiKey, 'Pobranie listy stacji nie powiodło się')
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

  async function loadNameDictionaries(): Promise<NameDictionaries> {
    const [carriers, categories] = await Promise.all([
      fetchJsonWithRetry(`${BASE_URL}/api/v1/dictionaries/carriers`, null, 'Pobranie słownika przewoźników nie powiodło się'),
      fetchJsonWithRetry(
        `${BASE_URL}/api/v1/dictionaries/commercial-categories`,
        null,
        'Pobranie słownika kategorii handlowych nie powiodło się'
      ),
    ])
    const value: NameDictionaries = {
      carrierNames: carriersResponseSchema.parse(carriers.json).carrierNames,
      categoryNames: commercialCategoriesResponseSchema.parse(categories.json).categoryNames,
    }
    nameDictionariesCache = { value, expiresAt: Date.now() + NAME_DICTIONARIES_CACHE_TTL_MS }
    return value
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
    const { json } = await fetchJsonWithRetry(url, apiKey, 'Pobranie rozkładu nie powiodło się')
    const parsed = schedulesResponseSchema.parse(json)
    const result: GetSchedulesResult = {
      routes: parsed.routes,
      carrierNames: parsed.carrierNames,
      categoryNames: parsed.categoryNames,
      stationNames: parsed.stationNames,
    }
    schedulesCache.set(cacheKey, result)
    return result
  }

  async function loadDisruptions(stationIds: string[], dateFrom: string, dateTo: string, cacheKey: string): Promise<GetDisruptionsResult> {
    const url = `${BASE_URL}/api/v1/disruptions?stations=${encodeStationIds(stationIds)}&dateFrom=${dateFrom}&dateTo=${dateTo}&dictionaries=true`
    const { json } = await fetchJsonWithRetry(url, apiKey, 'Pobranie utrudnień nie powiodło się')
    const parsed = disruptionsResponseSchema.parse(json)
    const result: GetDisruptionsResult = { disruptions: parsed.disruptions, disruptionTypes: parsed.disruptionTypes }
    disruptionsCache.set(cacheKey, result)
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
      const { json, response } = await fetchJsonWithRetry(url, apiKey, 'Pobranie realizacji nie powiodło się')
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

    async getTrainDetail(scheduleId: string, orderId: string, operatingDate: string): Promise<TrainDetailResult> {
      // Oba segmenty ścieżki kodowane osobno z tego samego powodu co ID stacji
      // w encodeStationIds(): scheduleId/orderId/operatingDate trafiają tu już
      // po walidacji formatu w /api/train, ale kodowanie to druga, niezależna
      // warstwa — patrz AGENTS.md #3.
      const operationUrl = `${BASE_URL}/api/v1/operations/train/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}/${encodeURIComponent(operatingDate)}`
      const routeUrl = `${BASE_URL}/api/v1/schedules/route/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}`

      // Trasa rozkładowa może nie istnieć dla mniejszości pociągów (patrz
      // „Znane ograniczenia" w README) — to nie powód, żeby nie pokazać
      // realizacji. Stąd allSettled zamiast Promise.all: brak trasy to `null`,
      // nie odrzucenie całego żądania.
      const [operationResult, routeResult] = await Promise.allSettled([
        fetchJsonWithRetry(operationUrl, apiKey, 'Pobranie szczegółów przejazdu nie powiodło się'),
        fetchJsonWithRetry(routeUrl, apiKey, 'Pobranie trasy pociągu nie powiodło się'),
      ])

      if (operationResult.status === 'rejected') throw operationResult.reason

      const operation = rawTrainOperationSchema.parse(operationResult.value.json)
      const route = routeResult.status === 'fulfilled' ? rawRouteSchema.parse(routeResult.value.json) : null

      // Ani odpowiedź realizacji, ani trasy nie niosą nazw stacji — tylko ID.
      // Pełny słownik stacji jest już cache'owany 24h dla searchStations, więc
      // to nie jest dodatkowe zapytanie poza pierwszym rozgrzaniem.
      const allStations = await fetchAllStations()
      const stationNames = Object.fromEntries(allStations.map((entry) => [entry.station.id, entry.station.name]))

      return { operation, route, stationNames }
    },

    async getNameDictionaries(): Promise<NameDictionaries> {
      const cached = nameDictionariesCache
      if (cached !== null && cached.expiresAt > Date.now()) {
        return cached.value
      }

      if (nameDictionariesInFlight === null) {
        nameDictionariesInFlight = loadNameDictionaries().finally(() => {
          nameDictionariesInFlight = null
        })
      }
      return nameDictionariesInFlight
    },

    async getOperationsStatistics(date: string): Promise<OperationsStatistics> {
      const url = `${BASE_URL}/api/v1/operations/statistics?date=${encodeURIComponent(date)}`
      const { json } = await fetchJsonWithRetry(url, apiKey, 'Pobranie statystyk sieci nie powiodło się')
      return operationsStatisticsResponseSchema.parse(json)
    },

    async getDailyCarrierCounts(date: string): Promise<Record<string, number>> {
      const url = `${BASE_URL}/api/v1/schedules/routes/${encodeURIComponent(date)}`
      const { json } = await fetchJsonWithRetry(url, apiKey, 'Pobranie listy tras dnia nie powiodło się')
      const { routes } = dailyRoutesResponseSchema.parse(json)
      const counts: Record<string, number> = {}
      for (const route of routes) {
        if (route.carrierCode === null) continue
        counts[route.carrierCode] = (counts[route.carrierCode] ?? 0) + 1
      }
      return counts
    },

    async getDisruptionCount(dateFrom: string, dateTo: string): Promise<number> {
      // Bez `stations=` -- zasięg ogólnopolski, tak jak `getOperationsStatistics()`.
      const url = `${BASE_URL}/api/v1/disruptions?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`
      const { json } = await fetchJsonWithRetry(url, apiKey, 'Pobranie liczby utrudnień nie powiodło się')
      return disruptionsCountResponseSchema.parse(json)
    },

    async getDisruptions(stationIds: string[], dateFrom?: string, dateTo?: string): Promise<GetDisruptionsResult> {
      const window = dateFrom !== undefined && dateTo !== undefined ? { dateFrom, dateTo } : scheduleDateWindow()
      const cacheKey = `${[...stationIds].sort().join(',')}|${window.dateFrom}|${window.dateTo}`
      const cached = disruptionsCache.get(cacheKey)
      if (cached !== undefined) {
        return cached
      }

      const pending = disruptionsInFlight.get(cacheKey)
      if (pending !== undefined) {
        return pending
      }

      const request = loadDisruptions(stationIds, window.dateFrom, window.dateTo, cacheKey).finally(() => {
        disruptionsInFlight.delete(cacheKey)
      })
      disruptionsInFlight.set(cacheKey, request)
      return request
    },
  }
}
