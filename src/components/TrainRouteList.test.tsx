// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RealizationStatus } from '@/lib/board/realization'
import type { PositionAnchor } from '@/lib/board/trainDetail'
import type { TrainDetailStopWithCoords } from '@/lib/board/mapPosition'
import { formatClockTime } from '@/lib/format'
import { TrainRouteList } from './TrainRouteList'

const NOW = Date.parse('2026-08-01T10:00:00.000Z')

function stop(index: number, overrides: Partial<TrainDetailStopWithCoords> = {}): TrainDetailStopWithCoords {
  const minute = String(index * 5).padStart(2, '0')
  const hour = 9 + Math.floor((index * 5) / 60)
  const at = (m: string, h: number) => `2026-08-01T${String(h).padStart(2, '0')}:${m}:00.000Z`
  return {
    stationId: String(1000 + index),
    stationName: `Stacja ${index}`,
    plannedArrival: at(minute, hour),
    actualArrival: null,
    arrivalDelayMinutes: null,
    plannedDeparture: at(String(index * 5 + 1).padStart(2, '0'), hour),
    actualDeparture: null,
    departureDelayMinutes: null,
    isCancelled: false,
    isConfirmed: false,
    platform: null,
    track: null,
    hasTrainStarted: true,
    estimatedDelayMinutes: null,
    predictedArrival: null,
    predictedDeparture: null,
    disruptionMessages: [],
    stopMinutes: null,
    stopTypeName: null,
    lat: null,
    lon: null,
    ...overrides,
  }
}

function route(count: number, confirmedUpTo = -1): TrainDetailStopWithCoords[] {
  return Array.from({ length: count }, (_, index) =>
    index <= confirmedUpTo
      ? stop(index, {
          isConfirmed: true,
          actualDeparture: stop(index).plannedDeparture,
          departureDelayMinutes: 0,
          actualArrival: stop(index).plannedArrival,
          arrivalDelayMinutes: 0,
        })
      : stop(index)
  )
}

const LIVE = (index: number): PositionAnchor => ({ index, mode: 'live' })

function statusesFor(stops: TrainDetailStopWithCoords[]): RealizationStatus[] {
  return stops.map((s) => (s.isCancelled ? 'cancelled' : s.isConfirmed ? 'onTime' : 'enRoute'))
}

function renderList(
  stops: TrainDetailStopWithCoords[],
  options: { anchor?: PositionAnchor; expanded?: boolean; onToggle?: () => void; statuses?: RealizationStatus[] } = {}
) {
  const props = {
    stops,
    statuses: options.statuses ?? statusesFor(stops),
    anchor: options.anchor ?? LIVE(-1),
    now: NOW,
    expanded: options.expanded ?? false,
    onToggle: options.onToggle ?? (() => {}),
  }
  return { ...render(<TrainRouteList {...props} />), props }
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('li') as HTMLElement
}

describe('TrainRouteList', () => {
  it.each([
    ['schedule', 'Szacowana pozycja — wg rozkładu'],
    ['stale', 'Szacowana pozycja — rozkład i ostatnie potwierdzenie'],
  ] as const)('describes the %s anchor as an estimate', (mode, label) => {
    renderList(route(4), { anchor: { index: 1, mode } })
    expect(within(rowOf('Stacja 1')).getByText(label)).toBeInTheDocument()
    expect(screen.queryByText(/Pociąg jest tutaj/)).not.toBeInTheDocument()
  })
  it('stop name links to its station (validated id, encoded name)', () => {
    renderList([stop(0, { stationId: '33605', stationName: 'Łódź Fabryczna & Co/1' }), stop(1)])
    const link = screen.getByRole('link', { name: /Łódź Fabryczna & Co\/1/ })
    expect(link).toHaveAttribute('href', `/station/33605?name=${encodeURIComponent('Łódź Fabryczna & Co/1')}`)
  })

  it('invalid station id renders plain text', () => {
    renderList([stop(0, { stationId: '../evil?x=1', stationName: 'Podejrzana' }), stop(1)])
    expect(screen.getByText('Podejrzana')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Podejrzana/ })).not.toBeInTheDocument()
  })

  it("confirmed stop has a filled dot and sr-only 'Potwierdzony'; future stop hollow", () => {
    renderList(route(3, 0), { anchor: LIVE(0) })
    const confirmed = within(rowOf('Stacja 0'))
    expect(confirmed.getByTestId('stop-dot')).toHaveAttribute('data-dot', 'filled')
    expect(confirmed.getByText('Potwierdzony')).toHaveClass('sr-only')
    const future = within(rowOf('Stacja 1'))
    expect(future.getByTestId('stop-dot')).toHaveAttribute('data-dot', 'hollow')
    expect(future.queryByText('Potwierdzony')).not.toBeInTheDocument()
  })

  it("cancelled stop shows 'odwołany' text and a hollow dot", () => {
    const stops = [stop(0, { isCancelled: true }), stop(1)]
    renderList(stops)
    const cancelled = within(rowOf('Stacja 0'))
    expect(cancelled.getByText('odwołany')).toBeInTheDocument()
    expect(cancelled.getByTestId('stop-dot')).toHaveAttribute('data-dot', 'hollow')
  })

  it("long route shows only the window and 'Pokaż całą trasę' (aria-expanded=false)", () => {
    renderList(route(14, 4), { anchor: LIVE(4) })
    const list = screen.getByRole('list', { name: 'Przebieg trasy' })
    // okno: od ostatniego potwierdzonego (4) do kotwicy + 2 (6)
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).getByText('Stacja 4')).toBeInTheDocument()
    expect(within(list).getByText('Stacja 6')).toBeInTheDocument()
    expect(within(list).queryByText('Stacja 3')).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /Pokaż całą trasę/ })
    expect(toggle).toHaveTextContent('14 przystanków')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', list.id)
    expect(within(list).getByText('Pociąg jest tutaj')).toBeInTheDocument()
  })

  it("expanding shows the whole list, button becomes 'Zwiń trasę'", () => {
    const onToggle = vi.fn()
    const stops = route(14, 4)
    const { rerender, props } = renderList(stops, { anchor: LIVE(4), onToggle })

    fireEvent.click(screen.getByRole('button', { name: /Pokaż całą trasę/ }))
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(<TrainRouteList {...props} expanded />)
    expect(within(screen.getByRole('list', { name: 'Przebieg trasy' })).getAllByRole('listitem')).toHaveLength(14)
    const toggle = screen.getByRole('button', { name: 'Zwiń trasę' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('short route has no toggle', () => {
    renderList(route(8, 2), { anchor: LIVE(2) })
    expect(within(screen.getByRole('list', { name: 'Przebieg trasy' })).getAllByRole('listitem')).toHaveLength(8)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('peron and tor shown separately, nothing when both null', () => {
    renderList([
      stop(0, { platform: '2', track: '4' }),
      stop(1, { platform: '3', track: null }),
      stop(2, { platform: null, track: '5' }),
      stop(3),
    ])
    expect(within(rowOf('Stacja 0')).getByText('Peron 2 · tor 4')).toBeInTheDocument()
    expect(within(rowOf('Stacja 1')).getByText('Peron 3')).toBeInTheDocument()
    expect(within(rowOf('Stacja 2')).getByText('Tor 5')).toBeInTheDocument()
    const none = within(rowOf('Stacja 3'))
    expect(none.queryByText(/peron|tor/i)).not.toBeInTheDocument()
    expect(none.queryByText('—')).not.toBeInTheDocument()
  })

  it("departure vs arrival labelled 'Odjazd'/'Przyjazd'", () => {
    const last = stop(1, { plannedDeparture: null })
    renderList([stop(0), last])
    expect(within(rowOf('Stacja 0')).getByText('Odjazd')).toBeInTheDocument()
    expect(within(rowOf('Stacja 1')).getByText('Przyjazd')).toBeInTheDocument()
  })

  it('shows plan / forecast / fact with labels and never a raw unconfirmed actual', () => {
    const stops = [
      stop(0, {
        isConfirmed: true,
        actualDeparture: '2026-08-01T09:09:00.000Z',
        departureDelayMinutes: 8,
        plannedDeparture: '2026-08-01T09:01:00.000Z',
      }),
      stop(1, {
        predictedDeparture: '2026-08-01T09:30:00.000Z',
        plannedDeparture: '2026-08-01T09:06:00.000Z',
        // surowe actual niepotwierdzonego przystanku — artefakt PKP, nie może trafić na ekran
        actualDeparture: '2026-08-01T20:15:00.000Z',
      }),
      // ostatni przystanek = zawsze przyjazd
      stop(2, { plannedArrival: '2026-08-01T09:11:00.000Z' }),
    ]
    renderList(stops, { statuses: ['delayed', 'enRoute', 'notStarted'] })

    const fact = within(rowOf('Stacja 0'))
    expect(fact.getByText('Faktycznie')).toBeInTheDocument()
    expect(fact.getByText(formatClockTime('2026-08-01T09:09:00.000Z'))).toBeInTheDocument()
    expect(fact.getByText(new RegExp(`Plan ${formatClockTime('2026-08-01T09:01:00.000Z')}`))).toBeInTheDocument()

    const forecast = within(rowOf('Stacja 1'))
    expect(forecast.getByText('Przew.')).toBeInTheDocument()
    expect(forecast.getByText(formatClockTime('2026-08-01T09:30:00.000Z'))).toBeInTheDocument()
    expect(forecast.queryByText(formatClockTime('2026-08-01T20:15:00.000Z'))).not.toBeInTheDocument()

    const plan = within(rowOf('Stacja 2'))
    expect(plan.getByText('Plan')).toBeInTheDocument()
    expect(plan.getByText(formatClockTime('2026-08-01T09:11:00.000Z'))).toBeInTheDocument()
  })

  it('empty or blank peron/tor counts as unknown (no "Peron " stub)', () => {
    renderList([stop(0, { platform: '', track: '4' }), stop(1, { platform: '  ', track: '' }), stop(2)])
    expect(within(rowOf('Stacja 0')).getByText('Tor 4')).toBeInTheDocument()
    expect(within(rowOf('Stacja 1')).queryByText(/peron|tor/i)).not.toBeInTheDocument()
  })

  it('last stop that also carries a departure shows "Przyjazd" with the arrival time, like "Przyjazd do celu"', () => {
    renderList([stop(0), stop(1, { plannedArrival: '2026-08-01T09:05:00.000Z', plannedDeparture: '2026-08-01T09:06:00.000Z' })])
    const row = within(rowOf('Stacja 1'))
    expect(row.getByText('Przyjazd')).toBeInTheDocument()
    expect(row.queryByText('Odjazd')).not.toBeInTheDocument()
    expect(row.getByText(formatClockTime('2026-08-01T09:05:00.000Z'))).toBeInTheDocument()
  })

  it('marks only the current stop with aria-current="step"', () => {
    renderList(route(3, 1), { anchor: LIVE(1) })
    expect(rowOf('Stacja 1')).toHaveAttribute('aria-current', 'step')
    expect(rowOf('Stacja 0')).not.toHaveAttribute('aria-current')
    expect(rowOf('Stacja 2')).not.toHaveAttribute('aria-current')
  })

  it('disruption summary is a 44 px touch target', () => {
    renderList([stop(0, { disruptionMessages: ['Zmiana peronu'] }), stop(1)])
    // eslint-disable-next-line testing-library/no-node-access -- klasa jest na <summary>, nie na tekście
    expect(screen.getByText('Utrudnienie').closest('summary')).toHaveClass('min-h-11')
  })

  it('no breathe class (static halo)', () => {
    const { container } = renderList(route(3, 1), { anchor: LIVE(1) })
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access -- sprawdzamy brak klasy na dowolnym elemencie
    expect(container.querySelector('.breathe')).toBeNull()
  })

  it('current-stop highlight transitions instead of replaying (200 ms, motion-reduce off)', () => {
    renderList(route(3, 1), { anchor: LIVE(1) })
    // eslint-disable-next-line testing-library/no-node-access -- ramka wiersza bieżącego przystanku
    const frame = rowOf('Stacja 1').querySelector('[data-current]')
    expect(frame).not.toBeNull()
    expect(frame).toHaveClass('transition-colors', 'motion-reduce:transition-none')
  })
})
