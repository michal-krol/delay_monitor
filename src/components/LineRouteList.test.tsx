// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LineRouteStop } from '@/lib/gtfs/query'
import type { VehicleOnRoute } from '@/lib/gtfs/vehicleProject'
import { formatSecondsOfDay } from '@/lib/format'
import { LineRouteList } from './LineRouteList'

function stop(index: number, overrides: Partial<LineRouteStop> = {}): LineRouteStop {
  return {
    stopId: `s${index}`,
    groupId: `g${index}`,
    name: `Przystanek ${index}`,
    code: null,
    street: null,
    wheelchair: 1,
    lat: 52 + index / 100,
    lon: 21,
    offsetSec: index * 300,
    onRequest: false,
    ...overrides,
  }
}

const STOPS = [0, 1, 2, 3].map((i) => stop(i))

function vehicle(overrides: Partial<VehicleOnRoute> = {}): VehicleOnRoute {
  return {
    sideNumber: '1234',
    tripId: 't1',
    routeId: 'r1',
    directionId: 0,
    afterStopOrder: 1,
    fraction: 0.4,
    lat: 52,
    lon: 21,
    ageSec: 10,
    headsign: null,
    bearing: null,
    ...overrides,
  }
}

type Overrides = Partial<React.ComponentProps<typeof LineRouteList>>

function setup(overrides: Overrides = {}) {
  const onSelectStop = vi.fn()
  const view = render(
    <LineRouteList
      city="warszawa"
      stops={STOPS}
      selectedStopId={null}
      selectedBaseSec={null}
      onSelectStop={onSelectStop}
      mode="bus"
      kind="regular"
      {...overrides}
    />
  )
  return { onSelectStop, ...view }
}

const rows = () => screen.getAllByRole('listitem')

describe('LineRouteList', () => {
  it('shows heading with the stop count and the legend', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Trasa linii · 4 przystanki' })).toBeTruthy()
    expect(screen.getByText('przystanek')).toBeTruthy()
    expect(screen.getByText('na żądanie')).toBeTruthy()
    expect(screen.getByText('przystanek krańcowy')).toBeTruthy()
  })

  it('labels the first and the last row początek / koniec', () => {
    setup()
    expect(within(rows()[0]).getByText('początek')).toBeTruthy()
    expect(within(rows()[3]).getByText('koniec')).toBeTruthy()
    expect(within(rows()[1]).queryByText('początek')).toBeNull()
  })

  it('shows the on-request badge only on request stops', () => {
    setup({ stops: [stop(0), stop(1, { onRequest: true }), stop(2)] })
    expect(within(rows()[1]).getByText('na żądanie')).toBeTruthy()
    expect(within(rows()[0]).queryByText('na żądanie')).toBeNull()
  })

  it('shows the accessible icon only for wheelchair === 2', () => {
    setup({ stops: [stop(0, { wheelchair: 1 }), stop(1, { wheelchair: 2 }), stop(2, { wheelchair: 0 })] })
    expect(screen.getAllByLabelText('Przystanek niedostępny dla osób na wózku')).toHaveLength(1)
    expect(within(rows()[1]).getByLabelText('Przystanek niedostępny dla osób na wózku')).toBeTruthy()
  })

  it('names a stop with its number and keeps the street', () => {
    setup({ stops: [stop(0, { name: 'Centrum', code: '02', street: 'Marszałkowska' }), stop(1)] })
    expect(within(rows()[0]).getByText('Centrum 02')).toBeTruthy()
    expect(within(rows()[0]).getByText('Marszałkowska')).toBeTruthy()
  })

  it('wraps long names and never shrinks the time', () => {
    setup({ stops: [stop(0), stop(1, { name: 'Bardzo długa nazwa przystanku '.repeat(4) }), stop(2)] })
    const select = within(rows()[1]).getAllByRole('button')[0]
    expect(within(select).getByText(/Bardzo długa nazwa/).className).toContain('overflow-wrap:anywhere')
    expect(within(rows()[1]).getByText('+5 min').className).toContain('shrink-0')
  })

  it('presses only the first occurrence of a repeated stopId', () => {
    const stops = [stop(0), stop(1, { stopId: 'dup' }), stop(2), stop(3, { stopId: 'dup' })]
    setup({ stops, selectedStopId: 'dup' })
    const pressed = screen.getAllByRole('button', { pressed: true })
    expect(pressed).toHaveLength(1)
    expect(rows()[1].contains(pressed[0])).toBe(true)
  })

  it('marks the selected row with aria-pressed, bold and a primary outline (not colour alone)', () => {
    setup({ selectedStopId: 's2' })
    const selected = within(rows()[2]).getAllByRole('button')[0]
    expect(selected.getAttribute('aria-pressed')).toBe('true')
    expect(selected.className).toContain('font-semibold')
    expect(selected.className).toContain('outline-primary')
    expect(selected.className).not.toContain('indigo')
    const other = within(rows()[1]).getAllByRole('button')[0]
    expect(other.getAttribute('aria-pressed')).toBe('false')
  })

  it('highlights nothing when the selected stopId is not on the route', () => {
    setup({ selectedStopId: 'nie-ma' })
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
    expect(rows()).toHaveLength(4)
  })

  it('highlights nothing when selectedStopId is null', () => {
    setup({ selectedStopId: null })
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })

  it('shows +N min offsets without selectedBaseSec (none on the first stop)', () => {
    setup()
    expect(within(rows()[0]).queryByText(/min$/)).toBeNull()
    expect(within(rows()[1]).getByText('+5 min')).toBeTruthy()
    expect(within(rows()[3]).getByText('+15 min')).toBeTruthy()
  })

  it('shows clock times from selectedBaseSec + offsetSec instead of offsets', () => {
    const base = 8 * 3600
    setup({ selectedBaseSec: base })
    expect(within(rows()[0]).getByText(formatSecondsOfDay(base))).toBeTruthy()
    expect(within(rows()[2]).getByText(formatSecondsOfDay(base + 600))).toBeTruthy()
    expect(screen.queryByText(/^\+\d+ min$/)).toBeNull()
  })

  it('gives each row a select button and a sibling departures link, never nested', () => {
    setup({ stops: [stop(0, { name: 'Centrum', code: '02' }), stop(1), stop(2)] })
    const row = rows()[0]
    const button = within(row).getByRole('button')
    const link = within(row).getByRole('link', { name: 'Odjazdy z przystanku Centrum 02' })
    expect(button.contains(link)).toBe(false)
    expect(link.contains(button)).toBe(false)
    expect(link.getAttribute('href')).toBe('/city/warszawa/stop/s0?name=Centrum')
  })

  it('encodes the stop id and name in the departures link', () => {
    setup({ stops: [stop(0, { stopId: 'a:b/1', name: 'Św. Jana & Co' }), stop(1)] })
    const href = screen.getAllByRole('link')[0].getAttribute('href')!
    expect(href).toContain('/city/warszawa/stop/')
    expect(href).not.toContain('a:b/1')
    expect(href).toContain('?name=' + encodeURIComponent('Św. Jana & Co'))
  })

  it('gives buttons and links a 44 px touch target on phones', () => {
    setup()
    const row = rows()[1]
    expect(within(row).getByRole('button').className).toContain('max-sm:min-h-11')
    expect(within(row).getByRole('link').className).toContain('max-sm:min-h-11')
  })

  it('reports the stopId on click and does not report on link click', () => {
    const { onSelectStop } = setup()
    fireEvent.click(within(rows()[2]).getByRole('button'))
    expect(onSelectStop).toHaveBeenCalledTimes(1)
    expect(onSelectStop).toHaveBeenCalledWith('s2')
    const link = within(rows()[1]).getByRole('link')
    link.addEventListener('click', (e) => e.preventDefault())
    fireEvent.click(link)
    expect(onSelectStop).toHaveBeenCalledTimes(1)
  })

  it('renders a status message and no list for empty stops', () => {
    setup({ stops: [] })
    expect(screen.getByRole('status').textContent).toBe('Brak przebiegu tej linii.')
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('renders no vehicle markers without vehicles', () => {
    setup()
    expect(screen.queryAllByTestId('timeline-vehicle')).toHaveLength(0)
    setup({ vehicles: [] })
    expect(screen.queryAllByTestId('timeline-vehicle')).toHaveLength(0)
  })

  it('puts a vehicle after stop 1 on the axis of row 1 with sr-only text', () => {
    setup({ vehicles: [vehicle({ afterStopOrder: 1, ageSec: 180 })] })
    expect(screen.getAllByTestId('timeline-vehicle')).toHaveLength(1)
    const marker = within(rows()[1]).getByTestId('timeline-vehicle')
    expect(marker.textContent).toBe('Pojazd 1234, 3 min temu')
    expect(marker.style.top).toBe('40%')
    expect(within(rows()[0]).queryByTestId('timeline-vehicle')).toBeNull()
  })

  it('ignores a vehicle whose afterStopOrder is past the route', () => {
    setup({ vehicles: [vehicle({ afterStopOrder: 9 })] })
    expect(screen.queryAllByTestId('timeline-vehicle')).toHaveLength(0)
  })
})
