// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const FAVOURITES = [
  { id: '5100', name: 'Warszawa Centralna' },
  { id: '5136', name: 'Kraków Główny' },
]

describe('Dashboard', () => {
  it('fetches both favourites in a single request', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({
        snapshots: [
          { stationId: '5100', stationName: 'Warszawa Centralna', departures: [], arrivals: [], fetchedAt: '2026-08-01T20:24:11.827Z', ageMs: 0 },
          { stationId: '5136', stationName: 'Kraków Główny', departures: [], arrivals: [], fetchedAt: '2026-08-01T20:24:11.827Z', ageMs: 0 },
        ],
        budget: undefined,
        status: 'ok',
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<Dashboard favourites={FAVOURITES} onExpand={vi.fn()} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/board?stations=5100,5136'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows a single global last-updated line, not one per card', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({
        snapshots: [
          { stationId: '5100', stationName: 'Warszawa Centralna', departures: [], arrivals: [], fetchedAt: '2026-08-01T20:24:11.827Z', ageMs: 0 },
          { stationId: '5136', stationName: 'Kraków Główny', departures: [], arrivals: [], fetchedAt: '2026-08-01T20:24:11.827Z', ageMs: 0 },
        ],
        budget: undefined,
        status: 'ok',
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<Dashboard favourites={FAVOURITES} onExpand={vi.fn()} />)

    await waitFor(() => expect(screen.getAllByText(/Ostatnia aktualizacja:/)).toHaveLength(1))
  })

  it('passes each snapshot to the matching station card by id order', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({
        snapshots: [
          {
            stationId: '5100',
            stationName: 'Warszawa Centralna',
            departures: [{ trainNumber: '1', carrier: 'IC', category: 'EIC', headsign: 'Kraków', plannedAt: new Date().toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime', platform: '1' }],
            arrivals: [],
            fetchedAt: '2026-08-01T20:24:11.827Z',
            ageMs: 0,
          },
          null,
        ],
        budget: undefined,
        status: 'ok',
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<Dashboard favourites={FAVOURITES} onExpand={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('PKP Intercity')).toBeInTheDocument())
    expect(screen.getByText('Kraków Główny')).toBeInTheDocument()
    expect(screen.getAllByText('Ładowanie…')).toHaveLength(1)
  })
})
