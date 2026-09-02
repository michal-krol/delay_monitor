import { describe, expect, it } from 'vitest'
import { getCity } from './cities'
import { createLiveClient } from './client'
import { headerIndex } from './csv'

/**
 * Test kontraktowy: czy żywy feed `mkuran.pl/gtfs/warsaw` nadal niesie kolumny,
 * na których stoi `schema.ts` i `schedule.ts`. NIE uruchamia się w zwykłym
 * `npm run test` — wymaga sieci. Uruchomienie:
 *
 *   GTFS_CONTRACT=1 npm run test -- gtfs/contract          (POSIX / Git Bash)
 *   $env:GTFS_CONTRACT='1'; npm run test -- gtfs/contract   (PowerShell)
 *
 * Pobiera wyłącznie `feed_info.txt`, `routes.txt`, `frequencies.txt` i początek
 * `stops.txt` żądaniami zakresowymi (kilkaset KB), poza CI, bez kosztu.
 * Sprawdza OBECNOŚĆ kolumn — bo to ich zniknięcie robi ciche awarie
 * (metro w `frequencies`, `parent_station` w `stops`, `route_color` w `routes`).
 */

const client = createLiveClient(getCity('waw')!)

async function firstLine(name: string): Promise<string> {
  const stream = await client.readEntry(name)
  expect(stream, `brak wpisu ${name} w feedzie`).not.toBeNull()
  for await (const line of stream!) {
    if (line.trim() !== '') return line
  }
  throw new Error(`${name} jest pusty`)
}

async function columns(name: string): Promise<Set<string>> {
  return new Set(headerIndex(await firstLine(name)).keys())
}

describe.skipIf(process.env.GTFS_CONTRACT !== '1')('kontrakt: feed mkuran ↔ warstwa gtfs', () => {
  it('feed_info.txt niesie feed_version (strażnik spójności ładowania)', async () => {
    expect(await client.getFeedVersion()).toMatch(/\S/)
  })

  it('routes.txt niesie route_id, route_short_name, route_type, route_color', async () => {
    const cols = await columns('routes.txt')
    for (const required of ['route_id', 'route_short_name', 'route_type', 'route_color']) {
      expect(cols, `routes.${required} zniknęło z feedu`).toContain(required)
    }
  })

  it('frequencies.txt niesie trip_id, start_time, end_time, headway_secs (metro!)', async () => {
    const cols = await columns('frequencies.txt')
    for (const required of ['trip_id', 'start_time', 'end_time', 'headway_secs']) {
      expect(cols, `frequencies.${required} zniknęło — metro pokaże się raz na kilka godzin`).toContain(required)
    }
  })

  it('stops.txt niesie stop_id, parent_station, wheelchair_boarding', async () => {
    const cols = await columns('stops.txt')
    for (const required of ['stop_id', 'parent_station', 'wheelchair_boarding']) {
      expect(cols, `stops.${required} zniknęło z feedu`).toContain(required)
    }
  })

  it('trips.txt niesie route_id, service_id, trip_id, trip_headsign', async () => {
    const cols = await columns('trips.txt')
    for (const required of ['route_id', 'service_id', 'trip_id', 'trip_headsign']) {
      expect(cols, `trips.${required} zniknęło z feedu`).toContain(required)
    }
  })
})
