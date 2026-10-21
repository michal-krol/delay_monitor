import type { RawDisruption, RawRoute, RawTrainOperation, Station } from './types'
import {
  carriersResponseSchema,
  commercialCategoriesResponseSchema,
  dailyRoutesResponseSchema,
  dataVersionResponseSchema,
  disruptionsCountResponseSchema,
  disruptionsResponseSchema,
  operationsResponseSchema,
  operationsStatisticsResponseSchema,
  rawTrainOperationSchema,
} from './schema'
import { createTtlCache } from '../cache'
import { BASE_URL, PkpApiError, createPkpTransport, parseBudget, type RateLimitBudget } from './http'
import { createNationalSchedules, scheduleDateWindow } from './nationalSchedules'
import type { TrainSearchResult } from './trainSearch'
import { createStationDirectory } from './stationDirectory'
import { logEvent } from '@/lib/log'

// Transport (`http.ts`) jest właścicielem tych symboli; stąd re-eksport, żeby publiczna powierzchnia klienta się nie zmieniła.
export { PkpApiError, mergeBudgets, type RateLimitBudget } from './http'

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

/** Maksimum dopuszczone przez swagger dla `/operations` (domyślne API to 1000) — patrz `getOperations()`. */
const OPERATIONS_PAGE_SIZE = 5000


export type GetOperationsResult = {
  trains: RawTrainOperation[]
  stationNames: Record<string, string>
  budget: RateLimitBudget
  /**
   * Czy odpowiedź została ucięta na `OPERATIONS_PAGE_SIZE` (API zgłosiło
   * `pagination.hasNextPage`). Dotąd ten fakt żył wyłącznie w `console.warn`;
   * poller potrzebuje go, żeby dla wielkiego węzła dociągnąć realizację samych
   * obserwowanych stacji osobnym zapytaniem (patrz `poller.ts`, re-fetch).
   */
  truncated: boolean
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
  /**
   * Czy trzeba było ponowić zapytanie bez `fullRoute`, bo PKP zwróciło trasy
   * z pustą listą przystanków (patrz `loadSchedules()`). Wcześniej ten fakt
   * istniał wyłącznie w logu serwera, a wynik lądował w cache'u na 24 h — więc
   * kolejne cykle nawet nie logowały i nikt nie wiedział, że rozkład jest
   * okrojony. Wynoszone na zewnątrz, żeby trafiło do diagnostyki.
   */
  usedFullRouteFallback: boolean
}

/** `/api/v1/data-version` — patrz `getDataVersion()` i `dataVersionResponseSchema`. */
export type DataVersion = {
  dataVersion: string | null
  schedulesVersion: string | null
  operationsVersion: string | null
  /** Znacznik ostatniej aktualizacji danych po stronie PKP (ISO, UTC). */
  timestamp: string | null
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
   * dopasowanej trasy (dotyczy mniejszości pociągów) — realizacja i tak zostaje pokazana, tylko bez peronu/toru.
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
  /** Memory only: never loads or refreshes the national timetable. */
  searchCachedTrains(query: string): TrainSearchResult
  searchStations(query: string): Promise<Station[]>
  /**
   * Jedna strona realizacji. `page` (od 1) domyślnie 1 — poller sam dociąga
   * kolejne strony po `truncated`, bo pełne dociąganie kosztuje z limitu
   * 100/h i decyzja „ile stron" należy do niego, nie do klienta (patrz
   * `fetchAllOperations` w `poller.ts`).
   */
  getOperations(stationIds: string[], page?: number): Promise<GetOperationsResult>
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
   * Najniższy znany budżet z KAŻDEJ odpowiedzi z kluczem w bieżącej godzinie —
   * także spoza `getOperations` (`/api/train`, `/schedules`, network-stats
   * dzielą tę samą pulę 100/h). `null` = nie wiadomo (żadna odpowiedź z
   * nagłówkami w tej godzinie), nigdy „zero". Endpointy publiczne (bez klucza)
   * są z innej puli i tu nie wchodzą.
   */
  getLastBudget(): RateLimitBudget | null
  /**
   * Zagregowane liczniki statusów pociągów w całym kraju, bez filtra po
   * stacji — API nie oferuje takiego filtra dla tego endpointu. Wywołujący (patrz
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
  /**
   * Wersje danych po stronie PKP — sygnał „czy tam w ogóle coś się zmienia".
   * Wołane WARUNKOWO, dopiero gdy feed realizacji wygląda na zamrożony (patrz
   * `poller.ts`), nie w każdym cyklu: kosztuje zapytanie z limitu 100/h,
   * a zamrożenie trwa godzinami, więc sygnał wyprzedzający niczego nie zmienia.
   */
  getDataVersion(): Promise<DataVersion>
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

export function createLiveClient(
  apiKey: string,
  now: () => Date = () => new Date(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => number = Math.random
): PkpClient {
  const transport = createPkpTransport({ apiKey, now, sleep, random })
  const { fetchJson, fetchPublicJson } = transport
  const stations = createStationDirectory(fetchJson)
  const schedules = createNationalSchedules(fetchJson, now)
  const disruptionsCache = createTtlCache<GetDisruptionsResult>({
    ttlMs: DISRUPTIONS_CACHE_TTL_MS,
    maxEntries: DISRUPTIONS_CACHE_MAX_ENTRIES,
  })
  // Jeden blob, nie klucz-po-kluczu, więc zwykły TtlCache (klucz -> wartość) tu nie pasuje.
  let nameDictionariesCache: { value: NameDictionaries; expiresAt: number } | null = null
  // Uchwyty na trwające pobrania (cache przed `await`, zapis po nim -- patrz `nationalSchedules.ts`).
  let nameDictionariesInFlight: Promise<NameDictionaries> | null = null
  const disruptionsInFlight = new Map<string, Promise<GetDisruptionsResult>>()

  async function loadNameDictionaries(): Promise<NameDictionaries> {
    const [carriers, categories] = await Promise.all([
      fetchPublicJson(`${BASE_URL}/api/v1/dictionaries/carriers`, 'Pobranie słownika przewoźników nie powiodło się'),
      fetchPublicJson(
        `${BASE_URL}/api/v1/dictionaries/commercial-categories`,
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

  async function loadDisruptions(stationIds: string[], dateFrom: string, dateTo: string, cacheKey: string): Promise<GetDisruptionsResult> {
    const url = `${BASE_URL}/api/v1/disruptions?stations=${encodeStationIds(stationIds)}&dateFrom=${dateFrom}&dateTo=${dateTo}&dictionaries=true`
    const { json } = await fetchJson(url, 'Pobranie utrudnień nie powiodło się')
    const parsed = disruptionsResponseSchema.parse(json)
    const result: GetDisruptionsResult = { disruptions: parsed.disruptions, disruptionTypes: parsed.disruptionTypes }
    disruptionsCache.set(cacheKey, result)
    return result
  }

  return {
    getLastBudget: transport.getLastBudget,

    getCachedStationIds: stations.getCachedIds,

    searchStations: stations.search,

    getSchedules: schedules.getSchedules,
    searchCachedTrains: schedules.searchCachedTrains,

    async getOperations(stationIds: string[], page = 1): Promise<GetOperationsResult> {
      // Świadomie BEZ fullRoutes=true: dokładałoby pełną trasę (śr. 15
      // przystanków) do KAŻDEGO pociągu, choć transformOperations używa tylko
      // jednego przystanku na zapytaną stację — 8.6 MB zamiast 680 KB na
      // żywym pomiarze (Warszawa Centralna), co cykl pollera (~90 s). Origin/
      // destination do „Kierunku" idą teraz z dopasowanej trasy /schedules
      // (fullRoute=true tam — patrz loadSchedules — ale cache 24h, nie co 90s).
      // Nie dopisuj tego z powrotem bez przeliczenia kosztu.
      // pageSize=5000 to maksimum dopuszczone przez swagger (domyślne 1000).
      // `/operations` zwraca 4-5 dni kursowania naraz, bez filtra daty (AGENTS.md
      // #9), więc obserwowany zestaw na dużym węźle przekracza jedną stronę.
      // `page` wybiera stronę; kolejne dociąga poller (`fetchAllOperations`),
      // bo każda to osobne zapytanie z limitu 100/h i decyzja „ile stron"
      // należy do niego.
      const url = `${BASE_URL}/api/v1/operations?stations=${encodeStationIds(stationIds)}&withPlanned=true&pageSize=${OPERATIONS_PAGE_SIZE}&page=${page}`
      const { json, response } = await fetchJson(url, 'Pobranie realizacji nie powiodło się')
      const parsed = operationsResponseSchema.parse(json)
      // `truncated` = są kolejne strony. Klient sam ich NIE dociąga — zwraca flagę,
      // a poller decyduje (budżet, limit stron), czy iść po następną.
      const truncated = parsed.pagination?.hasNextPage === true
      return { trains: parsed.trains, stationNames: parsed.stations, budget: parseBudget(response), truncated }
    },

    async getTrainDetail(scheduleId: string, orderId: string, operatingDate: string): Promise<TrainDetailResult> {
      // Oba segmenty ścieżki kodowane osobno z tego samego powodu co ID stacji
      // w encodeStationIds(): scheduleId/orderId/operatingDate trafiają tu już
      // po walidacji formatu w /api/train, ale kodowanie to druga, niezależna
      // warstwa — patrz AGENTS.md #3.
      const operationUrl = `${BASE_URL}/api/v1/operations/train/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}/${encodeURIComponent(operatingDate)}`

      // Trasa rozkładowa może nie istnieć dla mniejszości pociągów — to nie powód, żeby nie pokazać
      // realizacji. Stąd allSettled zamiast Promise.all: brak trasy to `null`,
      // nie odrzucenie całego żądania.
      const [operationResult, routeResult] = await Promise.allSettled([
        fetchJson(operationUrl, 'Pobranie szczegółów przejazdu nie powiodło się'),
        schedules.fetchRoute(scheduleId, orderId),
      ])

      if (operationResult.status === 'rejected') throw operationResult.reason

      const operation = rawTrainOperationSchema.parse(operationResult.value.json)
      // 404 (brak trasy dla tego pociągu) jest normalny i celowo cichy -- patrz
      // komentarz przy fetchRoute. Każde inne odrzucenie (5xx, błąd parsowania
      // schematu, sieć) degraduje tak samo do `route: null`, ale bez logu
      // przeszłoby niezauważone -- to sygnał odróżniający "PKP nie ma trasy"
      // od "coś się psuje przy pobieraniu trasy".
      if (routeResult.status === 'rejected') {
        const status = routeResult.reason instanceof PkpApiError ? routeResult.reason.status : null
        if (status !== 404) {
          logEvent('warn', 'pkp.train_route_failed', { status }, routeResult.reason)
        }
      }
      const route = routeResult.status === 'fulfilled' ? routeResult.value : null

      // Ani odpowiedź realizacji, ani trasy nie niosą nazw stacji — tylko ID.
      // Pełny słownik stacji jest już cache'owany 24h dla searchStations, więc
      // to nie jest dodatkowe zapytanie poza pierwszym rozgrzaniem.
      const allStations = await stations.all()
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
      const { json } = await fetchJson(url, 'Pobranie statystyk sieci nie powiodło się')
      return operationsStatisticsResponseSchema.parse(json)
    },

    async getDailyCarrierCounts(date: string): Promise<Record<string, number>> {
      const url = `${BASE_URL}/api/v1/schedules/routes/${encodeURIComponent(date)}`
      const { json } = await fetchJson(url, 'Pobranie listy tras dnia nie powiodło się')
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
      const { json } = await fetchJson(url, 'Pobranie liczby utrudnień nie powiodło się')
      return disruptionsCountResponseSchema.parse(json)
    },

    async getDisruptions(stationIds: string[], dateFrom?: string, dateTo?: string): Promise<GetDisruptionsResult> {
      const window = dateFrom !== undefined && dateTo !== undefined ? { dateFrom, dateTo } : scheduleDateWindow(now)
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

    async getDataVersion(): Promise<DataVersion> {
      // Bez cache'u świadomie: to pytanie brzmi „czy dane się właśnie zmieniły",
      // więc zapamiętana odpowiedź nie miałaby sensu. Dławienie częstotliwości
      // należy do wywołującego (patrz `poller.ts`), nie tutaj.
      const { json } = await fetchJson(
        `${BASE_URL}/api/v1/data-version`,
        'Pobranie wersji danych nie powiodło się'
      )
      return dataVersionResponseSchema.parse(json)
    },
  }
}
