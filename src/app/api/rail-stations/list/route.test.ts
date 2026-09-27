import { describe, expect, it, vi } from 'vitest'

const getMapRailStations = vi.fn()
vi.mock('@/lib/weather/coordinates', () => ({ getMapRailStations: () => getMapRailStations() }))

describe('GET /api/rail-stations/list', () => {
  it('returns the static station list with a browser cache header', async () => {
    getMapRailStations.mockResolvedValueOnce([{ id: '33605', name: 'Warszawa Centralna', lat: 52.23, lon: 21.0, tier: 1 }])
    const { GET } = await import('./route')
    const response = await GET()
    expect(await response.json()).toEqual({ stations: [{ id: '33605', name: 'Warszawa Centralna', lat: 52.23, lon: 21.0, tier: 1 }] })
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
  })

  it('answers 500 without caching when the coordinates file cannot be read', async () => {
    getMapRailStations.mockRejectedValueOnce(new Error('ENOENT'))
    const { GET } = await import('./route')
    const response = await GET()
    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBeNull()
  })
})
