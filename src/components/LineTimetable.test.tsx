// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LineTimetable } from './LineTimetable'
import type { LineDepartureBlock } from '@/lib/gtfs/query'

const blocks: LineDepartureBlock[] = [
  { category: 'weekday', times: [6 * 3600, 6 * 3600 + 1200, 22 * 3600], frequencyBased: false },
  { category: 'saturday', times: [8 * 3600], frequencyBased: false },
]

describe('LineTimetable', () => {
  it('renders a column per day category and a row per hour, with the stop offset applied', () => {
    render(<LineTimetable blocks={blocks} offsetSec={480} selectedBaseSec={null} onSelect={() => {}} />)
    expect(screen.getByRole('columnheader', { name: 'Dni robocze' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Soboty' })).toBeInTheDocument()
    // kolumna „godz." powielona przy każdej z trzech stałych kategorii
    expect(screen.getAllByRole('columnheader', { name: 'godz.' })).toHaveLength(3)
    // 06:00 + 8 min = 06:08
    expect(screen.getByRole('button', { name: '06:08' })).toBeInTheDocument()
    // sobota 08:00 + 8 min
    expect(screen.getByRole('button', { name: '08:08' })).toBeInTheDocument()
  })

  it('always renders the three weekly columns even when a category is empty', () => {
    render(
      <LineTimetable
        blocks={[{ category: 'weekday', times: [6 * 3600], frequencyBased: false }]}
        offsetSec={0}
        selectedBaseSec={null}
        onSelect={() => {}}
      />
    )
    expect(screen.getByRole('columnheader', { name: 'Dni robocze' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Soboty' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Niedziele i święta' })).toBeInTheDocument()
  })

  it('merges friday times into the weekday column without duplicates', () => {
    render(
      <LineTimetable
        blocks={[
          { category: 'weekday', times: [6 * 3600, 7 * 3600], frequencyBased: false },
          { category: 'friday', times: [7 * 3600, 23 * 3600], frequencyBased: false },
        ]}
        offsetSec={0}
        selectedBaseSec={null}
        onSelect={() => {}}
      />
    )
    // 06, 07, 23 -> three hour rows under "Dni robocze"; 07 appears once
    expect(screen.getAllByRole('button', { name: '07:00' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: '23:00' })).toBeInTheDocument()
  })

  it('reports a pick and toggles it off on the second click', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<LineTimetable blocks={blocks} offsetSec={0} selectedBaseSec={null} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: '06:00' }))
    expect(onSelect).toHaveBeenCalledWith(6 * 3600)
    rerender(<LineTimetable blocks={blocks} offsetSec={0} selectedBaseSec={6 * 3600} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: '06:00' }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('keeps the weekly headers and notes the empty schedule instead of an empty table', () => {
    render(<LineTimetable blocks={[]} offsetSec={0} selectedBaseSec={null} onSelect={() => {}} />)
    expect(screen.getByRole('columnheader', { name: 'Dni robocze' })).toBeInTheDocument()
    expect(screen.getByText(/Brak kursów w rozkładzie/)).toBeInTheDocument()
  })
})
