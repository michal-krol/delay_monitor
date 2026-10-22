// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'
import type { PinnedItem } from '@/hooks/usePinned'
import { jsonResponse } from '@/test-utils/http'

// BoardTable (rendered via FocusedStation in the focused branch) navigates via useRouter().
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Karty przystanków miejskich odpytują własny endpoint — mockujemy hook.
const DEFAULT_TRANSIT_BOARD = {
  data: { stops: [{ stopId: '7014M', name: 'Świętokrzyska', modes: ['metro'], departures: [] }], schedule: { state: 'ready' }, attribution: [] },
  error: null,
}
const { useTransitBoard } = vi.hoisted(() => ({ useTransitBoard: vi.fn() }))
vi.mock('@/hooks/useTransitBoard', () => ({ useTransitBoard }))
beforeEach(() => useTransitBoard.mockReturnValue(DEFAULT_TRANSIT_BOARD))

afterEach(() => {
  vi.unstubAllGlobals()
})

const PINNED_ITEMS: PinnedItem[] = [
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
  it('GTFS-only pins do not show a disabled PKP loading clock', () => {
    render(<Dashboard pinnedItems={[{ kind: 'gtfs', city: 'warszawa', id: '7014M', name: 'Świętokrzyska' }]} onRemove={vi.fn()} />)
    expect(screen.queryByText('Wczytywanie…')).toBeNull()
    expect(screen.queryByRole('button', { name: /odśwież teraz/ })).toBeNull()
  })

  it('fetches both pinnedItems in a single request', async () => {
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
        pinnedItems={PINNED_ITEMS}
        onRemove={vi.fn()}
      />
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/board?stations=5100%2C5136'))
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
        pinnedItems={PINNED_ITEMS}
        onRemove={vi.fn()}
      />
    )

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Aktualizacja .* — odśwież teraz$/ })).toHaveLength(1))
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
        pinnedItems={PINNED_ITEMS}
        onRemove={vi.fn()}
      />
    )

    expect(await screen.findByText('Kraków')).toBeInTheDocument()
    expect(screen.getByText('Kraków Główny')).toBeInTheDocument()
    expect(screen.getAllByText('Wczytywanie…')).toHaveLength(1)
  })

  it('matches snapshots to cards by station id, not by array position', async () => {
    // Serwer odsyła stacje w innej kolejności niż lista przypiętych. Przy
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
        pinnedItems={PINNED_ITEMS}
        onRemove={vi.fn()}
      />
    )

    expect(await screen.findByText('Kraków')).toBeInTheDocument()

    const warsawCard = findCardByHeading('Warszawa Centralna')
    const krakowCard = findCardByHeading('Kraków Główny')

    expect(warsawCard).toHaveTextContent('Kraków')
    expect(krakowCard).toHaveTextContent('Katowice')
  })

  it('cards carry no unpin star — unpinning lives in edit mode only', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [null, null], budget: undefined, status: 'ok' })))

    render(<Dashboard pinnedItems={PINNED_ITEMS} onRemove={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /Odepnij ze Startu/ })).not.toBeInTheDocument()
  })

  it('renders PKP and city cards in one shared pinned order, not grouped by kind', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [null, null], budget: undefined, status: 'ok' })))
    const mixed: PinnedItem[] = [PINNED_ITEMS[0], { kind: 'gtfs', city: 'warszawa', id: '7014M', name: 'Świętokrzyska' }, PINNED_ITEMS[1]]

    render(<Dashboard pinnedItems={mixed} onRemove={vi.fn()} />)

    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings).toEqual(['Warszawa Centralna', 'Świętokrzyska', 'Kraków Główny'])
  })

  it('edit mode lists every pin with up, down and unpin buttons naming the item', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [null, null], budget: undefined, status: 'ok' })))
    const onRemove = vi.fn()
    const onMove = vi.fn()
    const user = userEvent.setup()

    render(<Dashboard pinnedItems={PINNED_ITEMS} onRemove={onRemove} editing onMove={onMove} />)

    const list = screen.getByRole('list', { name: 'Kolejność przypiętych' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'W górę: Kraków Główny' }))
    expect(onMove).toHaveBeenCalledWith('pkp:5136', -1)
    await user.click(screen.getByRole('button', { name: 'W dół: Warszawa Centralna' }))
    expect(onMove).toHaveBeenCalledWith('pkp:5100', 1)
    await user.click(screen.getByRole('button', { name: 'Odepnij ze Startu: Kraków Główny' }))
    expect(onRemove).toHaveBeenCalledWith('pkp:5136')
  })

  it('edit mode marks moves past the ends as unavailable but keeps the buttons focusable', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [null, null], budget: undefined, status: 'ok' })))

    render(<Dashboard pinnedItems={PINNED_ITEMS} onRemove={vi.fn()} editing onMove={vi.fn()} />)

    // aria-disabled, nie `disabled`: przycisk, który właśnie dojechał na kraniec, nie gubi fokusu.
    expect(screen.getByRole('button', { name: 'W górę: Warszawa Centralna' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'W dół: Kraków Główny' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'W dół: Warszawa Centralna' })).not.toHaveAttribute('aria-disabled')
  })

  it('renders a transit stop card for a gtfs pinned item alongside station cards (Pulpit is above cities)', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ snapshots: [null, null], budget: undefined, status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <Dashboard
        pinnedItems={[...PINNED_ITEMS, { kind: 'gtfs', city: 'warszawa', id: '7014M', name: 'Świętokrzyska' }]}
        onRemove={vi.fn()}
      />
    )

    expect(await screen.findByRole('heading', { name: 'Świętokrzyska' })).toBeInTheDocument()
    expect(screen.getByText('Metro · Rozkład — warszawa')).toBeInTheDocument()
  })

  it('drops stale snapshots for stations that are no longer pinnedItems', async () => {
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
        pinnedItems={PINNED_ITEMS}
        onRemove={vi.fn()}
      />
    )
    expect(await screen.findByText('Kraków')).toBeInTheDocument()

    // Warszawa usunieta z przypiętych; odpowiedz w pamieci wciaz zawiera obie
    // stacje, bo nowy fetch jeszcze nie wrocil (`useBoard` trzyma poprzednie dane
    // -- `keepPreviousData` -- zamiast mrugać pustymi kartami).
    rerender(
      <Dashboard
        pinnedItems={[PINNED_ITEMS[1]]}
        onRemove={vi.fn()}
      />
    )

    const krakowCard = findCardByHeading('Kraków Główny')
    expect(krakowCard).toHaveTextContent('Katowice')
    expect(screen.queryByText('Kraków')).not.toBeInTheDocument()
  })





  it('rewrites a legacy group pin (saved under a member stop id) to the real group id once the board loads', () => {
    useTransitBoard.mockReturnValue({
      data: { stops: [{ stopId: '100101', groupId: '1001', name: 'Centrum', modes: ['tram'], departures: [], members: [] }], schedule: { state: 'ready' }, attribution: [] },
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ snapshots: [], budget: undefined, status: 'ok' })))
    const legacy: PinnedItem = { kind: 'gtfs', city: 'warszawa', id: '100101', name: 'Centrum' }
    const onNormalize = vi.fn()
    render(<Dashboard pinnedItems={[legacy]} onRemove={vi.fn()} onNormalize={onNormalize} />)
    expect(onNormalize).toHaveBeenCalledWith('gtfs:warszawa:100101', { kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Centrum' })
  })

  describe('Start (PR11): modes, one failing card, subscriptions', () => {
    const boardFor = (stopId: string, name: string, mode: string) => ({
      data: { stops: [{ stopId, groupId: stopId, name, modes: [mode], departures: [], members: [] }], schedule: { state: 'ready' }, attribution: [] },
      error: null,
      loading: false,
      failed: false,
    })
    const modesIn = (card: HTMLElement) => within(card).queryAllByTestId('mode-glyph').map((node) => node.getAttribute('data-mode'))

    it.each([
      ['bus', 'Autobus'],
      ['tram', 'Tramwaj'],
      ['metro', 'Metro'],
      ['rail', 'Kolej miejska'],
    ])('a pinned GTFS %s stop keeps its own mode glyph and never touches the PKP board', (mode, label) => {
      const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ snapshots: [], budget: undefined, status: 'ok' }))
      vi.stubGlobal('fetch', fetchMock)
      useTransitBoard.mockReturnValue(boardFor('9001', 'Przystanek testowy', mode))

      render(<Dashboard pinnedItems={[{ kind: 'gtfs', city: 'warszawa', id: '9001', name: 'Przystanek testowy' }]} onRemove={vi.fn()} />)

      const card = findCardByHeading('Przystanek testowy')
      expect(modesIn(card)).toEqual([mode])
      expect(card).toHaveTextContent(label + ' · Rozkład')
      // Karta GTFS (także kolej miejska) nie uruchamia useBoard PKP: żadnego zapytania o tablicę stacji (#3, #13).
      expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/board'))).toEqual([])
    })

    it('a failed city card does not wipe the PKP card or the other city card', async () => {
      useTransitBoard.mockImplementation((...args: unknown[]) => {
        // beforeEach oddly returns the mock itself, which vitest calls as cleanup with no args.
        const stopIds = (args[1] as string[] | undefined) ?? []
        if (stopIds === undefined) throw new Error('ARGS ' + JSON.stringify(args))
        return stopIds[0] === '9001' ? { data: null, error: 'network', loading: false, failed: true } : boardFor('9002', 'Drugi przystanek', 'tram')
      })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() =>
          jsonResponse({
            snapshots: [{ stationId: '5100', stationName: 'Warszawa Centralna', departures: [], arrivals: [], fetchedAt: '2026-08-01T20:24:11.827Z', ageMs: 0 }],
            budget: undefined,
            status: 'ok',
          })
        )
      )

      render(
        <Dashboard
          pinnedItems={[
            { kind: 'pkp', id: '5100', name: 'Warszawa Centralna' },
            { kind: 'gtfs', city: 'warszawa', id: '9001', name: 'Pierwszy przystanek' },
            { kind: 'gtfs', city: 'warszawa', id: '9002', name: 'Drugi przystanek' },
          ]}
          onRemove={vi.fn()}
        />
      )

      expect(within(findCardByHeading('Pierwszy przystanek')).getByText('Nie udało się pobrać rozkładu.')).toBeInTheDocument()
      expect(within(findCardByHeading('Drugi przystanek')).queryByText('Nie udało się pobrać rozkładu.')).not.toBeInTheDocument()
      expect(await within(findCardByHeading('Warszawa Centralna')).findByText('Brak odjazdów w najbliższych godzinach')).toBeInTheDocument()
      // Karta z awarią nadal prowadzi do miejsca (nie jest martwa).
      expect(within(findCardByHeading('Pierwszy przystanek')).getByRole('link', { name: /Wszystkie odjazdy/ })).toBeInTheDocument()
    })

    it('re-rendering with the same pins (new array, e.g. a width change or theme switch) adds no board request', async () => {
      const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ snapshots: [null, null], budget: undefined, status: 'ok' }))
      vi.stubGlobal('fetch', fetchMock)
      const { rerender } = render(<Dashboard pinnedItems={[...PINNED_ITEMS]} onRemove={vi.fn()} />)
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

      rerender(<Dashboard pinnedItems={[...PINNED_ITEMS]} onRemove={vi.fn()} />)
      rerender(<Dashboard pinnedItems={[...PINNED_ITEMS]} onRemove={vi.fn()} />)

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })
})
