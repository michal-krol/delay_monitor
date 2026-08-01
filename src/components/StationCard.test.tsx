// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StationCard } from './StationCard'

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('StationCard', () => {
  it('shows the station name and up to 3 departures with delay text (not color-only)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        jsonResponse({
          snapshots: [
            {
              stationId: '5100',
              stationName: 'Warszawa Centralna',
              departures: [
                { trainNumber: '1', carrier: 'IC', category: 'EIC', headsign: 'Kraków', plannedAt: new Date().toISOString(), actualAt: null, delayMinutes: 5, status: 'delayed', platform: '1' },
              ],
              arrivals: [],
              fetchedAt: new Date().toISOString(),
              ageMs: 1000,
            },
          ],
          budget: undefined,
          status: 'ok',
        })
      )
    )

    render(<StationCard stationId="5100" stationName="Warszawa Centralna" onExpand={vi.fn()} />)

    expect(screen.getByText('Warszawa Centralna')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('+5 min')).toBeInTheDocument())
  })

  it('calls onExpand with the station id and name when clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [null], budget: undefined, status: 'ok' })))
    const onExpand = vi.fn()
    const user = userEvent.setup()

    render(<StationCard stationId="5100" stationName="Warszawa Centralna" onExpand={onExpand} />)
    await user.click(screen.getByRole('button'))

    expect(onExpand).toHaveBeenCalledWith({ id: '5100', name: 'Warszawa Centralna' })
  })

  it('shows the empty-station message instead of an error when there are no departures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        jsonResponse({
          snapshots: [{ stationId: '5100', stationName: 'X', departures: [], arrivals: [], fetchedAt: new Date().toISOString(), ageMs: 0 }],
          budget: undefined,
          status: 'ok',
        })
      )
    )

    render(<StationCard stationId="5100" stationName="X" onExpand={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Brak odjazdów w najbliższych godzinach')).toBeInTheDocument())
  })

  it('shows the absolute last-updated date and time instead of a relative age', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        jsonResponse({
          snapshots: [
            {
              stationId: '5100',
              stationName: 'X',
              departures: [],
              arrivals: [],
              fetchedAt: '2026-08-01T20:24:11.827Z',
              ageMs: 15000,
            },
          ],
          budget: undefined,
          status: 'ok',
        })
      )
    )

    render(<StationCard stationId="5100" stationName="X" onExpand={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Ostatnia aktualizacja:/)).toBeInTheDocument())
    expect(screen.queryByText(/temu/)).not.toBeInTheDocument()
  })
})
