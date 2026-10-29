// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransitStopCard } from './TransitStopCard'
import { resetCitiesCacheForTests } from '@/hooks/useCities'
import { jsonResponse } from '@/test-utils/http'

const useTransitBoard = vi.fn()
vi.mock('@/hooks/useTransitBoard', () => ({ useTransitBoard: (...a: unknown[]) => useTransitBoard(...a) }))

beforeEach(() => resetCitiesCacheForTests())
afterEach(() => vi.unstubAllGlobals())

describe('TransitStopCard', () => {
  it('requests three departures and keeps a full stale timestamp with the last board', () => {
    useTransitBoard.mockReturnValue({ data: { stops: [{ stopId: '1001', name: 'Centrum', modes: ['tram'], departures: [departure] }], schedule: { state: 'ready' }, attribution: [] }, error: 'network', failed: false, loading: false, lastSuccessAt: Date.parse('2026-08-27T18:12:00Z') })
    render(<TransitStopCard city="warszawa" stopId="1001" stopName="Centrum" />)
    expect(useTransitBoard).toHaveBeenCalledWith('warszawa', ['1001'], 3, null)
    expect(screen.getByText('Nie udało się odświeżyć · dane z 27.08.2026, 20:12')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Centrum' })).toBeInTheDocument()
    expect(screen.getByText('Piaski')).toBeInTheDocument()
  })

  it('shows the stop name, a schedule label (not "na czas"), and links to the stop page', () => {
    useTransitBoard.mockReturnValue({
      data: {
        stops: [{ stopId: '7014M', name: 'Świętokrzyska', modes: ['metro'], departures: [] }],
        schedule: { state: 'ready' },
        attribution: [],
      },
      error: null,
      loading: false,
      failed: false,
    })
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" />)

    expect(screen.getByRole('heading', { name: 'Świętokrzyska' })).toBeInTheDocument()
    expect(screen.getByText(/Rozkład — warszawa/)).toBeInTheDocument()
    expect(within(screen.getByRole('heading')).getByRole('link')).toHaveAttribute(
      'href',
      '/city/warszawa/stop/7014M'
    )
  })

  it('tags departures with the stop number only when the group has more than one stop', () => {
    const departure = {
      tripId: 't',
      routeId: '20',
      line: '20',
      mode: 'tram',
      lineKind: 'regular',
      headsign: 'Piaski',
      plannedAt: '2026-09-02T14:30:00+02:00',
      departureSec: 52200,
      serviceDate: '2026-09-02',
      stopId: '100101',
      platformCode: '01',
      stopCode: null,
      wheelchair: 0,
      frequencyBased: false,
      onRequest: false,
    }
    const line = { routeId: '20', line: '20', mode: 'tram', kind: 'regular' }
    const board = (members: unknown[]) => ({
      data: { stops: [{ stopId: '1001', name: 'Centrum', modes: ['tram'], departures: [departure], members }], schedule: { state: 'ready' }, attribution: [] },
      error: null,
      loading: false,
      failed: false,
    })
    useTransitBoard.mockReturnValue(board([{ id: '100101', name: 'Centrum', code: '01', lines: [line] }]))
    const { unmount } = render(<TransitStopCard city="warszawa" stopId="1001" stopName="Centrum" />)
    expect(screen.queryByTitle('Odjazd z przystanku 01')).not.toBeInTheDocument()
    unmount()

    useTransitBoard.mockReturnValue(board([{ id: '100101', name: 'Centrum', code: '01', lines: [line] }, { id: '100102', name: 'Centrum', code: '02', lines: [line] }]))
    render(<TransitStopCard city="warszawa" stopId="1001" stopName="Centrum" />)
    expect(screen.getByText('Centrum 01')).toBeInTheDocument()
  })


  it('shows an explicit error when the schedule could not load', () => {
    useTransitBoard.mockReturnValue({ data: null, error: 'network', loading: false, failed: true })
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" />)
    expect(screen.getByText('Nie udało się pobrać rozkładu.')).toBeInTheDocument()
  })

  it('shows the failed message, not the empty one, when the server failed to load the schedule', () => {
    useTransitBoard.mockReturnValue({
      data: { schedule: { state: 'failed' }, stops: [], attribution: [] },
      error: null,
      loading: false,
      failed: true,
    })
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" />)
    expect(screen.getByText('Nie udało się pobrać rozkładu.')).toBeInTheDocument()
    expect(screen.queryByText('Brak odjazdów w rozkładzie')).not.toBeInTheDocument()
  })

  it('shows loading, not the empty message, while GTFS is still loading', () => {
    useTransitBoard.mockReturnValue({
      data: { stops: [null], schedule: { state: 'loading' }, attribution: [] },
      error: null,
      loading: true,
      failed: false,
    })
    const { container } = render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" />)
    expect(screen.queryByText('Nie udało się pobrać rozkładu.')).not.toBeInTheDocument()
    expect(screen.queryByText('Brak odjazdów w rozkładzie')).not.toBeInTheDocument()
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows the empty schedule message, not failed, when the board is ready with zero departures', () => {
    useTransitBoard.mockReturnValue({
      data: {
        stops: [{ stopId: '7014M', name: 'Świętokrzyska', modes: ['metro'], departures: [] }],
        schedule: { state: 'ready' },
        attribution: [],
      },
      error: null,
      loading: false,
      failed: false,
    })
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" />)
    expect(screen.getByText('Brak odjazdów w rozkładzie')).toBeInTheDocument()
    expect(screen.queryByText('Nie udało się pobrać rozkładu.')).not.toBeInTheDocument()
  })

  it("shows the city's display name, not the slug, once /api/cities resolves", async () => {
    useTransitBoard.mockReturnValue({ data: null, error: null, loading: true, failed: false })
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [] }] })))
    render(<TransitStopCard city="warszawa" stopId="7014M" stopName="Świętokrzyska" />)
    expect(await screen.findByText('Rozkład — Warszawa')).toBeInTheDocument()
  })

  const departure = {
    vehicle: null, tripId: 't', routeId: '20', line: '20', mode: 'tram', lineKind: 'regular', headsign: 'Piaski',
    plannedAt: '2026-09-02T14:30:00+02:00', departureSec: 52200, serviceDate: '2026-09-02', stopId: '100102',
    platformCode: null, stopCode: '02', wheelchair: 0, frequencyBased: false, onRequest: false,
  }
  // `/api/gtfs/board` zawsze niesie przystanki zespołu; numer na liście tylko przy więcej niż jednym.
  const tram20 = { routeId: '20', line: '20', mode: 'tram', kind: 'regular' }
  const centrum = {
    stopId: '100102', groupId: '1001', name: 'Centrum', modes: ['tram'], departures: [departure],
    members: [{ id: '100101', name: 'Centrum', code: '01', lines: [tram20] }, { id: '100102', name: 'Centrum', code: '02', lines: [tram20] }],
  }

  it('a pinned single stop fetches only that stop and is named with its number', () => {
    useTransitBoard.mockReturnValue({ data: { stops: [centrum], schedule: { state: 'ready' }, attribution: [] }, error: null, loading: false, failed: false })
    render(<TransitStopCard city="warszawa" stopId="100102" stopName="Centrum 02" member />)
    expect(useTransitBoard).toHaveBeenLastCalledWith('warszawa', ['100102'], 3, '100102')
    expect(screen.getByRole('heading', { name: 'Centrum 02' })).toBeInTheDocument()
    expect(screen.queryByText('Odjazd z przystanku')).not.toBeInTheDocument()
    expect(within(screen.getByRole('heading')).getByRole('link')).toHaveAttribute('href', '/city/warszawa/stop/1001?przystanek=100102')
  })

  it('a pinned group shows all its stops with numbers and links to the group', () => {
    useTransitBoard.mockReturnValue({ data: { stops: [centrum], schedule: { state: 'ready' }, attribution: [] }, error: null, loading: false, failed: false })
    // Wpis sprzed flagi `member`: `id` to przystanek ze starego deep-linku, ale znaczy cały zespół.
    render(<TransitStopCard city="warszawa" stopId="100102" stopName="Centrum" />)
    expect(useTransitBoard).toHaveBeenLastCalledWith('warszawa', ['100102'], 3, null)
    expect(screen.getByRole('heading', { name: 'Centrum' })).toBeInTheDocument()
    expect(screen.getByText('Centrum 02')).toBeInTheDocument()
    expect(within(screen.getByRole('heading')).getByRole('link')).toHaveAttribute('href', '/city/warszawa/stop/1001')
  })

  it('each departure links to its line page; „wg rozkładu” stays visible, never „na czas” or a delay (#13)', () => {
    useTransitBoard.mockReturnValue({ data: { stops: [centrum], schedule: { state: 'ready' }, attribution: [] }, error: null, loading: false, failed: false })
    // Odjazd za ponad godzinę: bez odliczania, ale dopisek „wg rozkładu” zostaje.
    render(<TransitStopCard city="warszawa" stopId="100102" stopName="Centrum" />)
    const list = screen.getByTestId('departure-list')
    expect(within(list).getByRole('link')).toHaveAttribute('href', '/city/warszawa/line/20')
    expect(list).toHaveTextContent('wg rozkładu')
    expect(list).not.toHaveTextContent(/na czas|punktualnie|opóźn/i)
  })

  it('no full-card overlay: the only links are the heading, the departures and „Wszystkie odjazdy”', () => {
    useTransitBoard.mockReturnValue({ data: { stops: [centrum], schedule: { state: 'ready' }, attribution: [] }, error: null, loading: false, failed: false })
    render(<TransitStopCard city="warszawa" stopId="100102" stopName="Centrum" />)
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.queryByRole('link', { name: /Pokaż przystanek/ })).toBeNull()
  })

  describe('place mode marking (one glyph per mode, from the data, never a default bus)', () => {
    const boardOf = (modes: string[], members: unknown[] = []) => ({
      data: { stops: [{ stopId: '1001', groupId: '1001', name: 'Centrum', modes, departures: [], members }], schedule: { state: 'ready' }, attribution: [] },
      error: null,
      loading: false,
      failed: false,
    })
    const modesOf = () => screen.queryAllByTestId('mode-glyph').map((node) => node.getAttribute('data-mode'))

    it.each([
      ['bus', 'Autobus'],
      ['tram', 'Tramwaj'],
      ['metro', 'Metro'],
      ['rail', 'Kolej miejska'],
    ])('%s → its own glyph and the label „%s · Rozkład — …”', (mode, label) => {
      useTransitBoard.mockReturnValue(boardOf([mode]))
      render(<TransitStopCard city="warszawa" stopId="1001" stopName="Centrum" />)
      expect(modesOf()).toEqual([mode])
      expect(screen.getByText(label + ' · Rozkład — warszawa')).toBeInTheDocument()
    })

    it('a GTFS rail stop is a schedule card: no PKP words, no realization (#13)', () => {
      useTransitBoard.mockReturnValue(boardOf(['rail']))
      render(<TransitStopCard city="warszawa" stopId="1001" stopName="Centrum" />)
      expect(screen.queryByText(/PKP|Stacja kolejowa|na czas|opóźn/i)).toBeNull()
    })

    it('a group with several modes shows all of them', () => {
      useTransitBoard.mockReturnValue(boardOf(['tram', 'bus']))
      render(<TransitStopCard city="warszawa" stopId="1001" stopName="Centrum" />)
      expect(modesOf()).toEqual(['tram', 'bus'])
      expect(screen.getByText('Tramwaj, autobus · Rozkład — warszawa')).toBeInTheDocument()
    })

    it('a pinned single stop shows the modes of ITS lines only', () => {
      useTransitBoard.mockReturnValue(
        boardOf(['tram', 'bus'], [
          { id: '100101', lines: [{ routeId: '20', line: '20', mode: 'tram', kind: 'regular' }] },
          { id: '100102', lines: [{ routeId: '128', line: '128', mode: 'bus', kind: 'regular' }] },
        ])
      )
      render(<TransitStopCard city="warszawa" stopId="100102" stopName="Centrum 02" member />)
      expect(modesOf()).toEqual(['bus'])
    })

    it('while the board is loading the mode is unknown: neutral stop glyph, no mode words', () => {
      useTransitBoard.mockReturnValue({ data: null, error: null, loading: true, failed: false })
      render(<TransitStopCard city="warszawa" stopId="1001" stopName="Centrum" />)
      expect(modesOf()).toEqual([])
      expect(screen.getByText(/^Rozkład — /)).toBeInTheDocument()
    })

    it('after a failed first fetch the card keeps its link and says so, without inventing a mode', () => {
      useTransitBoard.mockReturnValue({ data: null, error: 'network', loading: false, failed: true })
      render(<TransitStopCard city="warszawa" stopId="1001" stopName="Centrum" />)
      expect(modesOf()).toEqual([])
      expect(screen.getByText('Nie udało się pobrać rozkładu.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Wszystkie odjazdy/ })).toHaveAttribute('href', '/city/warszawa/stop/1001')
    })

    it('„Wszystkie odjazdy” of a pinned single stop returns to that stop, not the whole group', () => {
      useTransitBoard.mockReturnValue(boardOf(['bus'], [{ id: '100102', lines: [{ routeId: '128', line: '128', mode: 'bus', kind: 'regular' }] }]))
      render(<TransitStopCard city="warszawa" stopId="100102" stopName="Centrum 02" member />)
      expect(screen.getByRole('link', { name: /Wszystkie odjazdy/ })).toHaveAttribute('href', '/city/warszawa/stop/1001?przystanek=100102')
    })
  })

  describe('legacy group pin saved under a member stop id', () => {
    const board = (groupId: string) => ({
      data: { stops: [{ stopId: '100101', groupId, name: 'Centrum', modes: ['tram'], departures: [], members: [] }], schedule: { state: 'ready' }, attribution: [] },
      error: null,
      loading: false,
      failed: false,
    })

    it('reports the real group id once the board is loaded (the pin is rewritten to it)', () => {
      useTransitBoard.mockReturnValue(board('1001'))
      const onGroupResolved = vi.fn()
      render(<TransitStopCard city="warszawa" stopId="100101" stopName="Centrum" onGroupResolved={onGroupResolved} />)
      expect(onGroupResolved).toHaveBeenCalledWith('1001')
    })

    it('stays quiet when the pin already is the group, or is a single member (member: true)', () => {
      const onGroupResolved = vi.fn()
      useTransitBoard.mockReturnValue(board('1001'))
      const { unmount } = render(<TransitStopCard city="warszawa" stopId="1001" stopName="Centrum" onGroupResolved={onGroupResolved} />)
      unmount()
      render(<TransitStopCard city="warszawa" stopId="100101" stopName="Centrum 01" member onGroupResolved={onGroupResolved} />)
      expect(onGroupResolved).not.toHaveBeenCalled()
    })

    it('stays quiet while the board is loading (unknown group is not a reason to rewrite)', () => {
      useTransitBoard.mockReturnValue({ data: null, error: null, loading: true, failed: false })
      const onGroupResolved = vi.fn()
      render(<TransitStopCard city="warszawa" stopId="100101" stopName="Centrum" onGroupResolved={onGroupResolved} />)
      expect(onGroupResolved).not.toHaveBeenCalled()
    })
  })
})
