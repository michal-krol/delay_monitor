// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TransitStopDetail } from './TransitStopDetail'

let search = ''
const push = vi.fn()
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/city/warszawa/stop/1001',
}))

const useTransitBoard = vi.fn()
vi.mock('@/hooks/useTransitBoard', () => ({ useTransitBoard: () => useTransitBoard() }))

const board = {
  stopId: '7014M',
  groupId: '7014M',
  requestedMember: null,
  name: 'Świętokrzyska',
  modes: ['metro', 'tram'],
  lines: [
    { routeId: 'M1', line: 'M1', color: '#0000bb', mode: 'metro' },
    { routeId: '20', line: '20', color: null, mode: 'tram' },
  ],
  wheelchairNote: null,
  members: [],
  activeMember: null,
  summary: { lineCount: 2, departuresToday: 44, firstDepartureSec: 18000, lastDepartureSec: 90600, hourly: new Array(24).fill(2) },
  alerts: [],
  departures: [
    { tripId: 'a', routeId: 'M1', line: 'M1', mode: 'metro', color: '#0000bb', headsign: 'Kabaty', plannedAt: '2026-09-02T14:30:00+02:00', departureSec: 52200, serviceDate: '2026-09-02', stopId: '7014M', platformCode: null, stopCode: null, wheelchair: 0, frequencyBased: true, onRequest: false, vehicle: null },
    { tripId: 'b', routeId: '20', line: '20', mode: 'tram', color: null, headsign: 'Piaski', plannedAt: '2026-09-02T14:35:00+02:00', departureSec: 52500, serviceDate: '2026-09-02', stopId: '7014M', platformCode: null, stopCode: null, wheelchair: 0, frequencyBased: false, onRequest: false, vehicle: null },
  ],
}

/** Zespół „Centrum" z 3 słupkami — do testów przełącznika (linie 187-247). */
const groupBoard = {
  ...board,
  stopId: '1001',
  groupId: '1001',
  name: 'Centrum',
  members: [
    { id: '100101', name: 'Centrum', lat: 52, lon: 21, platformCode: '01', code: '01', street: 'Marszałkowska', wheelchair: 1, lines: [{ routeId: '20', line: '20', color: null, mode: 'tram' }] },
    { id: '100102', name: 'Centrum', lat: 52, lon: 21, platformCode: '02', code: '02', street: 'Al. Jerozolimskie', wheelchair: 1, lines: [{ routeId: 'M1', line: 'M1', color: '#0000bb', mode: 'metro' }] },
  ],
}

beforeEach(() => {
  window.localStorage.clear()
  search = ''
  push.mockClear()
  replace.mockClear()
  useTransitBoard.mockReturnValue({
    data: {
      city: 'warszawa',
      schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null },
      stops: [board],
      attribution: ['ZTM'],
    },
    error: null,
  })
})

describe('TransitStopDetail', () => {
  it('shows summary facts, the board and the lines aside — never a delay', () => {
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(screen.getByRole('heading', { name: 'Świętokrzyska' })).toBeInTheDocument()
    expect(screen.getByText('Odjazdy dziś')).toBeInTheDocument()
    expect(screen.getByText('44')).toBeInTheDocument()
    expect(screen.getByText('05:00–01:10')).toBeInTheDocument() // 90600s = 25:10 → 01:10
    expect(screen.getByText('Linie na tym przystanku')).toBeInTheDocument()
    expect(screen.getByText('Natężenie ruchu dziś')).toBeInTheDocument()
    expect(screen.queryByText(/na czas|opóźni/i)).not.toBeInTheDocument()
  })

  it('reports the resolved stop name once the board loads, for a parent breadcrumb', () => {
    const onNameResolved = vi.fn()
    render(<TransitStopDetail city="warszawa" stopId="7014M" onNameResolved={onNameResolved} />)
    expect(onNameResolved).toHaveBeenCalledWith('Świętokrzyska')
  })

  it('shows no map card when the group has no member with lat/lon (parent station, no members)', () => {
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(screen.queryByRole('region', { name: /^Mapa przystanku/ })).not.toBeInTheDocument()
  })

  it('shows a map card with one pin per słupek when the group has members', () => {
    useTransitBoard.mockReturnValue({
      data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
      error: null,
    })
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    expect(screen.getByRole('region', { name: 'Mapa przystanku Centrum' })).toBeInTheDocument()
  })

  it('filters the board by line when a line chip is clicked', async () => {
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(screen.getByText('Kabaty')).toBeInTheDocument()
    expect(screen.getByText('Piaski')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^M1/ }))
    expect(screen.getByText('Kabaty')).toBeInTheDocument()
    expect(screen.queryByText('Piaski')).not.toBeInTheDocument()
  })

  it('links a departure-row line badge to the line details', () => {
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    const link = screen.getAllByRole('link', { name: 'Linia M1' })[0]
    expect(link).toHaveAttribute('href', '/city/warszawa/line/M1')
  })

  it('hides the internal share button when embedded', () => {
    render(<TransitStopDetail city="warszawa" stopId="7014M" embedded />)
    expect(screen.queryByRole('button', { name: 'Udostępnij' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Przypnij do Pulpitu/ })).toBeInTheDocument()
  })

  it('shows the słupek switcher only when the group has more than one member', () => {
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(screen.queryByText('Słupki tego przystanku', { exact: false })).not.toBeInTheDocument()

    useTransitBoard.mockReturnValue({
      data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
      error: null,
    })
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    expect(screen.getByText('Słupki tego przystanku · 2')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Centrum 01/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Centrum 02/ })).toBeInTheDocument()
  })

  it('clicking a słupek scopes the header subtitle and selects that tab only', async () => {
    useTransitBoard.mockReturnValue({
      data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
      error: null,
    })
    render(<TransitStopDetail city="warszawa" stopId="1001" />)

    const wholeGroup = screen.getByRole('tab', { name: /Cały przystanek/ })
    const slupek02 = screen.getByRole('tab', { name: /^Centrum 02/ })
    expect(wholeGroup).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(slupek02)
    expect(slupek02).toHaveAttribute('aria-selected', 'true')
    expect(wholeGroup).toHaveAttribute('aria-selected', 'false')
    // podtytuł nagłówka + przycisk przełącznika oba noszą „Centrum 02"
    expect(screen.getAllByText(/^Centrum 02/)).toHaveLength(2)

    await userEvent.click(wholeGroup)
    expect(wholeGroup).toHaveAttribute('aria-selected', 'true')
    expect(slupek02).toHaveAttribute('aria-selected', 'false')
  })

  it('flags the Komunikaty tab and shows the alert once opened, when the board carries an active alert', async () => {
    useTransitBoard.mockReturnValue({
      data: {
        city: 'warszawa',
        schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null },
        stops: [{ ...board, alerts: [{ id: 'a', routes: ['M1'], effect: 'DETOUR', link: '', title: 'Utrudnienia na linii M1', body: 'Treść.' }] }],
        attribution: [],
      },
      error: null,
    })
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    const alertsTab = screen.getByRole('tab', { name: /Komunikaty/ })
    expect(screen.queryByText('Utrudnienia na linii M1')).not.toBeInTheDocument()

    await userEvent.click(alertsTab)
    expect(screen.getByText('Utrudnienia na linii M1')).toBeInTheDocument()
    expect(screen.getByText('Treść.')).toBeInTheDocument()
  })

  it('shows a neutral message on the Komunikaty tab when there are no alerts', async () => {
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    await userEvent.click(screen.getByRole('tab', { name: /Komunikaty/ }))
    expect(screen.getByText('Aktualnie brak komunikatów dla tego przystanku.')).toBeInTheDocument()
  })

  it('shows all lines grouped by mode on the Wszystkie linie tab', async () => {
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    await userEvent.click(screen.getByRole('tab', { name: 'Wszystkie linie' }))
    // "metro"/"tramwaj" jako etykieta trybu renderują się też w nagłówku i w
    // karcie aside — liczymy wystąpienia zamiast zakładać jedno.
    expect(screen.getAllByText('metro').length).toBeGreaterThan(0)
    expect(screen.getAllByText('tramwaj').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Linia M1' }).length).toBeGreaterThan(0)
  })

  it('shows the full fetched departure list on Pełny rozkład, not just the nearest preview', async () => {
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    await userEvent.click(screen.getByRole('tab', { name: 'Pełny rozkład' }))
    expect(screen.getByText('Kabaty')).toBeInTheDocument()
    expect(screen.getByText('Piaski')).toBeInTheDocument()
  })

  it('preselects the słupek named in `?slupek=` when nothing has been clicked yet', () => {
    useTransitBoard.mockReturnValue({
      data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
      error: null,
    })
    search = 'slupek=100102'
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    expect(screen.getByRole('tab', { name: /^Centrum 02/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('ignores a malformed `?slupek=` and falls back to the whole group', () => {
    useTransitBoard.mockReturnValue({
      data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
      error: null,
    })
    search = 'slupek=..%2F..'
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    expect(screen.getByRole('tab', { name: /Cały przystanek/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('writes the clicked słupek to the URL via router.replace, keeping other params', async () => {
    useTransitBoard.mockReturnValue({
      data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
      error: null,
    })
    search = 'name=Centrum'
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    await userEvent.click(screen.getByRole('tab', { name: /^Centrum 02/ }))
    expect(replace).toHaveBeenCalledWith('/city/warszawa/stop/1001?name=Centrum&slupek=100102', { scroll: false })
  })

  it('highlights the nearest upcoming departure on the Najbliższe odjazdy tab, not on Pełny rozkład', async () => {
    const soon = new Date(Date.now() + 5 * 60_000).toISOString()
    useTransitBoard.mockReturnValue({
      data: {
        city: 'warszawa',
        schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null },
        stops: [{ ...board, departures: [{ ...board.departures[0], plannedAt: soon }, board.departures[1]] }],
        attribution: [],
      },
      error: null,
    })
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(screen.getByText('Najbliższy odjazd')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Pełny rozkład' }))
    expect(screen.queryByText('Najbliższy odjazd')).not.toBeInTheDocument()
  })

  it('pins as a gtfs favourite carrying the city', async () => {
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    await userEvent.click(screen.getByRole('button', { name: /Przypnij do Pulpitu/ }))
    expect(JSON.parse(window.localStorage.getItem('monitor.favourites.v2') ?? '[]')).toEqual([
      { kind: 'gtfs', city: 'warszawa', id: '7014M', name: 'Świętokrzyska' },
    ])
  })
})
