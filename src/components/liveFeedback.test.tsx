// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomNav } from './BottomNav'
import { BoardStatus } from './BoardStatus'
import { BoardTable } from './BoardTable'
import { StationCard } from './StationCard'
import { TransitDepartureList } from './TransitDepartureList'
import type { BoardApiResponse, BoardApiRow } from '@/hooks/useBoard'
import type { GtfsDeparture } from '@/lib/gtfs/types'

const usePathname = vi.fn()
vi.mock('next/navigation', () => ({ usePathname: () => usePathname(), useRouter: () => ({ push: vi.fn() }) }))

const NOW = Date.parse('2026-08-01T20:30:00.000Z')
const FETCHED_AT = '2026-08-01T20:29:30.000Z'

function data(): BoardApiResponse {
  return { snapshots: [], budget: { hourly: 90, daily: 900 }, status: 'ok', throttled: false }
}

function boardRow(overrides: Partial<BoardApiRow> = {}): BoardApiRow {
  return {
    scheduleId: '1',
    orderId: '1',
    operatingDate: '2026-08-01',
    trainNumber: '1',
    trainLabel: 'EIC 1',
    carrier: 'IC',
    carrierName: null,
    category: 'EIC',
    categoryName: null,
    headsign: 'Kraków',
    plannedAt: '2026-08-01T22:40:00+02:00',
    actualAt: null,
    delayMinutes: 5,
    status: 'delayed',
    platform: '1',
    estimatedDelayMinutes: null,
    ...overrides,
  }
}

describe('bottom nav halo', () => {
  afterEach(() => vi.clearAllMocks())

  it('marks only the active tab for the halo (data-active)', () => {
    usePathname.mockReturnValue('/map')
    render(<BottomNav />)
    const links = within(screen.getByRole('navigation', { name: 'Nawigacja główna' })).getAllByRole('link')
    expect(links.map((link) => link.hasAttribute('data-active'))).toEqual([false, false, false, true])
  })
})

describe('live dot on the board status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('shows while data is fresh and the last fetch succeeded', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} lastSuccessAt={NOW - 30_000} data={data()} error={false} />)
    expect(screen.getByTestId('live-dot')).toBeInTheDocument()
  })

  it('is absent beside stale data (a pulse would claim liveness the data does not have)', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} lastSuccessAt={NOW - 10 * 60_000} data={data()} error={false} />)
    expect(screen.queryByTestId('live-dot')).not.toBeInTheDocument()
  })

  it('is absent when the latest refresh failed', () => {
    render(<BoardStatus fetchedAt={FETCHED_AT} ageMs={1000} lastSuccessAt={NOW - 30_000} data={data()} error />)
    expect(screen.queryByTestId('live-dot')).not.toBeInTheDocument()
  })

  it('is absent while loading and when there is no snapshot', () => {
    render(<BoardStatus fetchedAt={undefined} ageMs={undefined} lastSuccessAt={null} data={null} error={false} />)
    expect(screen.queryByTestId('live-dot')).not.toBeInTheDocument()
  })
})

describe('live dot on the vehicle chip', () => {
  function dep(ageSec: number): GtfsDeparture & { vehicle: { stopsAway: number; ageSec: number } } {
    return {
      tripId: 't1',
      stopId: 's1',
      line: '20',
      mode: 'bus',
      lineKind: 'regular',
      headsign: 'Dw. Centralny',
      plannedAt: '2026-08-01T22:40:00+02:00',
      frequencyBased: false,
      onRequest: false,
      vehicle: { stopsAway: 2, ageSec },
    } as unknown as GtfsDeparture & { vehicle: { stopsAway: number; ageSec: number } }
  }

  it('shows for a position at most a minute old', () => {
    render(<TransitDepartureList departures={[dep(15)]} />)
    expect(screen.getByTestId('live-dot')).toBeInTheDocument()
  })

  it('is absent for a stale position', () => {
    render(<TransitDepartureList departures={[dep(150)]} />)
    expect(screen.queryByTestId('live-dot')).not.toBeInTheDocument()
  })
})

describe('delayed row glow', () => {
  it('keeps the text status next to the glow hook (colour is never the only signal)', () => {
    render(<BoardTable stationName="Warszawa Centralna" direction="departures" rows={[boardRow()]} now={NOW} loading={false} />)
    const rowEl = screen.getByRole('row', { name: /Kraków/ })
    expect(rowEl).toHaveAttribute('data-status', 'delayed')
    expect(within(rowEl).getByText('+5 min')).toBeInTheDocument()
  })
})

describe('Pulpit card press', () => {
  it('lets the card dip while its open overlay is pressed', () => {
    render(<StationCard stationId="5100" stationName="Warszawa Centralna" snapshot={null} error={false} configError={false} onExpand={vi.fn()} />)
    expect(screen.getByRole('article')).toHaveClass('card-press')
    expect(screen.getByRole('button', { name: /Pokaż pełną tablicę/ })).toHaveAttribute('data-card-open')
  })
})
