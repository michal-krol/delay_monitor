import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/board/instance', () => ({
  poller: {
    registerInterest: vi.fn(),
    getSnapshot: vi.fn((id: string) =>
      id === '5100'
        ? { stationId: '5100', stationName: 'Warszawa Centralna', departures: [], arrivals: [], fetchedAt: new Date().toISOString() }
        : undefined
    ),
    getBudget: vi.fn(() => ({ hourly: 90, daily: 950 })),
    getStatus: vi.fn(() => 'ok'),
  },
}))

describe('GET /api/board', () => {
  it('returns 400 when the stations parameter is missing', async () => {
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/board'))
    expect(response.status).toBe(400)
  })

  it('registers interest and returns snapshots with age for known stations, null for unknown', async () => {
    const { GET } = await import('./route')
    const { poller } = await import('@/lib/board/instance')
    const response = await GET(new Request('http://localhost/api/board?stations=5100,9999'))
    const body = await response.json()

    expect(poller.registerInterest).toHaveBeenCalledWith(['5100', '9999'])
    expect(body.snapshots[0].stationId).toBe('5100')
    expect(typeof body.snapshots[0].ageMs).toBe('number')
    expect(body.snapshots[1]).toBeNull()
    expect(body.budget).toEqual({ hourly: 90, daily: 950 })
    expect(body.status).toBe('ok')
  })
})
