// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TransitCourseView } from './TransitCourseView'
import type { CourseDetail } from '@/lib/gtfs/courses'

const mocks = vi.hoisted(() => ({ data: null as unknown, vehicles: [] as unknown[] }))
vi.mock('@/hooks/usePolling', () => ({ usePolling: () => ({ data: mocks.data, error: null, lastSuccessAt: 1, refresh: vi.fn() }), fetchJson: vi.fn() }))
vi.mock('@/hooks/useLineVehicles', () => ({ useLineVehicles: () => ({ vehicles: mocks.vehicles, feed: { state: 'ready' }, error: null }) }))
vi.mock('@/components/MapView', () => ({ MapView: ({ movers }: { movers: unknown[] }) => <div data-testid="course-movers">{movers.length}</div> }))
vi.mock('@/components/TopBar', () => ({ TopBar: () => null }))
vi.mock('@/components/aside', () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }))
const stop = { stopId: '100101', groupId: '1001', name: 'Centrum', code: '01', street: null, wheelchair: 0 as const, lat: 52, lon: 21, offsetSec: 0, onRequest: true, sequence: 3, departureSec: 86700, plannedAt: '2026-09-03T00:05:00+02:00' }
const course: CourseDetail = { tripId: 'loop', serviceDate: '2026-09-02', directionId: 0, headsign: 'Centrum', departureSec: 86700, shape: null, stops: [stop, { ...stop, sequence: 4, offsetSec: 300 }] }

describe('TransitCourseView', () => {
  it('retains GPS after midnight for the previous service day, never for a different service instance', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-03T00:07:00+02:00'))
    mocks.vehicles = [{ tripId: 'loop', sideNumber: '1', lat: 52, lon: 21, ageSec: 15, bearing: null, afterStopOrder: 0, fraction: 0 }]
    mocks.data = { line: { line: '20', mode: 'tram', kind: 'regular' }, course, alerts: [], attribution: [], schedule: { state: 'ready' } }
    const { unmount } = render(<TransitCourseView city="warszawa" routeId="20" selection={{ tripId: 'loop', serviceDate: '2026-09-02', sequence: null, stopId: null }} />)
    expect(screen.getByTestId('course-movers')).toHaveTextContent('1')
    unmount()
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-04T00:07:00+02:00'))
    render(<TransitCourseView city="warszawa" routeId="20" selection={{ tripId: 'loop', serviceDate: '2026-09-02', sequence: null, stopId: null }} />)
    expect(screen.getByTestId('course-movers')).toHaveTextContent('0')
    vi.restoreAllMocks()
    mocks.vehicles = []
  })
  it('shows actual course, complete occurrence count, selected stop and explicit schematic map', () => {
    mocks.data = { line: { line: '20', mode: 'tram', kind: 'regular' }, course, alerts: [], attribution: [], schedule: { state: 'ready' } }
    render(<TransitCourseView city="warszawa" routeId="20" selection={{ tripId: 'loop', serviceDate: '2026-09-02', sequence: 4, stopId: '100101' }} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Kurs linii 20')
    expect(screen.getByText(/Schemat połączeń między przystankami/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Trasa linii · 2 przystanki/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Wróć do odjazdów/ })).toHaveAttribute('href', '/city/warszawa/stop/100101?przystanek=100101')
  })
  it('distinguishes an unavailable course from a nonexistent line', () => {
    mocks.data = { line: { line: '20', mode: 'tram', kind: 'regular' }, course: null, alerts: [], attribution: [], schedule: { state: 'ready' } }
    render(<TransitCourseView city="warszawa" routeId="20" selection={{ tripId: 'missing', serviceDate: '2026-09-02', sequence: null, stopId: null }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Ten kurs nie jest dostępny w aktualnym rozkładzie')
    expect(screen.getByRole('link', { name: /Zobacz rozkład linii/ })).toBeInTheDocument()
  })
})
