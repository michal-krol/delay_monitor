// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DayTimetable } from './DayTimetable'
import type { TimetableEntry } from '@/lib/gtfs/query'

const entry = (departureSec: number, over: Partial<TimetableEntry> = {}): TimetableEntry => ({
  tripId: 't',
  departureSec,
  plannedAt: '2026-09-02T00:00:00+02:00',
  headsign: 'Piaski',
  frequencyBased: false,
  ...over,
})

describe('DayTimetable', () => {
  it('groups minutes under hour rows, sorted', () => {
    render(<DayTimetable entries={[entry(8 * 3600 + 5 * 60), entry(8 * 3600 + 47 * 60), entry(6 * 3600 + 15 * 60)]} />)
    const rows = screen.getAllByRole('row')
    expect(rows[0]).toHaveTextContent('06')
    expect(rows[1]).toHaveTextContent('08')
    expect(rows[1]).toHaveTextContent('05')
    expect(rows[1]).toHaveTextContent('47')
  })

  it('collapses a past-midnight hour to the day clock (25:10 → row 01)', () => {
    render(<DayTimetable entries={[entry(25 * 3600 + 10 * 60)]} />)
    expect(screen.getByRole('rowheader')).toHaveTextContent('01')
    expect(screen.getByRole('cell')).toHaveTextContent('10')
  })

  it('shows a schedule-only empty state, never "na czas"', () => {
    render(<DayTimetable entries={[]} />)
    expect(screen.getByText(/nie kursuje/i)).toBeInTheDocument()
    expect(screen.queryByText(/na czas|opóźni/i)).not.toBeInTheDocument()
  })

  it('renders skeletons while loading', () => {
    const { container } = render(<DayTimetable entries={[]} loading />)
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})
