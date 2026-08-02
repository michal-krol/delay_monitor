import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PkpClient } from './client'
import type { RawTrainOperation, Station } from './types'
import { operationsResponseSchema, schedulesResponseSchema, stationSearchResponseSchema } from './schema'
import { matchesStationName, normalizeForSearch } from '../search'

const FIXTURES_DIR = path.join(process.cwd(), 'fixtures')
const FIXTURE_ANCHOR = new Date('2026-08-01T12:00:00+02:00').getTime()

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

function shiftTimestamp(value: string | null, offsetMs: number): string | null {
  if (value === null) return null
  return new Date(new Date(value).getTime() + offsetMs).toISOString()
}

function rebaseTrains(trains: RawTrainOperation[], now: number): RawTrainOperation[] {
  const offsetMs = now - FIXTURE_ANCHOR
  return trains.map((train) => ({
    ...train,
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
  void stations()

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
        budget: { hourly: 99, daily: 999 },
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
      return schedules.routes.filter((route) => relevantTrainIds.has(`${route.scheduleId}-${route.orderId}`))
    },
  }
}
