import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  PkpApiError,
  type GetDisruptionsResult,
  type NameDictionaries,
  type OperationsStatistics,
  type PkpClient,
  type TrainDetailResult,
} from './client'
import type { RawTrainOperation, Station } from './types'
import { disruptionsResponseSchema, operationsResponseSchema, schedulesResponseSchema, stationSearchResponseSchema } from './schema'
import { matchesStationName, normalizeForSearch } from '../search'
import { warsawDateString } from './time'

const FIXTURES_DIR = path.join(process.cwd(), 'fixtures')
const FIXTURE_ANCHOR = new Date('2026-08-01T12:00:00+02:00').getTime()

/**
 * Nazwy kategorii handlowych dla kombinacji przewoźnik+kod użytych w
 * `fixtures/schedules.json` -- nie ma osobnego fixture'a dla
 * `/dictionaries/commercial-categories` (za mało danych, żeby był tego
 * wart). "REG" to symbol wymyślony na potrzeby fixture'a (nie istnieje w
 * prawdziwym słowniku PKP, patrz `docs/pkp-api-slowniki-statusy.md` #1) --
 * stąd generyczna nazwa zamiast prawdziwej.
 */
const MOCK_CATEGORY_NAMES: Record<string, string> = {
  'IC|EIC': 'Express InterCity',
  'IC|TLK': 'Twoje Linie Kolejowe',
  'KM|REG': 'Pociąg regionalny',
  'PR|REG': 'Pociąg regionalny',
  'KS|REG': 'Pociąg regionalny',
  'ŁKA|REG': 'Pociąg regionalny',
  'SKM|REG': 'Pociąg regionalny',
}

async function readFixture<T>(fileName: string): Promise<T> {
  const raw = await readFile(path.join(FIXTURES_DIR, fileName), 'utf-8')
  return JSON.parse(raw) as T
}

/**
 * Fixture'y są niezmienne przez cały czas życia procesu, a poller sięga po nie
 * co 90 s. Czytanie i walidacja Zodem przy każdym wywołaniu to czysty koszt —
 * `getSchedules` otwierało dodatkowo dwa pliki naraz. Parsujemy raz, leniwie.
 *
 * Obietnica, nie wartość: równoległe wywołania trafiają w tę samą operację
 * wejścia/wyjścia zamiast ścigać się o nią.
 */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    pending ??= load()
    return pending
  }
}

const loadStations = once(async () => stationSearchResponseSchema.parse(await readFixture('stations-search.json')))
const loadOperations = once(async () => operationsResponseSchema.parse(await readFixture('operations.json')))
const loadSchedules = once(async () => schedulesResponseSchema.parse(await readFixture('schedules.json')))
const loadDisruptions = once(async () => disruptionsResponseSchema.parse(await readFixture('disruptions.json')))

function shiftTimestamp(value: string | null, offsetMs: number): string | null {
  if (value === null) return null
  return new Date(new Date(value).getTime() + offsetMs).toISOString()
}

function rebaseTrains(trains: RawTrainOperation[], now: number): RawTrainOperation[] {
  const offsetMs = now - FIXTURE_ANCHOR
  // operatingDate to kalendarzowa data kursowania (yyyy-MM-dd wg Warszawy), nie
  // znacznik czasu — nie da się jej przesunąć o offsetMs jak plannedArrival itp.
  // Fixture ma sztywną datę z sierpnia 2026, więc podmieniamy ją na dzisiejszą,
  // żeby `/operations/train/{scheduleId}/{orderId}/{operatingDate}` w trybie
  // mock zawsze dostawał wiarygodną datę.
  const operatingDate = warsawDateString(new Date(now))
  return trains.map((train) => ({
    ...train,
    operatingDate,
    stations: train.stations.map((stop) => ({
      ...stop,
      plannedArrival: shiftTimestamp(stop.plannedArrival, offsetMs),
      actualArrival: shiftTimestamp(stop.actualArrival, offsetMs),
      plannedDeparture: shiftTimestamp(stop.plannedDeparture, offsetMs),
      actualDeparture: shiftTimestamp(stop.actualDeparture, offsetMs),
    })),
  }))
}

export function createMockClient(): PkpClient {
  // Odpowiednik cache'u słownika z klienta live: zapełnia się przy pierwszym
  // odczycie fixture'ów i pozwala `/api/board` odsiać nieznane identyfikatory
  // bez czekania na wejście/wyjście.
  let cachedStationIds: ReadonlySet<string> | null = null

  async function stations() {
    const data = await loadStations()
    cachedStationIds ??= new Set(data.stations.map((station) => station.id))
    return data
  }

  // Rozgrzanie w tle: bez tego pierwsze żądanie do /api/board trafia w pusty
  // słownik i przepuszcza wszystko, co w trybie mock byłoby mylące przy testach.
  //
  // .catch() jest tu wyłącznie po to, żeby nieudane parsowanie fixture'a nie
  // stało się nieobsłużonym odrzuceniem obietnicy — sam błąd i tak trafi do
  // właściwej obsługi przy pierwszym realnym wywołaniu searchStations/
  // getOperations, które ponownie sięgnie po tę samą (odrzuconą) obietnicę.
  void stations().catch(() => {})

  return {
    getCachedStationIds(): ReadonlySet<string> | null {
      return cachedStationIds
    },

    async searchStations(query: string): Promise<Station[]> {
      const data = await stations()
      const normalized = normalizeForSearch(query)
      if (normalized === '') return data.stations
      return data.stations.filter((station) => matchesStationName(station.name, normalized))
    },

    async getOperations(stationIds: string[]) {
      const data = await loadOperations()
      const requested = new Set(stationIds)
      const filtered = data.trains.filter((train) => train.stations.some((stop) => requested.has(stop.stationId)))
      return {
        trains: rebaseTrains(filtered, Date.now()),
        stationNames: data.stations,
        // Sufity takie jak na żywym kluczu Basic, żeby panel diagnostyczny
        // w trybie mock pokazywał wiarygodny kształt, nie same liczby bez skali.
        budget: { hourly: 99, daily: 999, hourlyLimit: 100, dailyLimit: 1000 },
      }
    },

    async getSchedules(stationIds: string[]) {
      const [operations, schedules] = await Promise.all([loadOperations(), loadSchedules()])
      const requested = new Set(stationIds)
      const relevantTrainIds = new Set(
        operations.trains
          .filter((train) => train.stations.some((stop) => requested.has(stop.stationId)))
          .map((train) => `${train.scheduleId}-${train.orderId}`)
      )
      // `operatingDates` podmieniane na dzisiejszą datę, dokładnie tym samym
      // powodem co `operatingDate` w `rebaseTrains()`: fixture ma sztywny
      // sierpień 2026, a statystyki stacji liczą wyłącznie kursy „dzisiaj"
      // (patrz `stationStats.ts`) -- bez tego mock pokazywałby zero odjazdów
      // przy pełnej tablicy.
      const operatingDates = [warsawDateString(new Date())]
      const routes = schedules.routes
        .filter((route) => relevantTrainIds.has(`${route.scheduleId}-${route.orderId}`))
        .map((route) => ({ ...route, operatingDates }))
      return {
        routes,
        carrierNames: schedules.carrierNames,
        categoryNames: schedules.categoryNames,
        stationNames: schedules.stationNames,
      }
    },

    async getTrainDetail(scheduleId: string, orderId: string, operatingDate: string): Promise<TrainDetailResult> {
      const [operations, schedules] = await Promise.all([loadOperations(), loadSchedules()])
      const match = operations.trains.find((train) => train.scheduleId === scheduleId && train.orderId === orderId)
      if (!match) throw new PkpApiError('Nie znaleziono przejazdu', 404)

      const [operation] = rebaseTrains([match], Date.now())
      // Fixture ma zawsze dzisiejszą operatingDate (patrz rebaseTrains) — inna
      // data znaczy nieaktualne żądanie, tak jak na żywo 404 dla nieistniejącego kursu.
      if (operation.operatingDate !== operatingDate) throw new PkpApiError('Nie znaleziono przejazdu', 404)

      const route = schedules.routes.find((r) => r.scheduleId === scheduleId && r.orderId === orderId) ?? null
      // `operations.json` niesie słownik nazw dla wszystkich stacji użytych
      // w fixture'ach (nie tylko tych 4 z stations-search.json, które są
      // wyłącznie na potrzeby wyszukiwarki ulubionych) — to właściwe źródło.
      return { operation, route, stationNames: operations.stations }
    },

    async getNameDictionaries(): Promise<NameDictionaries> {
      // Przewoźnicy: ten sam słownik co getSchedules() już zwraca za darmo --
      // nie ma powodu go duplikować osobnym fixture'em.
      const schedules = await loadSchedules()
      return { carrierNames: schedules.carrierNames, categoryNames: MOCK_CATEGORY_NAMES }
    },

    // Widżet "stan sieci": w trybie mock nie ma osobnego fixture'a o skali
    // żywego API (patrz AGENTS.md #8) -- liczby liczone wprost z tych samych
    // 8 pociągów co reszta mocka, żeby były wewnętrznie spójne, nie realistyczne.
    async getOperationsStatistics(): Promise<OperationsStatistics> {
      const { trains } = await loadOperations()
      const counts = { notStarted: 0, inProgress: 0, completed: 0, cancelled: 0, partialCancelled: 0 }
      for (const train of trains) {
        switch (train.trainStatus) {
          case 'S': counts.notStarted++; break
          case 'P': counts.inProgress++; break
          case 'C': counts.completed++; break
          case 'X': counts.cancelled++; break
          case 'Q': counts.partialCancelled++; break
        }
      }
      return { generatedAt: new Date().toISOString(), totalTrains: trains.length, ...counts }
    },

    async getDailyCarrierCounts(): Promise<Record<string, number>> {
      const { routes } = await loadSchedules()
      const counts: Record<string, number> = {}
      for (const route of routes) {
        if (route.carrierCode === null) continue
        counts[route.carrierCode] = (counts[route.carrierCode] ?? 0) + 1
      }
      return counts
    },

    async getDisruptionCount(): Promise<number> {
      // Osobna funkcjonalność (widżet "stan sieci", networkStats.ts) --
      // celowo nie licz z tego samego fixture'a co getDisruptions() niżej,
      // to nie było w zakresie tej zmiany i nie ma testu blokującego to zachowanie.
      return 0
    },

    async getDisruptions(stationIds: string[]): Promise<GetDisruptionsResult> {
      const data = await loadDisruptions()
      const requested = new Set(stationIds)
      // operatingDate to kalendarzowa data kursowania, ten sam powód co w
      // rebaseTrains() -- fixture ma sztywną datę z sierpnia 2026, podmieniana
      // na dzisiejszą, żeby dalej pasowała do zrebase'owanych pociągów.
      const operatingDate = warsawDateString(new Date())
      const disruptions = data.disruptions
        .filter((disruption) => disruption.affectedRoutes.some((route) => requested.has(route.stationId)))
        .map((disruption) => ({
          ...disruption,
          affectedRoutes: disruption.affectedRoutes.map((route) => ({ ...route, operatingDate })),
        }))
      return { disruptions, disruptionTypes: data.disruptionTypes }
    },
  }
}
