// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LineStatistics } from './LineStatistics'
import type { LineDetail, LineRouteStop } from '@/lib/gtfs/query'
import type { LineVehiclesState } from '@/hooks/useLineVehicles'

const stop: LineRouteStop = { stopId: '100101', groupId: '1001', name: 'Centrum', code: '01', street: null, wheelchair: 1, lat: 52, lon: 21, offsetSec: 0, onRequest: true }
const line: LineDetail = { routeId: '20', line: '20', longName: 'Centrum', mode: 'tram', kind: 'regular', directions: [{ directionId: 0, headsign: 'Centrum', origin: null, shape: null, stops: [stop, stop], departures: [] }] }
const state = (feed: string, error: string | null = null): LineVehiclesState => ({ vehicles: [], feed: { state: feed, ageMs: null }, error })

describe('LineStatistics', () => {
  it('renders per-vehicle status and an exact vehicle map link beside the side number', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-02T14:35:00+02:00'))
    const live = state('ready')
    live.vehicles = [{ id: 'V/20/1', sideNumber: '3801', tripId: 'trip', serviceDate: '2026-09-02', observedAt: '2026-09-02T14:35:00+02:00', pastScheduledDeparture: true, routeId: '20', directionId: 0, afterStopOrder: 0, fraction: 0, lat: 52, lon: 21, ageSec: 0, headsign: 'Centrum', bearing: null }]
    render(<LineStatistics city="warszawa" line={line} vehicles={{ 0: live }} />)
    expect(screen.getByRole('img', { name: 'Po planowanym odjeździe' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pokaż pojazd 3801 na mapie' })).toHaveAttribute('href', expect.stringContaining('vehicle=V%2F20%2F1'))
    vi.restoreAllMocks()
  })
  it('counts repeated stop occurrences and request stops without deduplicating', () => {
    render(<LineStatistics line={line} vehicles={{ 0: state('ready') }} />)
    expect(screen.getByText('2 przystanki · 2 na żądanie')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pojazdy w trasie: 0' })).toBeInTheDocument()
  })
  it.each([
    ['loading', null, 'Wczytywanie pozycji…'],
    ['failed', null, 'Nie udało się pobrać pozycji.'],
    ['ready', 'network', 'Nie udało się pobrać pozycji.'],
    ['idle', null, 'Brak danych o pozycjach pojazdów'],
  ])('never turns unavailable %s positions into zero', (feed, error, copy) => {
    render(<LineStatistics line={line} vehicles={{ 0: state(feed, error) }} />)
    expect(screen.getByText(copy)).toBeInTheDocument()
    expect(screen.queryByText('Pojazdy w trasie: 0')).not.toBeInTheDocument()
  })
  it('keeps the last fleet and its age after a failed refresh', () => {
    const live = state('failed', 'network')
    live.vehicles = [{ sideNumber: '3801', tripId: 'trip', routeId: '20', directionId: 0, afterStopOrder: 0, fraction: 0, lat: 52, lon: 21, ageSec: 7200, headsign: 'Centrum', bearing: null }]
    render(<LineStatistics line={line} vehicles={{ 0: live }} />)
    expect(screen.getByText('#3801')).toBeInTheDocument()
    expect(screen.getByText(/GPS: 2 h temu/)).toBeInTheDocument()
    expect(screen.getByText('Nie udało się odświeżyć pozycji. Pokazujemy ostatnie dane.')).toBeInTheDocument()
  })
})
