// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MapCard } from './MapCard'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import { LINE_PALETTE } from '../transitMode'

const railStatus = vi.fn()
vi.mock('@/hooks/useRailStations', () => ({ useRailStationStatus: (id: string | null) => railStatus(id) }))
const transitBoard = vi.fn()
vi.mock('@/hooks/useTransitBoard', () => ({
  useTransitBoard: (...args: unknown[]) => transitBoard(...args),
}))

const rail = { kind: 'rail' as const, id: '33605', name: 'Warszawa Centralna', lat: 52.23, lon: 21.0 }

function vehicle(over: Partial<CityVehicle> = {}): CityVehicle {
  return {
    id: 'v1', lat: 52.2, lon: 21.0, bearing: null, sideNumber: '3801', ageSec: 12, headsign: 'Dworzec Centralny',
    routeId: '20', shortName: '20', mode: 'tram', kind: 'regular', directionId: 0, nextStop: { name: 'Rondo ONZ', groupId: '7002' }, ...over,
  }
}

beforeEach(() => {
  railStatus.mockReset()
  transitBoard.mockReset()
})

describe('MapCard — rail station', () => {
  it('shows departures with platform/track and delay, plus the board link', () => {
    railStatus.mockReturnValue({
      error: false,
      status: {
        id: '33605', status: 'delayed', ageMs: 18_000,
        nextDepartures: [{ plannedAt: '2026-09-26T20:24:00+02:00', headsign: 'Lublin Główny', delayMinutes: 4, status: 'delayed', trainLabel: 'IC 1234', carrier: 'IC', platform: '3', track: '8' }],
      },
    })
    render(<MapCard selection={rail} vehicle={null} city="warszawa" onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.getByText('Lublin Główny')).toBeInTheDocument()
    expect(screen.getByText(/IC 1234 · peron 3 \/ tor 8/)).toBeInTheDocument()
    expect(screen.getByText('Aktualizacja 18 s temu')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Pełna tablica/ })).toHaveAttribute('href', '/station/33605')
  })

  it('says "not tracked" — never "no departures" — when the poller does not hold the station', () => {
    railStatus.mockReturnValue({ status: null, error: false })
    render(<MapCard selection={rail} vehicle={null} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText(/Nie śledzimy teraz tej stacji/)).toBeInTheDocument()
    expect(screen.queryByText(/Brak odjazdów/)).toBeNull()
  })

  it('distinguishes a failed check from loading', () => {
    railStatus.mockReturnValue({ status: undefined, error: true })
    render(<MapCard selection={rail} vehicle={null} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText('Nie udało się sprawdzić odjazdów.')).toBeInTheDocument()
  })
})

describe('MapCard — stop', () => {
  it('asks for the post departures only and links to the stop timetable', () => {
    transitBoard.mockReturnValue({ data: null, error: null })
    render(
      <MapCard
        selection={{ kind: 'stop', id: '100101', groupId: '1001', name: 'Centrum', mode: 'bus', lat: 52.23, lon: 21.01 }}
        vehicle={null}
        city="warszawa"
        onClose={() => {}}
      />
    )
    expect(transitBoard).toHaveBeenCalledWith('warszawa', ['100101'], 3, '100101')
    expect(screen.getByText('Przystanek autobusowy')).toBeInTheDocument()
    expect(screen.getByText(/rozkład/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Rozkład przystanku/ })).toHaveAttribute('href', '/city/warszawa/stop/100101')
  })

  it('reports a failed timetable fetch', () => {
    transitBoard.mockReturnValue({ data: null, error: 'boom' })
    render(
      <MapCard selection={{ kind: 'stop', id: '1001', groupId: '1001', name: 'Centrum', mode: 'metro', lat: null, lon: null }} vehicle={null} city="warszawa" onClose={() => {}} />
    )
    expect(transitBoard).toHaveBeenCalledWith('warszawa', ['1001'], 3, null)
    expect(screen.getByText('Stacja metra')).toBeInTheDocument()
    expect(screen.getByText('Nie udało się pobrać rozkładu.')).toBeInTheDocument()
  })
})

describe('MapCard — vehicle', () => {
  it('shows line, direction, next stop and freshness — no delay', () => {
    render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle()} city="warszawa" onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: 'tramwaj 20' })).toBeInTheDocument()
    expect(screen.getByText('Dworzec Centralny')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'do' })).toBeInTheDocument()
    expect(screen.getByText('Rondo ONZ')).toBeInTheDocument()
    expect(screen.getByText('aktualna')).toBeInTheDocument()
    expect(screen.queryByText(/opóźnieni[ae] \+/)).toBeNull()
    expect(screen.getByRole('link', { name: /Rozkład linii/ })).toHaveAttribute('href', '/city/warszawa/line/20')
  })

  it('marks a fading position as stale and a vanished vehicle explicitly', () => {
    const { rerender } = render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle({ ageSec: 120, nextStop: null })} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText('nieaktualna')).toBeInTheDocument()
    expect(screen.getByText('nie wiadomo')).toBeInTheDocument()
    rerender(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={null} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText(/Pojazd zniknął z mapy/)).toBeInTheDocument()
  })

  it('colours the line badge by the served kind, not one re-derived from the number', () => {
    render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle({ mode: 'bus', shortName: '131', kind: 'night' })} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText('131', { selector: 'span' })).toHaveStyle({ background: LINE_PALETTE.night.bg })
  })

  it('handles a vehicle without a line', () => {
    render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle({ routeId: null, shortName: null, mode: null, kind: null, headsign: null })} city="warszawa" onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Pojazd' })).toBeInTheDocument()
    expect(screen.getByText('Brak przypisania do linii.')).toBeInTheDocument()
  })
})

describe('MapCard — focus and closing', () => {
  it('focuses the heading, closes on Escape and on the close button', () => {
    railStatus.mockReturnValue({ status: null, error: false })
    const onClose = vi.fn()
    render(<MapCard selection={rail} vehicle={null} city="warszawa" onClose={onClose} />)
    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij kartę' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('MapCard — focus return', () => {
  it('gives focus back to the element that opened the card when it closes', () => {
    railStatus.mockReturnValue({ status: null, error: false })
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const { unmount } = render(<MapCard selection={rail} vehicle={null} city="warszawa" onClose={() => {}} />)
    expect(trigger).not.toHaveFocus()
    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})

describe('MapCard — pinned items, nearby, disruptions', () => {
  it('toggles the pin star and offers "what is nearby" for places', () => {
    railStatus.mockReturnValue({ status: null, error: false })
    const onTogglePin = vi.fn()
    const onNearby = vi.fn()
    render(<MapCard selection={rail} vehicle={null} city="warszawa" onClose={() => {}} pinned={false} onTogglePin={onTogglePin} onNearby={onNearby} />)
    fireEvent.click(screen.getByRole('button', { name: 'Przypnij do Pulpitu' }))
    expect(onTogglePin).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Co jest w pobliżu?' }))
    expect(onNearby).toHaveBeenCalled()
  })

  it('shows the pressed star for a pinned item', () => {
    railStatus.mockReturnValue({ status: null, error: false })
    render(<MapCard selection={rail} vehicle={null} city="warszawa" onClose={() => {}} pinned onTogglePin={() => {}} />)
    expect(screen.getByRole('button', { name: 'Odepnij z Pulpitu' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('flags a vehicle whose line has an active disruption', () => {
    const { rerender } = render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle()} city="warszawa" onClose={() => {}} alertLines={['20']} />)
    expect(screen.getByText(/Utrudnienia na tej linii/)).toBeInTheDocument()
    rerender(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle()} city="warszawa" onClose={() => {}} alertLines={['9']} />)
    expect(screen.queryByText(/Utrudnienia na tej linii/)).toBeNull()
  })

  it('shows stop alerts from the timetable board', () => {
    transitBoard.mockReturnValue({
      data: { stops: [{ stopId: '100101', members: [], lines: [], departures: [], alerts: [{ id: 'a1', routes: ['128'], effect: 'DETOUR', link: '', title: 'Objazd linii 128', body: 'Remont' }] }] },
      error: null,
    })
    render(<MapCard selection={{ kind: 'stop', id: '100101', groupId: '1001', name: 'Centrum', mode: 'bus', lat: 52.23, lon: 21.01 }} vehicle={null} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText('Objazd linii 128')).toBeInTheDocument()
  })
})
