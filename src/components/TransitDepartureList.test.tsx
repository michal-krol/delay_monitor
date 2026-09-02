// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TransitDepartureList } from './TransitDepartureList'
import type { GtfsDeparture } from '@/lib/gtfs/types'

function dep(over: Partial<GtfsDeparture> = {}): GtfsDeparture {
  return {
    tripId: 't',
    routeId: '20',
    line: '20',
    mode: 'tram',
    color: null,
    headsign: 'Piaski',
    plannedAt: '2026-09-02T14:30:00+02:00',
    departureSec: 52200,
    serviceDate: '2026-09-02',
    stopId: '100101',
    platformCode: null,
    wheelchair: 0,
    frequencyBased: false,
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

  it('marks a frequency-based departure and shows a confirmed-accessible stop only', () => {
    render(
      <TransitDepartureList
        departures={[dep({ frequencyBased: true, platformCode: 'P1', wheelchair: 1 })]}
      />
    )
    expect(screen.getByText('co kilka min')).toBeInTheDocument()
    expect(screen.getByText('peron P1')).toBeInTheDocument()
    expect(screen.getByTitle('Przystanek dostępny dla wózków')).toBeInTheDocument()
  })

  it('does not mark wheelchair=0 (unknown) as anything', () => {
    render(<TransitDepartureList departures={[dep({ wheelchair: 0 })]} />)
    expect(screen.queryByTitle('Przystanek dostępny dla wózków')).not.toBeInTheDocument()
  })

  it('shows skeletons while loading', () => {
    const { container } = render(<TransitDepartureList departures={[]} loading />)
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})
