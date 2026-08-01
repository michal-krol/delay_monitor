import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PkpClient } from './client'
import type { RawTrainOperation, Station } from './types'
import { operationsResponseSchema, stationSearchResponseSchema } from './schema'

const FIXTURES_DIR = path.join(process.cwd(), 'fixtures')
const FIXTURE_ANCHOR = new Date('2026-08-01T12:00:00+02:00').getTime()

async function readFixture<T>(fileName: string): Promise<T> {
  const raw = await readFile(path.join(FIXTURES_DIR, fileName), 'utf-8')
  return JSON.parse(raw) as T
}

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
  return {
    async searchStations(query: string): Promise<Station[]> {
      const data = stationSearchResponseSchema.parse(await readFixture('stations-search.json'))
      const normalized = query.trim().toLowerCase()
      if (normalized === '') return data.stations
      return data.stations.filter((station) => station.name.toLowerCase().includes(normalized))
    },

    async getOperations(stationIds: string[]) {
      const data = operationsResponseSchema.parse(await readFixture('operations.json'))
      const requested = new Set(stationIds)
      const filtered = data.trains.filter((train) => train.stations.some((stop) => requested.has(stop.stationId)))
      return {
        trains: rebaseTrains(filtered, Date.now()),
        stationNames: data.stations,
        budget: { hourly: 99, daily: 999 },
      }
    },
  }
}
