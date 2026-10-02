import { cp, mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { serviceDateWindow } from '@/lib/pkp/time'
import { getCity, type CityFeed } from './cities'
import { loadSchedule } from './loader'
import { __resetMockCache, createMockClient } from './mock'
import { cityStats, lineDetail, nextDepartures } from './query'
import { mockAlertFeed } from './alertClient'
import { mockVehicleFeed } from './vehicleClient'

const FIXTURE_ROOT = path.join(process.cwd(), 'fixtures', 'gtfs')
const WAW = getCity('warszawa') as CityFeed
const [YESTERDAY, TODAY] = serviceDateWindow(new Date(), WAW.timezone)

beforeEach(() => {
  __resetMockCache()
})

async function collect(stream: AsyncIterable<string> | null): Promise<string[]> {
  if (stream === null) return []
  const out: string[] = []
  for await (const line of stream) out.push(line)
  return out
}

describe('createMockClient', () => {
  it('streams an entry line by line, header first, with date tokens substituted', async () => {
    const client = createMockClient(WAW)
    const lines = await collect(await client.readEntry('calendar_dates.txt'))
    expect(lines[0]).toBe('service_id,date,exception_type')
    expect(lines).toContain(`${TODAY}:C,${TODAY},1`)
    expect(lines.join('\n')).not.toContain('{{')
  })

  it('returns null for an entry the feed does not carry (calendar.txt)', async () => {
    expect(await createMockClient(WAW).readEntry('calendar.txt')).toBeNull()
  })

  it('reads feed_version from feed_info.txt', async () => {
    expect(await createMockClient(WAW).getFeedVersion()).toBe(`mock-${TODAY}`)
  })

  it('returns null feed_version when the fixtures directory does not exist', async () => {
    const client = createMockClient({ ...WAW, id: 'nonexistent-city' })
    expect(await client.getFeedVersion()).toBeNull()
    expect(await client.readEntry('stops.txt')).toBeNull()
  })

  it('yields the last line even without a trailing newline', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gtfs-nonl-'))
    await cp(path.join(FIXTURE_ROOT, 'warszawa'), path.join(root, 'x'), { recursive: true })
    // routes.txt kopiowany z warszawa kończy się newline; to i tak przechodzi.
    const lines: string[] = []
    for await (const line of (await createMockClient({ ...WAW, id: 'x' }, root).readEntry('routes.txt')) ?? []) {
      lines.push(line)
    }
    expect(lines[0]).toContain('route_id')
    expect(lines.some((line) => line.startsWith('M1,'))).toBe(true)
  })
})

describe('loadSchedule on the warszawa fixtures (end to end, no network)', () => {
  it('groups the 4-platform 1001xx set and the metro platforms under 7014M', async () => {
    const schedule = await loadSchedule(createMockClient(WAW), WAW)
    expect(schedule.groupMembers.get('1001')?.length).toBe(4)
    expect(schedule.groupMembers.get('7014M')?.length).toBe(3)
    expect(schedule.groupName.get('7014M')).toBe('Świętokrzyska')
  })

  it('expands the metro frequency row into three boarding events at 7014M', async () => {
    const schedule = await loadSchedule(createMockClient(WAW), WAW)
    const metroDepartures = nextDepartures(schedule, ['7014M'], Date.parse(`${TODAY}T00:00:00+02:00`), 20).filter(
      (departure) => departure.line === 'M1'
    )
    expect(metroDepartures).toHaveLength(3)
    expect(metroDepartures.every((departure) => departure.frequencyBased)).toBe(true)
  })

  it("carries yesterday's after-midnight night trip (25:10) into today's early hours", async () => {
    const schedule = await loadSchedule(createMockClient(WAW), WAW)
    const early = nextDepartures(schedule, ['1001'], Date.parse(`${TODAY}T00:30:00+02:00`), 20)
    const nightTrip = early.find((departure) => departure.tripId === '128/N')
    expect(nightTrip).toBeDefined()
    expect(nightTrip?.serviceDate).toBe(YESTERDAY)
    expect(nightTrip?.plannedAt.startsWith(`${TODAY}T01:10`)).toBe(true)
  })

  it('never exposes a delay or actual-time field on a departure', async () => {
    const schedule = await loadSchedule(createMockClient(WAW), WAW)
    const [departure] = nextDepartures(schedule, ['1001'], Date.parse(`${TODAY}T11:00:00+02:00`), 1)
    for (const forbidden of ['delayMinutes', 'actualAt', 'predictedAt', 'delay']) {
      expect(departure).not.toHaveProperty(forbidden)
    }
  })
})

describe('acceptance: a second, fictional city works with no code change', () => {
  it('loads a schedule for a city that only exists as a registry entry + fixtures', async () => {
    // „Kraków" tu jest fikcyjny: te same fixture'y, inny id miasta i strefa
    // podana wyłącznie w obiekcie CityFeed. Żaden plik źródłowy nie wie o nim.
    const root = await mkdtemp(path.join(tmpdir(), 'gtfs-krakow-'))
    await cp(path.join(FIXTURE_ROOT, 'warszawa'), path.join(root, 'krakow'), { recursive: true })

    const krakow: CityFeed = {
      id: 'krakow',
      name: 'Kraków',
      staticUrl: 'https://example.test/krakow.zip',
      vehiclesUrl: null,
      alertsUrl: null,
      railStationPrefix: 'Kraków ',
      timezone: 'Europe/Warsaw',
      mapCenter: { lat: 52.23, lon: 21.01 },
    }

    const schedule = await loadSchedule(createMockClient(krakow, root), krakow)
    expect(await readdir(path.join(root, 'krakow'))).toContain('stop_times.txt')
    expect(schedule.routes.length).toBeGreaterThan(0)

    const [today] = [serviceDateWindow(new Date(), krakow.timezone)[1]]
    const departures = nextDepartures(schedule, ['1001'], Date.parse(`${today}T11:00:00+02:00`), 5)
    expect(departures.length).toBeGreaterThan(0)
    expect(departures[0].serviceDate).toBe(today)
  })
})

describe('Warszawa mock fixtures cover every bus kind and edge-case alert', () => {
  it('has bus lines of every kind (regular ×2, zone, local, replacement, night, express)', async () => {
    const schedule = await loadSchedule(createMockClient(WAW), WAW)
    const stats = cityStats(schedule, 1)
    expect(stats.busKinds).toEqual({ regular: 2, night: 1, express: 1, replacement: 1, zone: 1, local: 1 })
    const kindOf = (name: string) => schedule.routes.find((r) => r.shortName === name)?.kind
    expect([kindOf('190'), kindOf('712'), kindOf('L-1'), kindOf('Z1')]).toEqual(['regular', 'zone', 'local', 'replacement'])
  })

  it('marks a mid stop of the zone line as request-only (pickup_type=3)', async () => {
    const schedule = await loadSchedule(createMockClient(WAW), WAW)
    const route = schedule.routes.find((r) => r.shortName === '712')!
    const stops = lineDetail(schedule, route.id)!.directions[0].stops
    expect(stops.map((s) => s.onRequest)).toEqual([false, true, false])
  })

  it('serves alerts for date text, a long body, a second alert on 20 and an unknown effect', async () => {
    const { alerts } = await mockAlertFeed(WAW)()
    const forRoute = (line: string) => alerts.filter((a) => a.routes.includes(line))
    expect(forRoute('20').length).toBe(2)
    expect(forRoute('999').length).toBe(1)
    expect(forRoute('M1').map((a) => a.id)).toEqual(forRoute('128').map((a) => a.id))
    expect(forRoute('M1')[0].body).toMatch(/od .+ do /)
    expect(forRoute('N16')[0].body.length).toBeGreaterThan(400)
    expect(alerts.some((a) => !['REDUCED_SERVICE', 'DETOUR', 'OTHER_EFFECT', 'MODIFIED_SERVICE', 'STOP_MOVED'].includes(a.effect))).toBe(true)
  })

  it('serves vehicles on the new lines and one with a stale timestamp, the fresh one first', async () => {
    const { positions } = await mockVehicleFeed(WAW)()
    expect(positions[0].tripId).toBe('20-wd-0-1')
    for (const trip of ['712/1', 'L-1/1', 'Z1/1']) expect(positions.some((p) => p.tripId === trip)).toBe(true)
    const ages = positions.map((p) => Date.now() - Date.parse(p.timestamp))
    expect(ages[0]).toBeLessThan(60_000)
    expect(ages.some((a) => a > 10 * 60_000)).toBe(true)
  })
})

