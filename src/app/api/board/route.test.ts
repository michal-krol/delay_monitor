import { describe, expect, it, vi } from 'vitest'

// Domyślnie słownik zna trzy stacje; poszczególne testy podmieniają to,
// żeby sprawdzić także zimny start (słownik jeszcze niewczytany → null).
const getCachedStationIds = vi.fn<() => ReadonlySet<string> | null>(
  () => new Set(['5100', '5136', '4900'])
)

vi.mock('@/lib/board/instance', () => ({
  client: { getCachedStationIds: (...args: []) => getCachedStationIds(...args) },
  poller: {
    registerInterest: vi.fn(),
    getSnapshot: vi.fn((id: string) =>
      id === '5100'
        ? { stationId: '5100', stationName: 'Warszawa Centralna', departures: [], arrivals: [], fetchedAt: new Date().toISOString() }
        : undefined
    ),
    getBudget: vi.fn(() => ({ hourly: 90, daily: 950 })),
    getStatus: vi.fn(() => 'ok'),
    isThrottled: vi.fn(() => false),
    getDiagnostics: vi.fn(() => ({ realizationStale: false, operations: { incomplete: false } })),
  },
}))

describe('GET /api/board', () => {
  it('returns 400 when the stations parameter is missing', async () => {
    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/board'))
    expect(response.status).toBe(400)
  })

  it('registers interest and returns snapshots with age for stations that have data, null for the rest', async () => {
    // 5136 jest w slowniku, ale poller nie ma dla niej jeszcze snapshotu —
    // to inny przypadek niz ID spoza slownika (osobny test nizej).
    const { GET } = await import('./route')
    const { poller } = await import('@/lib/board/instance')
    const response = await GET(new Request('http://localhost/api/board?stations=5100,5136'))
    const body = await response.json()

    expect(poller.registerInterest).toHaveBeenCalledWith(['5100', '5136'])
    expect(body.snapshots[0].stationId).toBe('5100')
    expect(typeof body.snapshots[0].ageMs).toBe('number')
    expect(body.snapshots[1]).toBeNull()
    expect(body.budget).toEqual({ hourly: 90, daily: 950 })
    expect(body.status).toBe('ok')
    expect(body.throttled).toBe(false)
  })

  it('rejects station ids that are not plain numbers', async () => {
    // Identyfikatory trafiaja do zapytania kierowanego do PKP. Klient je koduje,
    // ale odrzucenie smieci u wejscia jest tansze niz poleganie na jednej warstwie.
    const { GET } = await import('./route')
    const { poller } = await import('@/lib/board/instance')
    vi.mocked(poller.registerInterest).mockClear()

    for (const bad of ['5100&pageSize=5000', '5100#', 'abc', '../5100', '5100 OR 1=1', '-1']) {
      const response = await GET(new Request(`http://localhost/api/board?stations=${encodeURIComponent(bad)}`))
      expect(response.status, `powinno odrzucic: ${bad}`).toBe(400)
    }

    expect(poller.registerInterest).not.toHaveBeenCalled()
  })

  it('rejects an unbounded list of stations', async () => {
    // Bez limitu rosnie mapa `interest` w pollerze i URL wysylany do PKP.
    const { GET } = await import('./route')
    const many = Array.from({ length: 10000 }, (_, i) => String(i)).join(',')

    const response = await GET(new Request(`http://localhost/api/board?stations=${many}`))

    expect(response.status).toBe(400)
  })

  it('accepts a realistic number of favourite stations', async () => {
    const { GET } = await import('./route')
    const realistic = Array.from({ length: 12 }, (_, i) => String(5100 + i)).join(',')

    const response = await GET(new Request(`http://localhost/api/board?stations=${realistic}`))

    expect(response.status).toBe(200)
  })

  it('deduplicates repeated station ids', async () => {
    const { GET } = await import('./route')
    const { poller } = await import('@/lib/board/instance')
    vi.mocked(poller.registerInterest).mockClear()

    await GET(new Request('http://localhost/api/board?stations=5100,5100,5100'))

    expect(poller.registerInterest).toHaveBeenCalledWith(['5100'])
  })

  it('never lets the poller watch a station that is not in the dictionary', async () => {
    // Kazde nieznane ID trafiajace do pollera to potencjalne zapytanie do PKP.
    // Odrzucamy je u wejscia, zeby atakujacy nie mogl sterowac tym, o co
    // odpytujemy zewnetrzne API.
    const { GET } = await import('./route')
    const { poller } = await import('@/lib/board/instance')
    vi.mocked(poller.registerInterest).mockClear()

    const response = await GET(new Request('http://localhost/api/board?stations=5100,999999'))
    const body = await response.json()

    expect(poller.registerInterest).toHaveBeenCalledWith(['5100'])
    // Nieznana stacja nadal dostaje miejsce w odpowiedzi, tyle ze puste —
    // jeden nieaktualny wpis w ulubionych nie moze wywrocic calego dashboardu.
    expect(response.status).toBe(200)
    expect(body.snapshots).toHaveLength(2)
    expect(body.snapshots[1]).toBeNull()
  })

  it('does not call the poller at all when every station is unknown', async () => {
    const { GET } = await import('./route')
    const { poller } = await import('@/lib/board/instance')
    vi.mocked(poller.registerInterest).mockClear()

    const response = await GET(new Request('http://localhost/api/board?stations=888888,999999'))

    expect(poller.registerInterest).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
  })

  it('falls back to trusting the caller while the dictionary is still loading', async () => {
    // Route handler nigdy nie czeka na PKP, wiec przy zimnym starcie slownika
    // po prostu go nie ma. Blokowanie wszystkiego byloby gorsze niz przepuszczenie
    // — pozostale warstwy (format, limit liczby, pula wymuszen) nadal dzialaja.
    const { GET } = await import('./route')
    const { poller } = await import('@/lib/board/instance')
    vi.mocked(poller.registerInterest).mockClear()
    getCachedStationIds.mockReturnValueOnce(null)

    await GET(new Request('http://localhost/api/board?stations=5100,999999'))

    expect(poller.registerInterest).toHaveBeenCalledWith(['5100', '999999'])
  })

  it('flags realizationIncomplete when the poller could not fetch every /operations page', async () => {
    // Niepełna realizacja: część pociągów bez dopasowania pokaże się jako
    // „jeszcze nie wyjechał" mimo że jadą — UI musi to zasygnalizować (baner).
    const { GET } = await import('./route')
    const { poller } = await import('@/lib/board/instance')
    vi.mocked(poller.getDiagnostics).mockReturnValueOnce({
      realizationStale: false,
      operations: { incomplete: true },
    } as ReturnType<typeof poller.getDiagnostics>)

    const response = await GET(new Request('http://localhost/api/board?stations=5100'))
    const body = await response.json()

    expect(body.realizationIncomplete).toBe(true)
  })

  it('passes the poller throttling flag through to the client', async () => {
    const { GET } = await import('./route')
    const { poller } = await import('@/lib/board/instance')
    vi.mocked(poller.isThrottled).mockReturnValueOnce(true)

    const response = await GET(new Request('http://localhost/api/board?stations=5100'))
    const body = await response.json()

    expect(body.throttled).toBe(true)
  })
})
