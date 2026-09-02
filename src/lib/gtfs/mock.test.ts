import { cp, mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { serviceDateWindow } from '@/lib/pkp/time'
import { getCity, type CityFeed } from './cities'
import { loadSchedule } from './loader'
import { __resetMockCache, createMockClient } from './mock'
import { nextDepartures } from './query'

const FIXTURE_ROOT = path.join(process.cwd(), 'fixtures', 'gtfs')
const WAW = getCity('waw') as CityFeed
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
    await cp(path.join(FIXTURE_ROOT, 'waw'), path.join(root, 'x'), { recursive: true })
    // routes.txt kopiowany z waw kończy się newline; to i tak przechodzi.
    const lines: string[] = []
    for await (const line of (await createMockClient({ ...WAW, id: 'x' }, root).readEntry('routes.txt')) ?? []) {
      lines.push(line)
    }
    expect(lines[0]).toContain('route_id')
    expect(lines.some((line) => line.startsWith('M1,'))).toBe(true)
  })
})

describe('loadSchedule on the waw fixtures (end to end, no network)', () => {
  it('parses routes, dropping an invalid colour to null and computing text colour', async () => {
    const schedule = await loadSchedule(createMockClient(WAW), WAW)
    const s2 = schedule.routes.find((route) => route.id === 'S2')
    expect(s2?.color).toBeNull() // route_color "ZZ12GG" — odrzucony przez strażnik
    const m1 = schedule.routes.find((route) => route.id === 'M1')
    expect(m1?.color).toBe('#0000bb')
    expect(m1?.textColor).toBe('#ffffff')
    // M2 ma route_color === route_text_color w feedzie — my liczymy kontrast sami.
    const m2 = schedule.routes.find((route) => route.id === 'M2')
    expect(m2?.textColor).toBe('#ffffff')
  })

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
    const root = await mkdtemp(path.join(tmpdir(), 'gtfs-krk-'))
    await cp(path.join(FIXTURE_ROOT, 'waw'), path.join(root, 'krk'), { recursive: true })

    const krk: CityFeed = {
      id: 'krk',
      name: 'Kraków',
      staticUrl: 'https://example.test/krk.zip',
      vehiclesUrl: null,
      alertsUrl: null,
      railStationPrefix: 'Kraków ',
      timezone: 'Europe/Warsaw',
    }

    const schedule = await loadSchedule(createMockClient(krk, root), krk)
    expect(await readdir(path.join(root, 'krk'))).toContain('stop_times.txt')
    expect(schedule.routes.length).toBeGreaterThan(0)

    const [today] = [serviceDateWindow(new Date(), krk.timezone)[1]]
    const departures = nextDepartures(schedule, ['1001'], Date.parse(`${today}T11:00:00+02:00`), 5)
    expect(departures.length).toBeGreaterThan(0)
    expect(departures[0].serviceDate).toBe(today)
  })
})
