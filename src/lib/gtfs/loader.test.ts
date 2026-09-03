import { describe, expect, it } from 'vitest'
import type { CityFeed } from './cities'
import type { GtfsClient } from './client'
import { FeedChangedDuringLoadError, loadSchedule } from './loader'

const CITY: CityFeed = {
  id: 'test',
  name: 'Test',
  staticUrl: 'https://example.test/f.zip',
  vehiclesUrl: null,
  alertsUrl: null,
  railStationPrefix: 'Test ',
  timezone: 'Europe/Warsaw',
}

const NOW = new Date('2026-09-02T09:00:00Z')

const ENTRIES: Record<string, string> = {
  'feed_info.txt': 'feed_version\nv-1\n',
  'calendar_dates.txt': 'service_id,date,exception_type\nS,20260902,1\n',
  'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\n1001,Rondo,52,21\n1002,Plac,52,21\n',
  'routes.txt': 'route_id,route_short_name,route_type\n1,1,3\n',
  'trips.txt': 'route_id,service_id,trip_id,trip_headsign,direction_id\n1,S,t,Plac,0\n',
  'frequencies.txt': 'trip_id,start_time,end_time,headway_secs\n',
  'attributions.txt': 'organization_name\nZTM\nMikołaj Kuranowski\n',
  'stop_times.txt':
    'trip_id,stop_sequence,stop_id,arrival_time,departure_time\nt,1,1001,12:00:00,12:00:00\nt,2,1002,12:05:00,12:05:00\n',
}

async function* lines(text: string): AsyncIterable<string> {
  for (const line of text.split('\n')) if (line !== '') yield line
}

function fakeClient(overrides: Partial<Record<string, string | null>> = {}, feedVersions?: (string | null)[]): GtfsClient {
  const table = { ...ENTRIES, ...overrides }
  let call = 0
  return {
    async readEntry(name) {
      const value = table[name]
      return value === undefined || value === null ? null : lines(value)
    },
    async getFeedVersion() {
      if (feedVersions) return feedVersions[Math.min(call++, feedVersions.length - 1)]
      return 'v-1'
    },
  }
}

describe('loadSchedule', () => {
  it('builds a schedule end to end from the entry table', async () => {
    const schedule = await loadSchedule(fakeClient(), CITY, { now: NOW })
    expect(schedule.feedVersion).toBe('v-1')
    expect(schedule.serviceDates).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
    expect(schedule.attribution).toEqual(['ZTM', 'Mikołaj Kuranowski'])
    expect(schedule.evCount).toBe(2)
    expect(schedule.stopIndexById.size).toBe(2)
  })

  it('tolerates a missing calendar.txt (calendar lives only in calendar_dates)', async () => {
    const schedule = await loadSchedule(fakeClient({ 'calendar.txt': null }), CITY, { now: NOW })
    expect(schedule.evCount).toBe(2)
  })

  it('rejects the load when feed_version changes between the opening and closing read', async () => {
    await expect(loadSchedule(fakeClient({}, ['v-1', 'v-2']), CITY, { now: NOW })).rejects.toBeInstanceOf(
      FeedChangedDuringLoadError
    )
  })

  it('throws when stop_times.txt is absent', async () => {
    await expect(loadSchedule(fakeClient({ 'stop_times.txt': null }), CITY, { now: NOW })).rejects.toThrow(/stop_times/)
  })

  it('skips rows that fail their schema instead of aborting the whole file', async () => {
    const schedule = await loadSchedule(
      fakeClient({ 'routes.txt': 'route_id,route_short_name,route_type\n1,1,3\n,,notanumber\n' }),
      CITY,
      { now: NOW }
    )
    expect(schedule.routes).toHaveLength(1)
  })
})
