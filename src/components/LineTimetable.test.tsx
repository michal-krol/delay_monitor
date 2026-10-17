// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LineTimetable } from './LineTimetable'
import type { LineDepartureBlock } from '@/lib/gtfs/query'
import type { LineDay } from '@/lib/lineViewState'

const H = 3600
const blocks: LineDepartureBlock[] = [
  { category: 'weekday', times: [6 * H, 6 * H + 1200, 22 * H], frequencyBased: false },
  { category: 'saturday', times: [8 * H], frequencyBased: false },
]

type Over = Partial<{
  blocks: LineDepartureBlock[]
  offsetSec: number
  selectedBaseSec: number | null
  day: LineDay
  onSelect: (baseSec: number | null) => void
  onDayChange: (day: LineDay) => void
}>
function renderTimetable(over: Over = {}) {
  const props = { blocks, offsetSec: 0, selectedBaseSec: null, onSelect: () => {}, ...over }
  return render(<LineTimetable {...props} />)
}

const column = (name: string) => screen.getByRole('group', { name })
const dayChips = () => within(screen.getByRole('group', { name: 'Kategoria dnia' }))

describe('LineTimetable — categories', () => {
  it('offers the three weekly categories as chips, „Dni robocze” pressed by default', () => {
    renderTimetable()
    expect(dayChips().getAllByRole('button').map((b) => b.textContent)).toEqual(['Dni robocze', 'Soboty', 'Niedziele i święta'])
    expect(dayChips().getByRole('button', { name: 'Dni robocze' })).toHaveAttribute('aria-pressed', 'true')
    expect(dayChips().getByRole('button', { name: 'Soboty' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows ONE category at a time below lg (the others are max-lg:hidden) and every column from lg', () => {
    renderTimetable({ day: 'saturday' })
    expect(column('Soboty')).not.toHaveClass('max-lg:hidden')
    expect(column('Dni robocze')).toHaveClass('max-lg:hidden')
    expect(column('Niedziele i święta')).toHaveClass('max-lg:hidden')
    // chipy tylko poniżej lg; od lg kolumny stoją obok siebie
    expect(screen.getByRole('group', { name: 'Kategoria dnia' })).toHaveClass('lg:hidden')
  })

  it('reports the chosen day through onDayChange', async () => {
    const onDayChange = vi.fn()
    renderTimetable({ day: 'weekday', onDayChange })
    await userEvent.setup().click(dayChips().getByRole('button', { name: 'Niedziele i święta' }))
    expect(onDayChange).toHaveBeenCalledWith('sunday')
  })

  it('still switches categories without the new props (uncontrolled fallback for older consumers)', async () => {
    renderTimetable()
    await userEvent.setup().click(dayChips().getByRole('button', { name: 'Soboty' }))
    expect(dayChips().getByRole('button', { name: 'Soboty' })).toHaveAttribute('aria-pressed', 'true')
    expect(column('Soboty')).not.toHaveClass('max-lg:hidden')
    expect(column('Dni robocze')).toHaveClass('max-lg:hidden')
  })

  it('adds „Inne dni” only when the other category has departures — no false chip', () => {
    const { unmount } = renderTimetable({ blocks: [...blocks, { category: 'other', times: [], frequencyBased: false }] })
    expect(dayChips().queryByRole('button', { name: 'Inne dni' })).not.toBeInTheDocument()
    unmount()
    renderTimetable({ blocks: [...blocks, { category: 'other', times: [9 * H], frequencyBased: false }], day: 'other' })
    expect(dayChips().getByRole('button', { name: 'Inne dni' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('falls back to „Dni robocze” for day=other when the line has no such category', () => {
    renderTimetable({ day: 'other' })
    expect(dayChips().getByRole('button', { name: 'Dni robocze' })).toHaveAttribute('aria-pressed', 'true')
    expect(column('Dni robocze')).not.toHaveClass('max-lg:hidden')
  })

  it('says a ready but empty category is empty and keeps the other days one tap away', () => {
    renderTimetable({ day: 'sunday' })
    expect(within(column('Niedziele i święta')).getByText('Brak kursów w tej kategorii dnia')).toBeInTheDocument()
    expect(dayChips().getByRole('button', { name: 'Dni robocze' })).toBeEnabled()
  })

  it('notes the empty schedule instead of an empty table when there are no departures at all', () => {
    renderTimetable({ blocks: [] })
    expect(screen.getByText(/Brak kursów w rozkładzie/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Kategoria dnia' })).not.toBeInTheDocument()
  })
})

describe('LineTimetable — cells', () => {
  it('applies the stop offset to the shown time and names each minute with its category', () => {
    renderTimetable({ offsetSec: 480 })
    // 06:00 + 8 min; sobota 08:00 + 8 min
    expect(within(column('Dni robocze')).getByRole('button', { name: '06:08, Dni robocze' })).toHaveTextContent('08')
    expect(within(column('Soboty')).getByRole('button', { name: '08:08, Soboty' })).toBeInTheDocument()
  })

  it('merges friday into the weekday column without duplicates', () => {
    renderTimetable({
      blocks: [
        { category: 'weekday', times: [6 * H, 7 * H], frequencyBased: false },
        { category: 'friday', times: [7 * H, 23 * H], frequencyBased: false },
      ],
    })
    const weekday = within(column('Dni robocze'))
    expect(weekday.getAllByRole('button', { name: '07:00, Dni robocze' })).toHaveLength(1)
    expect(weekday.getByRole('button', { name: '23:00, Dni robocze' })).toBeInTheDocument()
  })

  it('explains the weekday column only when the friday timetable differs', () => {
    const { unmount } = renderTimetable({
      blocks: [
        { category: 'weekday', times: [6 * H], frequencyBased: false },
        { category: 'friday', times: [6 * H, 23 * H], frequencyBased: false },
      ],
    })
    expect(within(column('Dni robocze')).getByText(/Piątek ma osobny rozkład/)).toBeInTheDocument()
    unmount()
    renderTimetable({
      blocks: [
        { category: 'weekday', times: [6 * H], frequencyBased: false },
        { category: 'friday', times: [6 * H], frequencyBased: false },
      ],
    })
    expect(screen.queryByText(/Piątek ma osobny rozkład/)).not.toBeInTheDocument()
  })

  it('keeps the minutes at 44 px touch targets below lg', () => {
    renderTimetable()
    const minute = within(column('Dni robocze')).getByRole('button', { name: '06:00, Dni robocze' })
    expect(minute).toHaveClass('max-lg:min-h-11', 'max-lg:min-w-11')
  })

  it('marks frequency-based times as approximate — in the label, the glyph and a note', () => {
    renderTimetable({ blocks: [{ category: 'weekday', times: [6 * H], frequencyBased: true }] })
    const minute = within(column('Dni robocze')).getByRole('button', { name: '06:00, Dni robocze, orientacyjnie' })
    expect(minute).toHaveTextContent('00~')
    expect(screen.getByText(/według częstotliwości/)).toBeInTheDocument()
  })
})

describe('LineTimetable — after midnight', () => {
  const night: LineDepartureBlock[] = [{ category: 'weekday', times: [25 * H, 23 * H + 50 * 60, 24 * H + 10 * 60], frequencyBased: false }]

  it('keeps 23:50, 24:10 and 25:00 in operating order, the late ones marked „+1 dzień”', () => {
    renderTimetable({ blocks: night })
    const rows = within(column('Dni robocze')).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual(['2350', '00+1 dzień10', '01+1 dzień00'])
    expect(within(rows[0]).getByRole('button')).toHaveAccessibleName('23:50, Dni robocze')
    expect(within(rows[1]).getByRole('button')).toHaveAccessibleName('00:10, Dni robocze, następny dzień')
    expect(within(rows[2]).getByRole('button')).toHaveAccessibleName('01:00, Dni robocze, następny dzień')
    expect(within(rows[1]).getByText('+1 dzień')).toBeInTheDocument()
    expect(within(rows[0]).queryByText('+1 dzień')).not.toBeInTheDocument()
  })

  it('moves a late course past midnight when the stop offset crosses 24:00, but reports its base time', async () => {
    const onSelect = vi.fn()
    renderTimetable({ blocks: [{ category: 'weekday', times: [23 * H + 50 * 60], frequencyBased: false }], offsetSec: 900, onSelect })
    const minute = screen.getByRole('button', { name: '00:05, Dni robocze, następny dzień' })
    await userEvent.setup().click(minute)
    expect(onSelect).toHaveBeenCalledWith(23 * H + 50 * 60)
  })
})

describe('LineTimetable — selection', () => {
  it('reports the BASE time of a pick (not the shifted one) and toggles it off on the second click', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    const { rerender } = renderTimetable({ offsetSec: 480, onSelect })
    await user.click(screen.getByRole('button', { name: '06:08, Dni robocze' }))
    expect(onSelect).toHaveBeenCalledWith(6 * H)
    rerender(<LineTimetable blocks={blocks} offsetSec={480} selectedBaseSec={6 * H} onSelect={onSelect} />)
    const pressed = screen.getByRole('button', { name: '06:08, Dni robocze' })
    expect(pressed).toHaveAttribute('aria-pressed', 'true')
    await user.click(pressed)
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('highlights the pick only in the active category even if another has the same base time', () => {
    renderTimetable({
      blocks: [
        { category: 'weekday', times: [8 * H], frequencyBased: false },
        { category: 'saturday', times: [8 * H], frequencyBased: false },
      ],
      selectedBaseSec: 8 * H,
      day: 'saturday',
    })
    expect(within(column('Soboty')).getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    expect(within(column('Dni robocze')).getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('a pick in another visible column (desktop) switches to that day first, then selects', async () => {
    const calls: string[] = []
    renderTimetable({
      day: 'weekday',
      onDayChange: (d) => calls.push(`day:${d}`),
      onSelect: (s) => calls.push(`select:${s}`),
    })
    await userEvent.setup().click(within(column('Soboty')).getByRole('button'))
    expect(calls).toEqual(['day:saturday', `select:${8 * H}`])
  })

  it('uses the primary tokens for the pressed minute — no accent gradient', () => {
    renderTimetable({ selectedBaseSec: 6 * H })
    const pressed = within(column('Dni robocze')).getByRole('button', { pressed: true })
    expect(pressed).toHaveClass('bg-primary', 'text-primary-fg')
    expect(pressed.outerHTML).not.toMatch(/accent-gradient|indigo-/)
  })
})
