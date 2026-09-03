import { describe, expect, it, vi } from 'vitest'

const searchStations = vi.fn(async (query: string) =>
  query === 'Warszawa'
    ? [
        { id: '33605', name: 'Warszawa Centralna' },
        { id: '7500', name: 'Warszawa Zachodnia' },
        { id: '80416', name: 'Kraków Główny' },
      ]
    : []
)

vi.mock('@/lib/board/instance', () => ({
  client: { searchStations: (...args: [string]) => searchStations(...args) },
}))

vi.mock('@/lib/gtfs/instance', () => ({
  enabledGtfsCities: () => [{ id: 'warszawa' }],
  peekGtfsPoller: () => null,
}))

async function call() {
  const { GET } = await import('./route')
  const response = await GET()
  return { response, body: await response.json() }
}

describe('GET /api/cities', () => {
  it('returns the registry with rail stations filtered by the name prefix', async () => {
    const { body } = await call()
    const warszawa = body.cities.find((c: { id: string }) => c.id === 'warszawa')
    expect(warszawa.name).toBe('Warszawa')
    expect(warszawa.hasTransit).toBe(true)
    expect(warszawa.railStations.map((s: { name: string }) => s.name)).toEqual([
      'Warszawa Centralna',
      'Warszawa Zachodnia',
    ])
    // "Kraków Główny" nie pasuje do prefiksu "Warszawa " — odsiane.
    // Rozkład jeszcze nie wczytany (peekGtfsPoller → null) — pola null/idle, nie 0.
    expect(warszawa.schedule.state).toBe('idle')
    expect(warszawa.lineCounts).toBeNull()
    expect(warszawa.stopGroupCount).toBeNull()
  })

  it('degrades to an empty rail station list when the dictionary lookup fails', async () => {
    searchStations.mockRejectedValueOnce(new Error('down'))
    const { body } = await call()
    expect(body.cities[0].railStations).toEqual([])
  })
})
