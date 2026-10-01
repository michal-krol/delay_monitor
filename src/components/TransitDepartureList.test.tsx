// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TransitDepartureList } from './TransitDepartureList'
import { ON_REQUEST_TITLE } from './OnRequestBadge'
import type { GtfsDeparture } from '@/lib/gtfs/types'

type Dep = GtfsDeparture & { vehicle?: { stopsAway: number; ageSec: number } | null }

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

  it('shows a vehicle chip when a departure has a live vehicle', () => {
    render(<TransitDepartureList departures={[dep({ vehicle: { stopsAway: 2, ageSec: 15 } })]} />)
    expect(screen.getByText('2 przyst.')).toBeInTheDocument()
  })

  it('gives the stop-code and vehicle chips readable (not title-only) text', () => {
    render(<TransitDepartureList departures={[dep({ stopCode: '06', vehicle: { stopsAway: 2, ageSec: 15 } })]} showStopCode />)
    expect(screen.getByText('Odjazd z przystanku')).toHaveClass('sr-only')
    expect(screen.getByText(/pozycja na żywo/)).toHaveClass('sr-only')
  })

  it('says how old a stale vehicle position is', () => {
    render(<TransitDepartureList departures={[dep({ vehicle: { stopsAway: 2, ageSec: 150 } })]} />)
    expect(screen.getByText(/pozycja sprzed 3 min/)).toHaveClass('sr-only')
  })

  it('shows "zaraz będzie" (approaching, not departed) at stopsAway 0', () => {
    render(<TransitDepartureList departures={[dep({ vehicle: { stopsAway: 0, ageSec: 15 } })]} />)
    expect(screen.getByText('zaraz będzie')).toBeInTheDocument()
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

  it('highlights the next departure in the accent colour, never green (#13)', () => {
    const now = new Date('2026-09-02T14:20:00+02:00').getTime()
    render(<TransitDepartureList departures={[dep()]} now={now} highlightFirst />)
    expect(screen.getByText('za 10 min')).toHaveClass('text-indigo-600')
  })

  it('shows the stop number on the next departure in a group view', () => {
    const now = new Date('2026-09-02T14:20:00+02:00').getTime()
    render(<TransitDepartureList departures={[dep({ stopCode: '02' })]} now={now} highlightFirst showStopCode />)
    // Jeden odjazd = tylko blok „Najbliższy odjazd", lista pod nim pusta — tag jest w bloku.
    expect(screen.getByTitle('Odjazd z przystanku 02')).toBeInTheDocument()
  })

  it('has no stop number on the next departure in a single-stop view', () => {
    const now = new Date('2026-09-02T14:20:00+02:00').getTime()
    render(<TransitDepartureList departures={[dep({ stopCode: '02' })]} now={now} highlightFirst />)
    expect(screen.queryByText('02')).not.toBeInTheDocument()
  })

  it('falls back to the platform code as the stop number, shown once', () => {
    // Feed bez `stop_code` (mock, metro) niesie numer w `platform_code` (gtfs.md) — tag go pokazuje,
    // a „peron …" z tą samą wartością byłby duplikatem.
    render(<TransitDepartureList departures={[dep({ stopCode: null, platformCode: '01' })]} showStopCode />)
    expect(screen.getByTitle('Odjazd z przystanku 01')).toBeInTheDocument()
    expect(screen.queryByText('peron 01')).not.toBeInTheDocument()
  })

  it('keeps the platform in a single-stop view', () => {
    render(<TransitDepartureList departures={[dep({ stopCode: null, platformCode: 'P1' })]} />)
    expect(screen.getByText('peron P1')).toBeInTheDocument()
  })
})
