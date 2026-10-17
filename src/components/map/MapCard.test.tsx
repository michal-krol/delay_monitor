// @vitest-environment jsdom
import { BottomSheet } from '../BottomSheet'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MapCard } from './MapCard'
import type { CityVehicle } from '@/lib/gtfs/cityVehicles'
import { BusIcon, ICON_SIZE, OtherModeIcon } from '../icons'
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
    routeId: '20', shortName: '20', mode: 'tram', kind: 'regular', directionId: 0, nextStop: { name: 'Rondo ONZ', code: null, groupId: '7002' }, ...over,
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
  it('inside the bottom sheet the stop notices collapse into one summary (phone)', () => {
    const notice = { id: 'a', routes: ['20'], effect: 'REDUCED_SERVICE', link: '', title: 'Objazd linii 20', body: '' }
    transitBoard.mockReturnValue({ data: { stops: [{ stopId: '1001', alerts: [notice], members: [], lines: [], departures: [] }] }, error: null })
    render(
      <BottomSheet>
        <MapCard
          selection={{ kind: 'stop', id: '1001', groupId: '1001', name: 'Centrum', code: null, mode: 'tram', lat: 52.23, lon: 21.01 }}
          vehicle={null}
          city="warszawa"
          onClose={() => {}}
        />
      </BottomSheet>
    )
    expect(screen.getByText('Komunikaty (1)')).toBeInTheDocument()
  })

  it('asks for the post departures only and links to the stop timetable', () => {
    transitBoard.mockReturnValue({ data: null, error: null })
    render(
      <MapCard
        selection={{ kind: 'stop', id: '100101', groupId: '1001', name: 'Centrum', code: '01', mode: 'bus', lat: 52.23, lon: 21.01 }}
        vehicle={null}
        city="warszawa"
        onClose={() => {}}
      />
    )
    expect(transitBoard).toHaveBeenCalledWith('warszawa', ['100101'], 3, '100101')
    // Jeden przystanek zespołu = zawsze z numerem; goła nazwa oznacza cały zespół.
    expect(screen.getByRole('dialog', { name: 'Centrum 01' })).toBeInTheDocument()
    expect(screen.getByText('Przystanek autobusowy')).toBeInTheDocument()
    expect(screen.getByText(/rozkład/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Rozkład przystanku/ })).toHaveAttribute('href', '/city/warszawa/stop/100101')
  })

  // PR0 review: numer przystanku przy odjeździe tylko w zespole z więcej niż jednym przystankiem.
  it('tags group departures with the stop number only when the group has more than one stop', () => {
    const tram20 = { routeId: '20', line: '20', mode: 'tram', kind: 'regular' }
    const departure = {
      tripId: 't', routeId: '20', line: '20', mode: 'tram', lineKind: 'regular', headsign: 'Piaski', plannedAt: '2026-09-02T14:30:00+02:00',
      departureSec: 52200, serviceDate: '2026-09-02', stopId: '100101', platformCode: '01', stopCode: null, wheelchair: 0, frequencyBased: false, onRequest: false,
    }
    const board = (members: unknown[]) => ({ data: { stops: [{ stopId: '1001', alerts: [], lines: [tram20], departures: [departure], members }] }, error: null })
    const selection = { kind: 'stop' as const, id: '1001', groupId: '1001', name: 'Centrum', code: null, mode: 'tram' as const, lat: 52.23, lon: 21.01 }

    transitBoard.mockReturnValue(board([{ id: '100101', lines: [tram20] }]))
    const { unmount } = render(<MapCard selection={selection} vehicle={null} city="warszawa" onClose={() => {}} />)
    expect(screen.queryByTitle('Odjazd z przystanku 01')).not.toBeInTheDocument()
    unmount()

    transitBoard.mockReturnValue(board([{ id: '100101', lines: [tram20] }, { id: '100102', lines: [tram20] }]))
    render(<MapCard selection={selection} vehicle={null} city="warszawa" onClose={() => {}} />)
    expect(screen.getByTitle('Odjazd z przystanku 01')).toBeInTheDocument()
  })

  it('names a rail or other GTFS stop by its own mode, not as a bus stop', () => {
    transitBoard.mockReturnValue({ data: null, error: null })
    const stop = (mode: 'rail' | 'other') => ({ kind: 'stop' as const, id: '1001', groupId: '1001', name: 'Centrum', code: null, mode, lat: 52.23, lon: 21.01 })
    const { rerender } = render(<MapCard selection={stop('rail')} vehicle={null} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText('Stacja kolei miejskiej')).toBeInTheDocument()
    rerender(<MapCard selection={stop('other')} vehicle={null} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText('Przystanek')).toBeInTheDocument()
    expect(screen.queryByText('Przystanek autobusowy')).toBeNull()
  })

  it('reports a failed timetable fetch', () => {
    transitBoard.mockReturnValue({ data: null, error: 'boom' })
    render(
      <MapCard selection={{ kind: 'stop', id: '1001', groupId: '1001', name: 'Centrum', code: null, mode: 'metro', lat: null, lon: null }} vehicle={null} city="warszawa" onClose={() => {}} />
    )
    expect(transitBoard).toHaveBeenCalledWith('warszawa', ['1001'], 3, null)
    expect(screen.getByRole('dialog', { name: 'Centrum' })).toBeInTheDocument()
    expect(screen.getByText('Stacja metra')).toBeInTheDocument()
    expect(screen.getByText('Nie udało się pobrać rozkładu.')).toBeInTheDocument()
  })
})

describe('MapCard — vehicle', () => {
  it('names the next stop with its number in the group', () => {
    render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle({ nextStop: { name: 'Rondo ONZ', code: '02', groupId: '7002' } })} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText('Rondo ONZ 02')).toBeInTheDocument()
  })

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

  it('puts the next stop and both primary actions before the details, so a peek sheet shows them', () => {
    render(
      <MapCard
        selection={{ kind: 'vehicle', id: 'v1' }}
        vehicle={vehicle({ nextStop: { name: 'Rondo ONZ', code: '02', groupId: '7002' } })}
        city="warszawa"
        onClose={() => {}}
        onShowRoute={() => {}}
        onToggleFollow={() => {}}
      />
    )
    const follow = screen.getByRole('button', { name: 'Śledź pojazd' })
    const route = screen.getByRole('button', { name: 'Pokaż trasę na mapie' })
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    for (const later of [screen.getByText('Numer boczny'), screen.getByText(/Komunikacja miejska nie publikuje opóźnień/), screen.getByRole('link', { name: /Rozkład linii/ })]) {
      expect(before(screen.getByText('Rondo ONZ 02'), later)).toBe(true)
      expect(before(follow, later)).toBe(true)
      expect(before(route, later)).toBe(true)
    }
    // Obie akcje w jednym rzędzie: razem jedna wysokość przycisku (44 px), nie dwie.
    expect(follow.parentElement).toBe(route.parentElement) // eslint-disable-line testing-library/no-node-access -- układ rzędu
    expect(follow).toHaveClass('chip-filter') // 44 px z `--control-min`
    expect(route).toHaveClass('chip-filter') // 44 px z `--control-min`
  })

  it('a lost position keeps the route action up front and offers no follow', () => {
    render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle({ ageSec: 181 })} city="warszawa" onClose={() => {}} onShowRoute={() => {}} onToggleFollow={() => {}} />)
    const status = screen.getByRole('status')
    const route = screen.getByRole('button', { name: 'Pokaż trasę na mapie' })
    expect(status.compareDocumentPosition(route) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Śledź/ })).toBeNull()
  })

  it('marks a fading position as stale and a vanished vehicle explicitly', () => {
    const { rerender } = render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle({ ageSec: 120, nextStop: null })} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText('nieaktualna')).toBeInTheDocument()
    expect(screen.getByText('nie wiadomo')).toBeInTheDocument()
    rerender(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={null} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText(/Pojazd zniknął z mapy/)).toBeInTheDocument()
  })

  it('says how old the GPS position is — „Pozycja sprzed …”, never the fetch time', () => {
    const { rerender } = render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle({ ageSec: 12 })} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText(/Pozycja sprzed 12 s/)).toBeInTheDocument()
    rerender(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle({ ageSec: 91 })} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText(/Pozycja sprzed 2 min/)).toBeInTheDocument()
    expect(screen.getByText('nieaktualna')).toBeInTheDocument()
  })

  it('selected vehicle older than 180s shows position-lost text', () => {
    render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle({ ageSec: 181 })} city="warszawa" onClose={() => {}} onShowRoute={() => {}} onToggleFollow={() => {}} />)
    expect(screen.getByText('Utracono pozycję pojazdu — ostatnia sprzed 3 min')).toBeInTheDocument()
    // Żadnego pozornie aktualnego punktu ani akcji na martwej pozycji.
    expect(screen.queryByText(/Pozycja sprzed/)).toBeNull()
    expect(screen.queryByText('aktualna')).toBeNull()
    expect(screen.queryByRole('button', { name: /Śledź/ })).toBeNull()
  })

  it('exactly 180 s is still a position (the map hides only above it)', () => {
    render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle({ ageSec: 180 })} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText(/Pozycja sprzed 3 min/)).toBeInTheDocument()
    expect(screen.queryByText(/Utracono pozycję/)).toBeNull()
  })

  it('a vehicle of an unknown trip does not pose as a bus', () => {
    render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle({ routeId: null, shortName: null, mode: null, kind: null })} city="warszawa" onClose={() => {}} />)
    // eslint-disable-next-line testing-library/no-node-access -- dekoracyjna ikona (aria-hidden), bez roli
    const glyph = (root: ParentNode) => root.querySelector('svg')!.innerHTML
    const chip = glyph(screen.getByRole('dialog').querySelector('header')!) // eslint-disable-line testing-library/no-node-access -- jak wyżej
    expect(chip).toBe(glyph(render(<OtherModeIcon size={ICON_SIZE.chip} />).container))
    expect(chip).not.toBe(glyph(render(<BusIcon size={ICON_SIZE.chip} />).container))
  })

  it('a vehicle of mode "other" is headed „Linia 20", not „Inne 20"', () => {
    render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle({ mode: 'other' })} city="warszawa" onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Linia 20' })).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: 'Przypnij do Startu' }))
    expect(onTogglePin).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Co jest w pobliżu?' }))
    expect(onNearby).toHaveBeenCalled()
  })

  it('"Co jest w pobliżu?" and "Pokaż trasę na mapie" are 44 px touch targets (min-h-11)', () => {
    railStatus.mockReturnValue({ status: null, error: false })
    const { unmount } = render(<MapCard selection={rail} vehicle={null} city="warszawa" onClose={() => {}} onNearby={() => {}} />)
    expect(screen.getByRole('button', { name: 'Co jest w pobliżu?' })).toHaveClass('min-h-11')
    unmount()
    render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle()} city="warszawa" onClose={() => {}} onShowRoute={() => {}} />)
    expect(screen.getByRole('button', { name: 'Pokaż trasę na mapie' })).toHaveClass('chip-filter') // 44 px z `--control-min`
  })

  it('shows the pressed star for a pinned item', () => {
    railStatus.mockReturnValue({ status: null, error: false })
    render(<MapCard selection={rail} vehicle={null} city="warszawa" onClose={() => {}} pinned onTogglePin={() => {}} />)
    expect(screen.getByRole('button', { name: 'Odepnij ze Startu' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('flags a vehicle whose line has an active disruption', () => {
    const { rerender } = render(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle()} city="warszawa" onClose={() => {}} alertLines={['20']} />)
    expect(screen.getByText(/Utrudnienia na linii/)).toBeInTheDocument()
    rerender(<MapCard selection={{ kind: 'vehicle', id: 'v1' }} vehicle={vehicle()} city="warszawa" onClose={() => {}} alertLines={['9']} />)
    expect(screen.queryByText(/Utrudnienia na linii/)).toBeNull()
  })

  it('shows stop alerts from the timetable board', () => {
    transitBoard.mockReturnValue({
      data: { stops: [{ stopId: '100101', members: [], lines: [], departures: [], alerts: [{ id: 'a1', routes: ['128'], effect: 'DETOUR', link: '', title: 'Objazd linii 128', body: 'Remont' }] }] },
      error: null,
    })
    render(<MapCard selection={{ kind: 'stop', id: '100101', groupId: '1001', name: 'Centrum', code: '01', mode: 'bus', lat: 52.23, lon: 21.01 }} vehicle={null} city="warszawa" onClose={() => {}} />)
    expect(screen.getByText('Objazd linii 128')).toBeInTheDocument()
  })
})
