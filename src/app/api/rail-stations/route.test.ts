import { beforeEach, describe, expect, it, vi } from 'vitest'

const searchStations = vi.fn(async (query: string) =>
  query === 'Warszawa'
    ? [
        { id: '33605', name: 'Warszawa Centralna' },
        { id: '7500', name: 'Warszawa Zachodnia' },
      ]
    : []
)

const getSnapshot = vi.fn((id: string) => {
  if (id !== '33605') return undefined
  const now = Date.now()
  return {
    stationId: '33605',
    stationName: 'Warszawa Centralna',
    departures: [
      { plannedAt: new Date(now + 5 * 60_000).toISOString(), headsign: 'Kutno' as string | null, delayMinutes: 6, status: 'delayed' },
      { plannedAt: new Date(now - 5 * 60_000).toISOString(), headsign: 'Skierniewice' as string | null, delayMinutes: 0, status: 'onTime' },
      { plannedAt: new Date(now + 20 * 60_000).toISOString(), headsign: 'Łódź Fabryczna' as string | null, delayMinutes: null, status: 'onTime' },
    ],
    arrivals: [],
    fetchedAt: new Date(now - 10_000).toISOString(),
  }
})

const registerInterest = vi.fn()

vi.mock('@/lib/board/instance', () => ({
  client: { searchStations: (...args: [string]) => searchStations(...args) },
  poller: { getSnapshot: (...args: [string]) => getSnapshot(...args), registerInterest },
}))

vi.mock('@/lib/weather/coordinates', () => ({
  getStationCoordinatesEntry: vi.fn(async (id: string) => {
    if (id === '33605') return { name: 'Warszawa Centralna', lat: 52.2288207, lon: 21.00316, source: 'station' }
    if (id === '7500') return { name: 'Warszawa Zachodnia', lat: null, lon: null, source: 'failed' }
    return null
  }),
}))

async function call(city: string) {
  const { GET } = await import('./route')
  const response = await GET(new Request(`http://localhost/api/rail-stations?city=${city}`))
  return { response, body: await response.json() }
}

describe('GET /api/rail-stations', () => {
  // `resolveCityRailStations` (`src/lib/board/railStations.ts`) cache'uje
  // teraz wynik wyszukania stacji per miasto (Fix 3, AGENTS.md #3) -- bez
  // resetu modułów drugi `call('warszawa')` w tym samym pliku trafiałby w
  // cache pierwszego zamiast wołać `searchStations` ponownie, gubiąc
  // `mockImplementationOnce`/`mockRejectedValueOnce` ustawione niżej.
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns 404 for a city outside the registry', async () => {
    const { response } = await call('atlantyda')
    expect(response.status).toBe(404)
  })

  it('returns 400 for a malformed city param', async () => {
    const { response } = await call('123')
    expect(response.status).toBe(400)
  })

  it('returns 400 when the city param is missing entirely', async () => {
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/rail-stations'))
    expect(response.status).toBe(400)
  })

  it('never registers interest in the poller', async () => {
    await call('warszawa')
    expect(registerInterest).not.toHaveBeenCalled()
  })

  it('drops a station without usable coordinates instead of failing the whole response', async () => {
    const { body } = await call('warszawa')
    expect(body.stations.map((s: { id: string }) => s.id)).toEqual(['33605'])
  })

  it('reports status:null and nextDepartures:null for a station never watched by the poller', async () => {
    searchStations.mockImplementationOnce(async () => [{ id: '999', name: 'Warszawa Nigdzie' }])
    vi.mocked((await import('@/lib/weather/coordinates')).getStationCoordinatesEntry).mockImplementationOnce(
      async () => ({ name: 'Warszawa Nigdzie', lat: 52.0, lon: 21.0, source: 'station' })
    )
    const { body } = await call('warszawa')
    const entry = body.stations.find((s: { id: string }) => s.id === '999')
    expect(entry.status).toBeNull()
    expect(entry.nextDepartures).toBeNull()
    expect(entry.ageMs).toBeNull()
  })

  it('returns only upcoming departures, sorted-limited to 3, with the lead status', async () => {
    const { body } = await call('warszawa')
    const entry = body.stations.find((s: { id: string }) => s.id === '33605')
    expect(entry.status).toBe('delayed')
    expect(entry.nextDepartures).toHaveLength(2)
    expect(entry.nextDepartures.map((d: { headsign: string }) => d.headsign)).toEqual(['Kutno', 'Łódź Fabryczna'])
    expect(typeof entry.ageMs).toBe('number')
    expect(entry.coordSource).toBe('station')
  })

  it('passes through a null headsign as null, not an empty string or dash', async () => {
    getSnapshot.mockImplementationOnce((id: string) => {
      if (id !== '33605') return undefined
      const now = Date.now()
      return {
        stationId: '33605',
        stationName: 'Warszawa Centralna',
        departures: [{ plannedAt: new Date(now + 5 * 60_000).toISOString(), headsign: null, delayMinutes: 0, status: 'onTime' }],
        arrivals: [],
        fetchedAt: new Date(now - 10_000).toISOString(),
      }
    })
    const { body } = await call('warszawa')
    const entry = body.stations.find((s: { id: string }) => s.id === '33605')
    expect(entry.nextDepartures).toEqual([{ plannedAt: expect.any(String), headsign: null, delayMinutes: 0, status: 'onTime' }])
  })

  it('reports status "unknown" and an empty list when the snapshot has no upcoming departures', async () => {
    getSnapshot.mockImplementationOnce((id: string) => {
      if (id !== '33605') return undefined
      const now = Date.now()
      return {
        stationId: '33605',
        stationName: 'Warszawa Centralna',
        departures: [{ plannedAt: new Date(now - 5 * 60_000).toISOString(), headsign: 'Kutno', delayMinutes: 0, status: 'onTime' }],
        arrivals: [],
        fetchedAt: new Date(now - 10_000).toISOString(),
      }
    })
    const { body } = await call('warszawa')
    const entry = body.stations.find((s: { id: string }) => s.id === '33605')
    expect(entry.status).toBe('unknown')
    expect(entry.nextDepartures).toEqual([])
  })

  it('degrades to an empty station list when the dictionary lookup fails, not a 500', async () => {
    searchStations.mockRejectedValueOnce(new Error('down'))
    const { response, body } = await call('warszawa')
    expect(response.status).toBe(200)
    expect(body.stations).toEqual([])
  })
})
