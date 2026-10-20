import type { RawRoute } from './types'
import type { GetSchedulesResult } from './client'
import { rawRouteSchema, schedulesResponseSchema } from './schema'
import { createTtlCache } from '../cache'
import { warsawDateString } from './time'
import { BASE_URL, type FetchJson } from './http'
import { logEvent } from '@/lib/log'

/**
 * Rozkład jest pobierany OGÓLNOPOLSKO (bez `stations`), jedno zapytanie na okno dat, i ważny pół doby --
 * czyli 2-3 zapytania na dobę niezależnie od liczby użytkowników i ich stacji. Zmierzone na żywym API
 * (2026-09-29): 43 MB, 9 014 tras, 161 tys. przystanków, ok. 1,4 s, ok. 125 MB sterty po sparsowaniu
 * (replika ma 8 GB, dotąd max 1,8 GB). Poprzednio klucz cache'u = zestaw stacji wszystkich aktywnych
 * użytkowników, więc każda zmiana tego zestawu (także czyjeś odejście) kosztowała nowe pobranie.
 */
const NATIONAL_SCHEDULES_TTL_MS = 12 * 60 * 60 * 1000
/** Po nieudanym odświeżeniu (przy zachowanej starej migawce) nie ponawiamy 43 MB co cykl pollera. */
const NATIONAL_SCHEDULES_RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** Trasa rozkładowa (schedules/route) jest statyczną daną rozkładową jak /schedules — ta sama długość TTL. */
const ROUTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const ROUTE_CACHE_MAX_ENTRIES = 500

/**
 * Ogólnopolski rozkład na okno dat z indeksami zbudowanymi raz przy wczytaniu
 * (nigdy skan całej listy na żądanie). `windowKey` = `dateFrom|dateTo`.
 */
type NationalSchedules = {
  windowKey: string
  expiresAt: number
  meta: Omit<GetSchedulesResult, 'routes'>
  /** ID stacji -> trasy przez nią przechodzące (każda trasa raz na stację). */
  byStation: Map<string, RawRoute[]>
  /** `scheduleId|orderId` -> trasa; służy `/api/train` zamiast `/schedules/route/...`. */
  byRoute: Map<string, RawRoute>
}

function indexNationalSchedules(windowKey: string, result: GetSchedulesResult): NationalSchedules {
  const byStation = new Map<string, RawRoute[]>()
  const byRoute = new Map<string, RawRoute>()
  for (const route of result.routes) {
    byRoute.set(`${route.scheduleId}|${route.orderId}`, route)
    // Trasa może przejeżdżać przez stację więcej niż raz (pętla) -- do indeksu tylko raz.
    for (const stationId of new Set(route.stations.map((stop) => stop.stationId))) {
      const bucket = byStation.get(stationId)
      if (bucket === undefined) byStation.set(stationId, [route])
      else bucket.push(route)
    }
  }
  const { carrierNames, categoryNames, stationNames, usedFullRouteFallback } = result
  return {
    windowKey,
    expiresAt: Date.now() + NATIONAL_SCHEDULES_TTL_MS,
    meta: { carrierNames, categoryNames, stationNames, usedFullRouteFallback },
    byStation,
    byRoute,
  }
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
export function scheduleDateWindow(now: () => Date): { dateFrom: string; dateTo: string } {
  const instant = now()
  return {
    dateFrom: warsawDateString(instant),
    dateTo: warsawDateString(new Date(instant.getTime() + ONE_DAY_MS)),
  }
}

export type NationalSchedulesStore = {
  getSchedules(stationIds: string[]): Promise<GetSchedulesResult>
  fetchRoute(scheduleId: string, orderId: string): Promise<RawRoute>
}

export function createNationalSchedules(fetchJson: FetchJson, now: () => Date): NationalSchedulesStore {
  // Jedna migawka ogólnopolskiego rozkładu (okno dat w kluczu) + indeksy budowane raz przy wczytaniu.
  let nationalSchedules: NationalSchedules | null = null
  let lastRefreshFailure: { at: number; error: unknown } | null = null
  const routeCache = createTtlCache<RawRoute>({
    ttlMs: ROUTE_CACHE_TTL_MS,
    maxEntries: ROUTE_CACHE_MAX_ENTRIES,
  })

  /**
   * Uchwyty na trwające pobrania: cache sprawdzamy przed `await`, a zapisujemy po nim -- bez nich
   * równoległe żądania (zimny start, wygaśnięcie) odpalają każde własne pobranie z limitu 100/h.
   */
  let nationalSchedulesInFlight: { windowKey: string; promise: Promise<NationalSchedules> } | null = null
  const routeInFlight = new Map<string, Promise<RawRoute>>()

  /**
   * Bez `stations` = cały kraj. Identyfikatory stacji z zewnątrz (URL `/api/board`) nigdy nie trafiają do tego
   * zapytania -- filtrują wynik dopiero w pamięci (AGENTS.md #4), więc nie ma czego wstrzykiwać.
   */
  async function loadNationalSchedules(dateFrom: string, dateTo: string): Promise<GetSchedulesResult> {
    const baseUrl = `${BASE_URL}/api/v1/schedules?dateFrom=${dateFrom}&dateTo=${dateTo}`
    // fullRoute=true: /operations celowo NIE dokłada już pełnej trasy (patrz
    // getOperations w client.ts) — origin/destination do „Kierunku" idą stąd.
    // Koszt jednorazowy: migawka żyje pół doby (NATIONAL_SCHEDULES_TTL_MS), w przeciwieństwie do
    // /operations pobieranego co cykl pollera.
    const { json } = await fetchJson(`${baseUrl}&fullRoute=true`, 'Pobranie rozkładu nie powiodło się')
    let parsed = schedulesResponseSchema.parse(json)

    /**
     * Obejście awarii po stronie PKP, stwierdzonej 2026-08-30: `fullRoute=true`
     * zaczęło zwracać komplet tras z kraju (10 498 zamiast 694 dla jednej
     * stacji, 2,5 MB zamiast 522 KB) i przy tym GUBIĆ listę `stations` w każdej
     * z nich. Bez przystanków nie ma planowych godzin, peronu, kierunku ani
     * estymaty z poprzedniej stacji — czyli trasy są formalnie obecne, a
     * praktycznie bezużyteczne. Schemat tego nie zgłasza, bo `stations` jest
     * `.nullish()` i brak zamienia się w `[]` (świadomie: to granica zaufania).
     *
     * Wariant bez `fullRoute` działa i niesie przystanek obserwowanej stacji
     * wraz z jego godzinami i peronem — traci tylko pełną trasę, czyli
     * „Kierunek" i estymatę upstream. Lepsze to niż tablica bez godzin.
     *
     * Świadomie jako FALLBACK, nie jako domyślne zachowanie: gdy PKP naprawi
     * `fullRoute`, kierunek i estymata wracają same, bez zmiany w kodzie.
     * Koszt: jedno dodatkowe zapytanie na odświeżenie migawki (co 12 h), czyli
     * w praktyce kilka na dobę — patrz AGENTS.md #3. (Historycznie test 2026-08-30
     * dotyczył jednej stacji; dziś pytamy o cały kraj, więc „komplet tras" jest
     * normą, a sygnałem awarii pozostaje wyłącznie brak przystanków.)
     */
    let usedFullRouteFallback = false
    if (parsed.routes.length > 0 && !parsed.routes.some((route) => route.stations.length > 0)) {
      logEvent('error', 'pkp.schedules_full_route_empty', { routes: parsed.routes.length })
      usedFullRouteFallback = true
      const fallback = await fetchJson(baseUrl, 'Pobranie rozkładu nie powiodło się')
      parsed = schedulesResponseSchema.parse(fallback.json)
    }

    return {
      routes: parsed.routes,
      carrierNames: parsed.carrierNames,
      categoryNames: parsed.categoryNames,
      stationNames: parsed.stationNames,
      usedFullRouteFallback,
    }
  }

  /**
   * Bieżąca migawka albo jej odświeżenie (jedno zapytanie na raz, także przy wielu równoległych `getSchedules`).
   * Nieudane odświeżenie NIE kasuje ostatniej dobrej migawki tego samego okna dat: jest serwowana dalej,
   * a kolejna próba dopiero po `NATIONAL_SCHEDULES_RETRY_AFTER_FAILURE_MS` (AGENTS.md #7). Bez żadnej migawki
   * błąd leci wyżej -- „nie wiadomo" to nie pusty rozkład.
   */
  async function ensureNationalSchedules(): Promise<NationalSchedules> {
    // Okno dat MUSI wejść do klucza i MUSI być policzone raz, tutaj -- patrz komentarz w git blame `getSchedules`:
    // migawka z 14:00 nie może obsługiwać dnia następnego, a przebieg o północy nie może zapisać wyniku
    // pod wczorajszym kluczem.
    const { dateFrom, dateTo } = scheduleDateWindow(now)
    const windowKey = `${dateFrom}|${dateTo}`
    const current = nationalSchedules
    if (current !== null && current.windowKey === windowKey && current.expiresAt > Date.now()) return current

    if (nationalSchedulesInFlight !== null && nationalSchedulesInFlight.windowKey === windowKey) {
      return nationalSchedulesInFlight.promise
    }

    // Po porażce nie próbujemy znowu co tik pollera (43 MB, do 2 zapytań z limitu) -- także gdy nie ma
    // pasującej migawki (zmiana okna po północy, zimny start). Wtedy błąd leci wyżej, a poller ma swój `lastGoodRoutes`.
    if (lastRefreshFailure !== null && Date.now() - lastRefreshFailure.at < NATIONAL_SCHEDULES_RETRY_AFTER_FAILURE_MS) {
      if (current !== null && current.windowKey === windowKey) return current
      throw lastRefreshFailure.error
    }

    const promise = loadNationalSchedules(dateFrom, dateTo)
      .then((result) => {
        const indexed = indexNationalSchedules(windowKey, result)
        lastRefreshFailure = null
        // Wolne pobranie starszego okna (przebieg sprzed północy) nie może nadpisać nowszej migawki.
        if (nationalSchedules === null || nationalSchedules.windowKey <= windowKey) nationalSchedules = indexed
        return indexed
      })
      .catch((err: unknown) => {
        lastRefreshFailure = { at: Date.now(), error: err }
        if (current !== null && current.windowKey === windowKey) {
          logEvent('warn', 'pkp.schedules_refresh_failed_serving_stale', {}, err)
          return current
        }
        throw err
      })
      .finally(() => {
        // Nie kasujemy uchwytu nowszego okna, który w międzyczasie go zastąpił.
        if (nationalSchedulesInFlight?.windowKey === windowKey) nationalSchedulesInFlight = null
      })
    nationalSchedulesInFlight = { windowKey, promise }
    return promise
  }

  return {
    async getSchedules(stationIds: string[]): Promise<GetSchedulesResult> {
      const snapshot = await ensureNationalSchedules()
      // Suma tras przez którąkolwiek z żądanych stacji, każda raz (trasa 30 przez 5100 i 4900 nie dubluje się).
      // NIE zwracamy całego kraju: `stationStats` liczy surową listę tras (AGENTS.md #9) i liczyłby cudze pociągi.
      // Rekordy tego samego przejazdu z różnymi `orderId` (po jednym na dzień) zostają osobno.
      const routes = new Set<RawRoute>()
      for (const stationId of stationIds) {
        for (const route of snapshot.byStation.get(stationId) ?? []) routes.add(route)
      }
      return { ...snapshot.meta, routes: [...routes] }
    },

    /**
     * Trasa rozkładowa (schedules/route) jest statyczną daną rozkładową dla
     * danej pary scheduleId/orderId — w przeciwieństwie do realizacji (operations)
     * nie zmienia się między wywołaniami `getTrainDetail` dla tego samego
     * pociągu. Cache + in-flight dedup, jak przy `getSchedules`.
     *
     * Brak trasy (404, mniejszość pociągów) NIE jest cache'owany — może się
     * pojawić później, więc odrzucenie leci dalej bez zapisu.
     */
    async fetchRoute(scheduleId: string, orderId: string): Promise<RawRoute> {
      const cacheKey = `${scheduleId}|${orderId}`
      const cached = routeCache.get(cacheKey)
      if (cached !== undefined) {
        return cached
      }

      // Trasa z migawki rozkładu (fullRoute=true) to ten sam kształt co `/schedules/route/...`, więc zimny miss
      // `/api/train` nie płaci osobnego zapytania. Migawka bez pełnych tras (fallback po awarii PKP) się nie nadaje.
      const fromSnapshot = nationalSchedules !== null && !nationalSchedules.meta.usedFullRouteFallback ? nationalSchedules.byRoute.get(cacheKey) : undefined
      if (fromSnapshot !== undefined) return fromSnapshot

      const pending = routeInFlight.get(cacheKey)
      if (pending !== undefined) {
        return pending
      }

      const routeUrl = `${BASE_URL}/api/v1/schedules/route/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}`
      const request = fetchJson(routeUrl, 'Pobranie trasy pociągu nie powiodło się')
        .then(({ json }) => {
          const route = rawRouteSchema.parse(json)
          routeCache.set(cacheKey, route)
          return route
        })
        .finally(() => {
          routeInFlight.delete(cacheKey)
        })
      routeInFlight.set(cacheKey, request)
      return request
    },
  }
}
