// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'
import type { Favourite } from '@/hooks/useFavourites'
import { jsonResponse } from '@/test-utils/http'

// BoardTable (rendered via FocusedStation in the focused branch) navigates via useRouter().
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Karty przystanków miejskich odpytują własny endpoint — mockujemy hook.
vi.mock('@/hooks/useTransitBoard', () => ({
  useTransitBoard: () => ({
    data: { stops: [{ stopId: '7014M', name: 'Świętokrzyska', modes: ['metro'], departures: [] }], schedule: { state: 'ready' }, attribution: [] },
    error: null,
  }),
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

const FAVOURITES: Favourite[] = [
  { kind: 'pkp', id: '5100', name: 'Warszawa Centralna' },
  { kind: 'pkp', id: '5136', name: 'Kraków Główny' },
]

/** Karta na dashboardzie znaleziona po nazwie stacji w jej nagłówku. */
function findCardByHeading(name: string): HTMLElement {
  const card = screen.getAllByRole('article').find((article) => within(article).queryByRole('heading', { name }))
  if (!card) throw new Error(`Nie znaleziono karty z nagłówkiem: ${name}`)
  return card
}

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

    render(
      <Dashboard
        favourites={FAVOURITES}
        onExpand={vi.fn()}
        onRemove={vi.fn()}
      />
    )

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

    render(
      <Dashboard
        favourites={FAVOURITES}
        onExpand={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    await waitFor(() => expect(screen.getAllByText(/Ostatnia aktualizacja:/)).toHaveLength(1))
  })

  it('passes each snapshot to the matching station card by id order', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({
        snapshots: [
          {
            stationId: '5100',
            stationName: 'Warszawa Centralna',
            departures: [{ trainNumber: '1', carrier: 'IC', carrierName: 'PKP Intercity', category: 'EIC', headsign: 'Kraków', plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime', platform: '1' }],
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

    render(
      <Dashboard
        favourites={FAVOURITES}
        onExpand={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(await screen.findByText('IC')).toBeInTheDocument()
    expect(screen.getByText('Kraków Główny')).toBeInTheDocument()
    expect(screen.getAllByText('Ładowanie…')).toHaveLength(1)
  })

  it('matches snapshots to cards by station id, not by array position', async () => {
    // Serwer odsyła stacje w innej kolejności niż lista ulubionych. Przy
    // dopasowaniu po indeksie Warszawa dostałaby odjazdy Krakowa.
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({
        snapshots: [
          {
            stationId: '5136',
            stationName: 'Kraków Główny',
            departures: [{ trainNumber: '2', carrier: 'KM', carrierName: 'Koleje Mazowieckie', category: 'REG', headsign: 'Katowice', plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime', platform: null }],
            arrivals: [],
            fetchedAt: '2026-08-01T20:24:11.827Z',
            ageMs: 0,
          },
          {
            stationId: '5100',
            stationName: 'Warszawa Centralna',
            departures: [{ trainNumber: '1', carrier: 'IC', carrierName: 'PKP Intercity', category: 'EIC', headsign: 'Kraków', plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime', platform: null }],
            arrivals: [],
            fetchedAt: '2026-08-01T20:24:11.827Z',
            ageMs: 0,
          },
        ],
        budget: undefined,
        status: 'ok',
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <Dashboard
        favourites={FAVOURITES}
        onExpand={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(await screen.findByText('IC')).toBeInTheDocument()

    const warsawCard = findCardByHeading('Warszawa Centralna')
    const krakowCard = findCardByHeading('Kraków Główny')

    expect(warsawCard).toHaveTextContent('IC')
    expect(krakowCard).toHaveTextContent('KM')
  })

  it('reports which station the remove button belongs to', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({ snapshots: [null, null], budget: undefined, status: 'ok', throttled: false })
    )
    vi.stubGlobal('fetch', fetchMock)
    const onRemove = vi.fn()
    const user = userEvent.setup()

    render(
      <Dashboard
        favourites={FAVOURITES}
        onExpand={vi.fn()}
        onRemove={onRemove}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Usuń z ulubionych: Kraków Główny' }))

    expect(onRemove).toHaveBeenCalledWith('pkp:5136')
  })

  it('renders a transit stop card for a gtfs favourite alongside station cards (Pulpit is above cities)', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ snapshots: [null, null], budget: undefined, status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <Dashboard
        favourites={[...FAVOURITES, { kind: 'gtfs', city: 'warszawa', id: '7014M', name: 'Świętokrzyska' }]}
        onExpand={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(await screen.findByRole('heading', { name: 'Świętokrzyska' })).toBeInTheDocument()
    expect(screen.getByText('Rozkład — warszawa')).toBeInTheDocument()
  })

  it('drops stale snapshots for stations that are no longer favourites', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({
        snapshots: [
          {
            stationId: '5100',
            stationName: 'Warszawa Centralna',
            departures: [{ trainNumber: '1', carrier: 'IC', carrierName: 'PKP Intercity', category: 'EIC', headsign: 'Kraków', plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime', platform: null }],
            arrivals: [],
            fetchedAt: '2026-08-01T20:24:11.827Z',
            ageMs: 0,
          },
          {
            stationId: '5136',
            stationName: 'Kraków Główny',
            departures: [{ trainNumber: '2', carrier: 'KM', carrierName: 'Koleje Mazowieckie', category: 'REG', headsign: 'Katowice', plannedAt: new Date(Date.now() + 5 * 60000).toISOString(), actualAt: null, delayMinutes: 0, status: 'onTime', platform: null }],
            arrivals: [],
            fetchedAt: '2026-08-01T20:24:11.827Z',
            ageMs: 0,
          },
        ],
        budget: undefined,
        status: 'ok',
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(
      <Dashboard
        favourites={FAVOURITES}
        onExpand={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(await screen.findByText('IC')).toBeInTheDocument()

    // Warszawa usunieta z ulubionych; odpowiedz w pamieci wciaz zawiera obie
    // stacje, bo nowy fetch jeszcze nie wrocil.
    rerender(
      <Dashboard
        favourites={[FAVOURITES[1]]}
        onExpand={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    const krakowCard = findCardByHeading('Kraków Główny')
    expect(krakowCard).toHaveTextContent('KM')
    expect(screen.queryByText('IC')).not.toBeInTheDocument()
  })




})
