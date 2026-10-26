// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    ViewTransition: (props: { children?: React.ReactNode }) =>
      actual.createElement('div', { 'data-testid': 'vt', 'data-props': JSON.stringify({ ...props, children: undefined }) }, props.children),
  }
})
import { ConcreteTimetable } from './ConcreteTimetable'

const state = vi.hoisted(() => ({ data: null as unknown, error: null as string | null }))
vi.mock('@/hooks/usePolling', () => ({ usePolling: () => ({ ...state, refresh: vi.fn() }), fetchJson: vi.fn() }))
const props = { city: 'warszawa', routeId: '20', directionId: 0, stopId: '100101', occurrence: 1, day: 'weekday' as const, onDayChange: vi.fn() }

describe('ConcreteTimetable', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubWidth(wide: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: wide && query === '(min-width: 64rem)', addEventListener: () => {}, removeEventListener: () => {} }))
  }

  function readyTimetable() {
    state.error = null
    state.data = { schedule: { state: 'ready' }, timetable: [
      { tripId: 'sat', serviceDate: '2026-09-05', sequence: 1, occurrence: 1, departureSec: 43200, category: 'saturday' },
    ] }
  }

  it('crossfades the grid on a narrow day change while preserving its chip and reporting the chosen day', () => {
    stubWidth(false)
    readyTimetable()
    const onDayChange = vi.fn()
    render(<ConcreteTimetable {...props} onDayChange={onDayChange} />)
    const column = screen.getByRole('group', { name: 'Sobota' })
    const chip = screen.getByRole('button', { name: 'Sobota' })
    fireEvent.click(chip)
    expect(onDayChange).toHaveBeenCalledExactlyOnceWith('saturday')
    expect(screen.getByRole('group', { name: 'Sobota' })).not.toBe(column)
    expect(screen.getByRole('button', { name: 'Sobota' })).toBe(chip)
    expect(JSON.parse(screen.getByTestId('vt').getAttribute('data-props') ?? '{}')).toMatchObject({ name: 'line-day', share: 'auto', enter: 'auto', default: 'none' })
  })

  it('keeps the minute DOM and focus across desktop day changes, polling and crossing the breakpoint', () => {
    stubWidth(true)
    readyTimetable()
    const view = render(<ConcreteTimetable {...props} />)
    const minute = screen.getByRole('link', { name: /12:00, Sobota/ })
    minute.focus()
    fireEvent.click(screen.getByRole('button', { name: 'Sobota' }))
    view.rerender(<ConcreteTimetable {...props} day="saturday" />)
    readyTimetable()
    view.rerender(<ConcreteTimetable {...props} day="saturday" />)
    stubWidth(false)
    view.rerender(<ConcreteTimetable {...props} day="saturday" />)
    expect(screen.getByRole('link', { name: /12:00, Sobota/ })).toBe(minute)
    expect(minute).toHaveFocus()
  })

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
