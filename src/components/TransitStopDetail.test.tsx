// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransitStopDetail } from './TransitStopDetail'
import { resetCitiesCacheForTests } from '@/hooks/useCities'
import { jsonResponse } from '@/test-utils/http'
import { stubMatchMedia } from '@/test-utils/media'

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
    { routeId: 'M1', line: 'M1', mode: 'metro', kind: 'regular' },
    { routeId: '20', line: '20', mode: 'tram', kind: 'regular' },
  ],
  wheelchairNote: null,
  members: [],
  activeMember: null,
  summary: { lineCount: 2, departuresToday: 44, firstDepartureSec: 18000, lastDepartureSec: 90600, hourly: new Array(24).fill(2) },
  alerts: [],
  departures: [
    { tripId: 'a', routeId: 'M1', line: 'M1', mode: 'metro', lineKind: 'regular', headsign: 'Kabaty', plannedAt: '2026-09-02T14:30:00+02:00', departureSec: 52200, serviceDate: '2026-09-02', stopId: '7014M', platformCode: null, stopCode: null, wheelchair: 0, frequencyBased: true, onRequest: false, vehicle: null },
    { tripId: 'b', routeId: '20', line: '20', mode: 'tram', lineKind: 'regular', headsign: 'Piaski', plannedAt: '2026-09-02T14:35:00+02:00', departureSec: 52500, serviceDate: '2026-09-02', stopId: '7014M', platformCode: null, stopCode: null, wheelchair: 0, frequencyBased: false, onRequest: false, vehicle: null },
  ],
}

/** Zespół „Centrum" z 3 przystankami — do testów przełącznika (linie 187-247). */
const groupBoard = {
  ...board,
  stopId: '1001',
  groupId: '1001',
  name: 'Centrum',
  members: [
    { id: '100101', name: 'Centrum', lat: 52, lon: 21, platformCode: '01', code: '01', street: 'Marszałkowska', wheelchair: 1, lines: [{ routeId: '20', line: '20', mode: 'tram', kind: 'regular' }] },
    { id: '100102', name: 'Centrum', lat: 52, lon: 21, platformCode: '02', code: '02', street: 'Al. Jerozolimskie', wheelchair: 1, lines: [{ routeId: 'M1', line: 'M1', mode: 'metro', kind: 'regular' }] },
  ],
}

beforeEach(() => {
  window.localStorage.clear()
  resetCitiesCacheForTests()
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
    loading: false,
    failed: false,
  })
})

afterEach(() => vi.unstubAllGlobals())

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

  it('shows a map card with one pin per przystanek when the group has members', () => {
    useTransitBoard.mockReturnValue({
      data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
      error: null,
      loading: false,
      failed: false,
    })
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    expect(screen.getByRole('region', { name: 'Mapa zespołu przystanków Centrum' })).toBeInTheDocument()
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

  it('has no share button of its own (TopBar owns it); title is h1 standalone, h2 embedded', () => {
    const { rerender } = render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(screen.queryByRole('button', { name: 'Udostępnij' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Przypnij do Pulpitu/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Świętokrzyska' })).toBeInTheDocument()

    rerender(<TransitStopDetail city="warszawa" stopId="7014M" embedded />)
    expect(screen.getByRole('heading', { level: 2, name: 'Świętokrzyska' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('shows the przystanek switcher only when the group has more than one member', () => {
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(screen.queryByText('Przystanki w zespole', { exact: false })).not.toBeInTheDocument()

    useTransitBoard.mockReturnValue({
      data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
      error: null,
      loading: false,
      failed: false,
    })
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    expect(screen.getByText('Przystanki w zespole · 2')).toBeInTheDocument()
    expect(screen.getByText('Zespół przystanków · 2 przystanki')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Centrum 01/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Centrum 02/ })).toBeInTheDocument()
  })

  it('clicking a przystanek scopes the header subtitle and selects that tab only', async () => {
    useTransitBoard.mockReturnValue({
      data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
      error: null,
      loading: false,
      failed: false,
    })
    render(<TransitStopDetail city="warszawa" stopId="1001" />)

    const wholeGroup = screen.getByRole('tab', { name: /Cały zespół/ })
    const stop02 = screen.getByRole('tab', { name: /^Centrum 02/ })
    expect(wholeGroup).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(stop02)
    expect(stop02).toHaveAttribute('aria-selected', 'true')
    expect(wholeGroup).toHaveAttribute('aria-selected', 'false')
    // podtytuł nagłówka + przycisk przełącznika oba noszą „Centrum 02"
    expect(screen.getAllByText(/^Centrum 02/)).toHaveLength(2)

    await userEvent.click(wholeGroup)
    expect(wholeGroup).toHaveAttribute('aria-selected', 'true')
    expect(stop02).toHaveAttribute('aria-selected', 'false')
  })

  describe('recent places', () => {
    const KEY = 'monitor.recentPlaces.v1'
    const stored = (): unknown => JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    const mockGroupBoard = (): void => {
      useTransitBoard.mockReturnValue({
        data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
        error: null,
        loading: false,
        failed: false,
      })
    }

    it('records the whole zespół by groupId', () => {
      mockGroupBoard()
      // stopId ze ścieżki bywa przystankiem z deep-linku — zapisujemy id zespołu z odpowiedzi.
      render(<TransitStopDetail city="warszawa" stopId="100102" />)
      expect(stored()).toEqual([{ kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Centrum' }])
    })

    it('records the selected przystanek with its number', () => {
      mockGroupBoard()
      search = 'przystanek=100102'
      render(<TransitStopDetail city="warszawa" stopId="1001" />)
      expect(stored()).toEqual([{ kind: 'gtfs', city: 'warszawa', id: '1001', member: '100102', name: 'Centrum 02' }])
    })

    it('a deep link to one przystanek records only that przystanek, not the zespół first', () => {
      useTransitBoard.mockReturnValue({
        data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [{ ...groupBoard, requestedMember: '100102' }], attribution: [] },
        error: null,
        loading: false,
        failed: false,
      })
      render(<TransitStopDetail city="warszawa" stopId="100102" />)
      expect(stored()).toEqual([{ kind: 'gtfs', city: 'warszawa', id: '1001', member: '100102', name: 'Centrum 02' }])
    })

    it('records nothing until the board has loaded', () => {
      useTransitBoard.mockReturnValue({ data: null, error: null, loading: true, failed: false })
      render(<TransitStopDetail city="warszawa" stopId="1001" initialName="Centrum" />)
      expect(window.localStorage.getItem(KEY)).toBeNull()
    })
  })

  it('view tabs follow the WAI-ARIA tabs pattern: one tab stop, arrows/Home/End move selection and focus, a labelled tabpanel', async () => {
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    const tabs = within(screen.getByRole('tablist', { name: 'Widok przystanku' })).getAllByRole('tab')
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1'])
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Najbliższe odjazdy')

    tabs[0].focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Wszystkie linie')

    await userEvent.keyboard('{End}')
    expect(tabs[3]).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(tabs[0]).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Home}')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1'])
  })

  it('przystanek tabs: one tab stop and arrow keys select the next przystanek', async () => {
    useTransitBoard.mockReturnValue({
      data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
      error: null,
      loading: false,
      failed: false,
    })
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    const tabs = within(screen.getByRole('tablist', { name: 'Przystanek w zespole' })).getAllByRole('tab')
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])

    tabs[0].focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveFocus()
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])
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
      loading: false,
      failed: false,
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

  // PR0 review: przed odpowiedzią nie wiadomo, czy to zespół, czy jeden przystanek.
  it('says alerts are loading, never „tego przystanku”, before the board arrives', async () => {
    useTransitBoard.mockReturnValue({ data: null, error: null, loading: true, failed: false })
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    await userEvent.click(screen.getByRole('tab', { name: /Komunikaty/ }))
    expect(screen.getByText('Wczytywanie komunikatów…')).toBeInTheDocument()
    expect(screen.queryByText(/tego przystanku/)).not.toBeInTheDocument()
  })

  it('on a phone the stop context renders once — in the Info sheet, not also in a hidden aside', async () => {
    stubMatchMedia(false)
    window.HTMLElement.prototype.scrollTo = () => {}
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ cities: [] })))
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(screen.queryByText('Natężenie ruchu dziś')).not.toBeInTheDocument()
    // Licencja danych zostaje widoczna pod tablicą także na telefonie.
    expect(screen.getByText(/ZTM/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Info' }))
    expect(screen.getAllByText('Natężenie ruchu dziś')).toHaveLength(1)
  })

  it('„Info” opens a sheet with the stop context (map, traffic, lines) and × closes it', async () => {
    stubMatchMedia(false)
    window.HTMLElement.prototype.scrollTo = () => {}
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse({ cities: [] })))
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    const info = screen.getByRole('button', { name: 'Info' })
    await userEvent.click(info)
    const sheet = screen.getByRole('dialog', { name: 'Informacje o przystanku' })
    expect(within(sheet).getByText('Natężenie ruchu dziś')).toBeInTheDocument()
    expect(within(sheet).getByText('Linie na tym przystanku')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Zamknij informacje' }))
    expect(screen.queryByRole('dialog', { name: 'Informacje o przystanku' })).not.toBeInTheDocument()
  })

  it('shows a loading hint, not "no alerts", on the Komunikaty tab while alerts are still unknown (alerts: null)', async () => {
    useTransitBoard.mockReturnValue({
      data: {
        city: 'warszawa',
        schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null },
        stops: [{ ...board, alerts: null }],
        attribution: [],
      },
      error: null,
      loading: false,
      failed: false,
    })
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    await userEvent.click(screen.getByRole('tab', { name: /Komunikaty/ }))
    expect(screen.getByText('Wczytywanie komunikatów…')).toBeInTheDocument()
    expect(screen.queryByText('Aktualnie brak komunikatów dla tego przystanku.')).not.toBeInTheDocument()
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

  it('preselects the przystanek named in `?przystanek=` when nothing has been clicked yet', () => {
    useTransitBoard.mockReturnValue({
      data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
      error: null,
      loading: false,
      failed: false,
    })
    search = 'przystanek=100102'
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    expect(screen.getByRole('tab', { name: /^Centrum 02/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('ignores an old `?slupek=` link and shows the whole group', () => {
    useTransitBoard.mockReturnValue({ data: { city: 'warszawa', schedule: { state: 'ready' }, stops: [groupBoard], attribution: [] }, error: null, loading: false, failed: false })
    search = 'slupek=100102'
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    expect(screen.getByRole('tab', { name: /Cały zespół/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('ignores a malformed `?przystanek=` and falls back to the whole group', () => {
    useTransitBoard.mockReturnValue({
      data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
      error: null,
      loading: false,
      failed: false,
    })
    search = 'przystanek=..%2F..'
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    expect(screen.getByRole('tab', { name: /Cały zespół/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('writes the clicked przystanek to the URL via router.replace, keeping other params', async () => {
    useTransitBoard.mockReturnValue({
      data: { city: 'warszawa', schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null }, stops: [groupBoard], attribution: [] },
      error: null,
      loading: false,
      failed: false,
    })
    search = 'name=Centrum'
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    await userEvent.click(screen.getByRole('tab', { name: /^Centrum 02/ }))
    expect(replace).toHaveBeenCalledWith('/city/warszawa/stop/1001?name=Centrum&przystanek=100102', { scroll: false })
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
      loading: false,
      failed: false,
    })
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(screen.getByText('Najbliższy odjazd')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Pełny rozkład' }))
    expect(screen.queryByText('Najbliższy odjazd')).not.toBeInTheDocument()
  })

  it('pins as a gtfs pinned item carrying the city', async () => {
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    await userEvent.click(screen.getByRole('button', { name: /Przypnij do Pulpitu/ }))
    expect(JSON.parse(window.localStorage.getItem('monitor.favourites.v2') ?? '[]')).toEqual([
      { kind: 'gtfs', city: 'warszawa', id: '7014M', name: 'Świętokrzyska' },
    ])
  })

  it('cannot pin before the board says whether a group or one stop is shown', () => {
    useTransitBoard.mockReturnValue({ data: null, error: null, loading: true, failed: false })
    render(<TransitStopDetail city="warszawa" stopId="100102" initialName="Centrum" />)
    expect(screen.getByRole('button', { name: /Przypnij do Pulpitu/ })).toBeDisabled()
  })

  it('pins the selected stop of a group with its number', async () => {
    useTransitBoard.mockReturnValue({ data: { city: 'warszawa', schedule: { state: 'ready' }, stops: [groupBoard], attribution: [] }, error: null, loading: false, failed: false })
    render(<TransitStopDetail city="warszawa" stopId="1001" />)
    await userEvent.click(screen.getByRole('tab', { name: /^Centrum 02/ }))
    await userEvent.click(screen.getByRole('button', { name: /Przypnij do Pulpitu/ }))
    expect(JSON.parse(window.localStorage.getItem('monitor.favourites.v2') ?? '[]')).toEqual([
      { kind: 'gtfs', city: 'warszawa', id: '100102', name: 'Centrum 02', member: true },
    ])
  })

  it('pins the whole group, not the stop from the link, when the group is shown', async () => {
    useTransitBoard.mockReturnValue({ data: { city: 'warszawa', schedule: { state: 'ready' }, stops: [{ ...groupBoard, stopId: '100102' }], attribution: [] }, error: null, loading: false, failed: false })
    render(<TransitStopDetail city="warszawa" stopId="100102" />)
    await userEvent.click(screen.getByRole('button', { name: /Przypnij do Pulpitu/ }))
    expect(JSON.parse(window.localStorage.getItem('monitor.favourites.v2') ?? '[]')).toEqual([
      { kind: 'gtfs', city: 'warszawa', id: '1001', name: 'Centrum' },
    ])
  })

  it('shows a failed message, not the empty schedule message, when the first fetch fails', () => {
    useTransitBoard.mockReturnValue({ data: null, error: 'network', loading: false, failed: true })
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(screen.getByText('Nie udało się pobrać rozkładu.')).toBeInTheDocument()
    expect(screen.queryByText('Brak odjazdów w rozkładzie')).not.toBeInTheDocument()
  })

  it('treats a GTFS feed still loading as loading, never as failed', () => {
    useTransitBoard.mockReturnValue({
      data: {
        city: 'warszawa',
        schedule: { state: 'loading', loadedAt: null, ageMs: null, phase: 'stop_times', serviceDates: null, feedVersion: null },
        stops: [null],
        attribution: [],
      },
      error: null,
      loading: true,
      failed: false,
    })
    const { container } = render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(screen.queryByText('Nie udało się pobrać rozkładu.')).not.toBeInTheDocument()
    expect(screen.queryByText('Brak odjazdów w rozkładzie')).not.toBeInTheDocument()
    expect(screen.getByText('Wczytywanie rozkładu…')).toBeInTheDocument()
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows the empty schedule message, not failed, when the board is ready with zero departures', () => {
    useTransitBoard.mockReturnValue({
      data: {
        city: 'warszawa',
        schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null },
        stops: [{ ...board, departures: [] }],
        attribution: [],
      },
      error: null,
      loading: false,
      failed: false,
    })
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(screen.getByText('Brak odjazdów w rozkładzie')).toBeInTheDocument()
    expect(screen.queryByText('Nie udało się pobrać rozkładu.')).not.toBeInTheDocument()
  })

  it('shows "—" and "Brak rozkładu na dziś." when the board loaded but today fell out of the schedule window', () => {
    // `summary: null` = fetch succeeded but today's service date isn't in the
    // schedule (day-unknown, AGENTS.md #9/#10) — must not read as a fetch
    // failure (AGENTS.md #7).
    useTransitBoard.mockReturnValue({
      data: {
        city: 'warszawa',
        schedule: { state: 'ready', loadedAt: null, ageMs: 1000, phase: null, serviceDates: null, feedVersion: null },
        stops: [{ ...board, summary: null }],
        attribution: [],
      },
      error: null,
      loading: false,
      failed: false,
    })
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getByText('Brak rozkładu na dziś.')).toBeInTheDocument()
    expect(screen.queryByText(/Nie udało się pobrać rozkładu/)).not.toBeInTheDocument()
  })

  it("shows the city's display name, not the slug, once /api/cities resolves", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.startsWith('/api/cities') ? jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [] }] }) : Promise.reject(new Error('not stubbed'))
      )
    )
    render(<TransitStopDetail city="warszawa" stopId="7014M" />)
    expect(await screen.findByText('Rozkład jazdy — Warszawa')).toBeInTheDocument()
  })
})
