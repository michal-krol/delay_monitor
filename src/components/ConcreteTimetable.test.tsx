// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConcreteTimetable } from './ConcreteTimetable'

const state = vi.hoisted(() => ({ data: null as unknown, error: null as string | null }))
vi.mock('@/hooks/usePolling', () => ({ usePolling: () => ({ ...state, refresh: vi.fn() }), fetchJson: vi.fn() }))
const props = { city: 'warszawa', routeId: '20', directionId: 0, stopId: '100101', occurrence: 1, day: 'weekday' as const, onDayChange: vi.fn() }

describe('ConcreteTimetable', () => {
  it('links only the selected loop occurrence and keeps real trip/date/sequence identity', () => {
    state.data = { schedule: { state: 'ready' }, timetable: [
      { tripId: 'loop', serviceDate: '2026-09-02', sequence: 1, occurrence: 0, departureSec: 86700, category: 'weekday' },
      { tripId: 'loop', serviceDate: '2026-09-02', sequence: 3, occurrence: 1, departureSec: 87300, category: 'weekday' },
    ] }
    state.error = null
    render(<ConcreteTimetable {...props} />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/city/warszawa/line/20?trip=loop&date=2026-09-02&stop=100101&seq=3')
    expect(links[0]).toHaveAccessibleName(/00:15.*2026-09-02/)
    expect(screen.getByText('+1 dzień')).toBeInTheDocument()
  })
  it('shows unavailable schedule as failure, never an empty successful timetable', () => {
    state.data = { schedule: { state: 'failed' } }
    render(<ConcreteTimetable {...props} />)
    expect(screen.getByRole('status')).toHaveTextContent('Nie udało się pobrać rozkładu.')
    expect(screen.queryByText('Brak kursów w tej kategorii dnia.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument()
  })
  it('explains distinct Friday minutes while preserving the weekday category', () => {
    state.data = { schedule: { state: 'ready' }, timetable: [
      { tripId: 'fri', serviceDate: '2026-09-04', sequence: 1, occurrence: 0, departureSec: 43200, category: 'friday' },
    ] }
    render(<ConcreteTimetable {...props} occurrence={0} />)
    expect(screen.getByText(/osobny rozkład piątkowy/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Piątek.*2026-09-04/ })).toHaveAttribute('href', '/city/warszawa/line/20?trip=fri&date=2026-09-04&stop=100101&seq=1')
  })
})
