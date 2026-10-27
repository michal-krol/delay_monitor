// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TransitDepartureList } from './TransitDepartureList'
import { ON_REQUEST_TITLE } from './OnRequestBadge'
import type { GtfsDeparture } from '@/lib/gtfs/types'
import type { CourseVehicle } from './CourseVehicleActions'

type Dep = GtfsDeparture & { vehicle?: (CourseVehicle & { stopsAway: number }) | null }

function dep(over: Partial<Dep> = {}): Dep {
  return {
    vehicle: null,
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
    platformCode: null,
    stopCode: null,
    wheelchair: 0,
    frequencyBased: false,
    onRequest: false,
    ...over,
  }
}

describe('TransitDepartureList', () => {
  it('removes a retained overdue row once its observation is no longer fresh, without dropping ordinary rows', () => {
    const observedAt = '2026-09-02T14:32:00+02:00'
    vi.useFakeTimers()
    vi.setSystemTime(new Date(observedAt))
    const retained = dep({ retainedForVehicle: true, vehicle: { observedAt, ageSec: 0, stopsAway: 2, pastScheduledDeparture: true } })
    const { rerender } = render(<TransitDepartureList departures={[retained]} city="warszawa" />)
    expect(screen.getByText('14:30')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByText('14:30')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(10_000) })
    rerender(<TransitDepartureList departures={[retained]} city="warszawa" />)
    expect(screen.queryByText('14:30')).not.toBeInTheDocument()
    expect(screen.getByText('Brak odjazdów w rozkładzie')).toBeInTheDocument()
    rerender(<TransitDepartureList departures={[dep()]} city="warszawa" />)
    expect(screen.getByText('14:30')).toBeInTheDocument()
    vi.useRealTimers()
  })
  it('adds separate status and map actions only to the board, preserving the course time link', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-02T14:35:00+02:00'))
    const vehicle = { stopsAway: 3, ageSec: 0, id: 'V/20/1', tripId: 't', sideNumber: '1234', serviceDate: '2026-09-02', observedAt: '2026-09-02T14:35:00+02:00', pastScheduledDeparture: true }
    const { rerender } = render(<TransitDepartureList city="warszawa" departures={[dep({ vehicle })]} />)
    expect(screen.getByRole('img', { name: 'Po planowanym odjeździe' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pokaż pojazd 1234 na mapie' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Wybierz kurs/ })).toHaveTextContent('14:30')
    expect(screen.getByText('Nr boczny 1234')).toBeInTheDocument()
    rerender(<TransitDepartureList city="warszawa" variant="card" departures={[dep({ vehicle })]} />)
    expect(screen.queryByRole('img', { name: 'Po planowanym odjeździe' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pokaż pojazd 1234 na mapie' })).toBeInTheDocument()
    const mapAction = screen.getByRole('link', { name: 'Pokaż pojazd 1234 na mapie' })
    // eslint-disable-next-line testing-library/no-node-access
    expect(mapAction.parentElement?.closest('a')).toBeNull()
    vi.restoreAllMocks()
  })
  it('separates timetable and concrete-course links with midnight date and no nested links', () => {
    render(<TransitDepartureList city="warszawa" now={Date.parse('2026-09-02T23:30:00+02:00')} departures={[dep({ plannedAt: '2026-09-03T00:05:00+02:00', stopSequence: 3, directionId: 1 })]} />)
    expect(screen.getByRole('link', { name: 'Linia 20' })).toHaveAttribute('href', '/city/warszawa/line/20?stop=100101&pane=timetable&dir=1')
    expect(screen.getByRole('link', { name: /Wybierz kurs/ })).toHaveAttribute('href', '/city/warszawa/line/20?trip=t&date=2026-09-02&stop=100101&seq=3')
    expect(screen.getByText('03.09.2026')).toBeInTheDocument()
    // eslint-disable-next-line testing-library/no-node-access -- verifies invalid nested interactive markup, not user-facing lookup
    expect(document.querySelector('a a')).toBeNull()
  })
  it('shows the clock time straight from the ISO offset, the headsign and the line', () => {
    render(<TransitDepartureList departures={[dep()]} />)
    expect(screen.getByText('14:30')).toBeInTheDocument()
    expect(screen.getByText('Piaski')).toBeInTheDocument()
  })

  it('renders a schedule-only empty state, never "na czas"', () => {
    render(<TransitDepartureList departures={[]} />)
    expect(screen.getByText('Brak odjazdów w rozkładzie')).toBeInTheDocument()
    expect(screen.queryByText(/na czas/i)).not.toBeInTheDocument()
  })

  it('marks a frequency-based departure and its platform', () => {
    render(
      <TransitDepartureList
        departures={[dep({ frequencyBased: true, platformCode: 'P1' })]}
      />
    )
    expect(screen.getByText('co kilka min')).toBeInTheDocument()
    expect(screen.getByText('peron P1')).toBeInTheDocument()
  })

  it('labels a night line, leaving a regular one unlabelled', () => {
    render(<TransitDepartureList departures={[dep({ lineKind: 'night' }), dep({ lineKind: 'regular' })]} />)
    expect(screen.getByText('nocna')).toBeInTheDocument()
  })

  it('labels zone and local lines with the shared kind label', () => {
    render(<TransitDepartureList departures={[dep({ lineKind: 'zone' }), dep({ lineKind: 'local' })]} />)
    expect(screen.getByText('podmiejska')).toBeInTheDocument()
    expect(screen.getByText('lokalna')).toBeInTheDocument()
  })

  it('tags the stop with its bare number in a group view', () => {
    render(<TransitDepartureList departures={[dep({ stopCode: '06' })]} showStopCode />)
    expect(screen.getByText('06')).toBeInTheDocument()
    expect(screen.queryByText(/słup\./i)).not.toBeInTheDocument()
  })

  it('gives the stop-code chip readable (not title-only) text', () => {
    render(<TransitDepartureList departures={[dep({ stopCode: '06' })]} showStopCode />)
    expect(screen.getByText('Odjazd z przystanku')).toHaveClass('sr-only')
  })

  it('shows only the map action, without GPS age or stop-distance copy', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-02T14:35:00+02:00'))
    const vehicle = { stopsAway: 2, ageSec: 0, id: 'V/20/1', tripId: 't', sideNumber: '1234', serviceDate: '2026-09-02', observedAt: '2026-09-02T14:35:00+02:00' }
    render(<TransitDepartureList city="warszawa" departures={[dep({ vehicle })]} />)
    expect(screen.getByRole('link', { name: 'Pokaż pojazd 1234 na mapie' })).toBeInTheDocument()
    expect(screen.queryByText(/GPS:|przystank.*dalej|Pojazd w pobliżu/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('departure-meta')).not.toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('shows the full headsign without truncation', () => {
    render(<TransitDepartureList departures={[dep({ headsign: 'Os. Górczewska — Dworzec Wschodni' })]} />)
    const headsign = screen.getByTestId('departure-headsign')
    expect(headsign).not.toHaveClass('truncate')
    expect(headsign).toHaveClass('min-w-0', '[overflow-wrap:anywhere]')
  })

  it('shows 00:10 for a departure after midnight, independent of the process TZ', () => {
    render(
      <TransitDepartureList
        departures={[dep({ plannedAt: '2026-09-03T00:10:00+02:00', departureSec: 87000, serviceDate: '2026-09-02' })]}
      />
    )
    expect(screen.getByText('00:10')).toBeInTheDocument()
  })

  it('lays the row on a 3-column grid; the clock is the dominant, non-shrinking cell', () => {
    render(<TransitDepartureList departures={[dep()]} />)
    const row = screen.getByRole('listitem')
    expect(row).toHaveClass('grid', 'grid-cols-[auto_minmax(0,1fr)_auto]', 'items-start', 'gap-x-3', 'gap-y-1', 'py-3')
    expect(screen.getByText('14:30')).toHaveClass('time-dominant', 'text-foreground', 'shrink-0')
  })

  it('shows skeletons while loading', () => {
    const { container } = render(<TransitDepartureList departures={[]} loading />)
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('marks an on-request stop with the shared „na żądanie” badge', () => {
    render(<TransitDepartureList departures={[dep({ onRequest: true })]} />)
    expect(screen.getByText('na żądanie')).toHaveAttribute('title', ON_REQUEST_TITLE)
  })

  it('shows the stop number on the first departure in a group view and none in a single-stop view', () => {
    const { rerender } = render(<TransitDepartureList departures={[dep({ stopCode: '02' })]} showStopCode />)
    expect(screen.getByTitle('Odjazd z przystanku 02')).toBeInTheDocument()
    rerender(<TransitDepartureList departures={[dep({ stopCode: '02' })]} />)
    expect(screen.queryByText('02')).not.toBeInTheDocument()
  })

  it('has no „Najbliższy odjazd" highlight block any more', () => {
    const now = new Date('2026-09-02T14:20:00+02:00').getTime()
    render(<TransitDepartureList departures={[dep()]} now={now} />)
    expect(screen.queryByText('Najbliższy odjazd')).not.toBeInTheDocument()
  })

  it('renders emptyAction under the empty message', () => {
    render(<TransitDepartureList departures={[]} emptyAction={<button type="button">Wszystkie linie</button>} />)
    expect(screen.getByText('Brak odjazdów w rozkładzie')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Wszystkie linie' })).toBeInTheDocument()
  })

  it('renders no emptyAction while departures exist or loading', () => {
    const action = <button type="button">Wszystkie linie</button>
    const { rerender } = render(<TransitDepartureList departures={[dep()]} emptyAction={action} />)
    expect(screen.queryByRole('button', { name: 'Wszystkie linie' })).not.toBeInTheDocument()
    rerender(<TransitDepartureList departures={[]} loading emptyAction={action} />)
    expect(screen.queryByRole('button', { name: 'Wszystkie linie' })).not.toBeInTheDocument()
  })

  it('falls back to the platform code as the stop number, shown once', () => {
    // Feed bez `stop_code` (mock, metro) niesie numer w `platform_code` (gtfs.md) — tag go pokazuje,
    // a „peron …" z tą samą wartością byłby duplikatem.
    render(<TransitDepartureList departures={[dep({ stopCode: null, platformCode: '01' })]} showStopCode />)
    expect(screen.getByTitle('Odjazd z przystanku 01')).toBeInTheDocument()
    expect(screen.queryByText('peron 01')).not.toBeInTheDocument()
  })

  it('always says „wg rozkładu” under the dominant time, with the countdown inside the hour', () => {
    const now = new Date('2026-09-02T14:25:00+02:00').getTime()
    render(<TransitDepartureList departures={[dep()]} now={now} />)
    expect(screen.getByText('za 5 min · wg rozkładu')).toBeInTheDocument()
  })

  it('says only „wg rozkładu” when the departure is beyond the hour, and without a now prop', () => {
    const now = new Date('2026-09-02T12:25:00+02:00').getTime()
    const { rerender } = render(<TransitDepartureList departures={[dep()]} now={now} />)
    expect(screen.getByText('wg rozkładu')).toBeInTheDocument()
    expect(screen.queryByText(/za \d/)).not.toBeInTheDocument()
    rerender(<TransitDepartureList departures={[dep()]} />)
    expect(screen.getByText('wg rozkładu')).toBeInTheDocument()
  })

  it('says „wg rozkładu” on every row in the card variant too', () => {
    const now = new Date('2026-09-02T14:25:00+02:00').getTime()
    render(<TransitDepartureList departures={[dep()]} now={now} variant="card" city="warszawa" />)
    expect(screen.getByText('za 5 min · wg rozkładu')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveClass('grid', 'focus-visible:ring-primary-text')
    expect(screen.getByRole('link')).not.toHaveClass('focus-visible:ring-indigo-500')
  })

  it('a metro stop tagged from platform_code reads „peron”, not „Odjazd z przystanku”', () => {
    render(<TransitDepartureList departures={[dep({ mode: 'metro', stopCode: null, platformCode: 'P1' })]} showStopCode />)
    expect(screen.getByTitle('Peron P1')).toBeInTheDocument()
    expect(screen.queryByTitle('Odjazd z przystanku P1')).not.toBeInTheDocument()
  })

  it('keeps the platform in a single-stop view', () => {
    render(<TransitDepartureList departures={[dep({ stopCode: null, platformCode: 'P1' })]} />)
    expect(screen.getByText('peron P1')).toBeInTheDocument()
  })
})
