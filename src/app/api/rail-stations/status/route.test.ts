import { describe, expect, it, vi } from 'vitest'

const registerInterest = vi.fn()
const getSnapshot = vi.fn((id: string) =>
  id === '33605' ? { stationId: '33605', departures: [], fetchedAt: new Date().toISOString() } : undefined
)
vi.mock('@/lib/board/instance', () => ({ poller: { getSnapshot: (id: string) => getSnapshot(id), registerInterest } }))

const getMapRailStations = vi.fn(async () => [
  { id: '33605', name: 'Warszawa Centralna', lat: 52.23, lon: 21.0, tier: 1 },
  { id: '80416', name: 'Kraków Główny', lat: 50.07, lon: 19.95, tier: 1 },
])
vi.mock('@/lib/weather/coordinates', () => ({ getMapRailStations: () => getMapRailStations() }))

describe('GET /api/rail-stations/status', () => {
  it('returns only stations the poller already holds, never registering interest', async () => {
    const { GET } = await import('./route')
    const body = await (await GET()).json()
    expect(body.stations.map((s: { id: string }) => s.id)).toEqual(['33605'])
    expect(body.stations[0].status).toBe('unknown')
    expect(getSnapshot).toHaveBeenCalledWith('80416')
    expect(registerInterest).not.toHaveBeenCalled()
  })

  it('answers 500 when the station list cannot be read', async () => {
    getMapRailStations.mockRejectedValueOnce(new Error('ENOENT'))
    const { GET } = await import('./route')
    expect((await GET()).status).toBe(500)
  })
})
