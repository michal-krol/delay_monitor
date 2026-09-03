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
    expect(screen.getByRole('columnheader', { name: 'Poniedziałek – Piątek' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Soboty' })).toBeInTheDocument()
    // kolumna „godz." powielona przy każdej kategorii
    expect(screen.getAllByRole('columnheader', { name: 'godz.' })).toHaveLength(2)
    // 06:00 + 8 min = 06:08
    expect(screen.getByRole('button', { name: '06:08' })).toBeInTheDocument()
    // sobota 08:00 + 8 min
    expect(screen.getByRole('button', { name: '08:08' })).toBeInTheDocument()
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

  it('explains an empty window instead of rendering an empty table', () => {
    render(<LineTimetable blocks={[]} offsetSec={0} selectedBaseSec={null} onSelect={() => {}} />)
    expect(screen.getByText(/Brak odjazdów/)).toBeInTheDocument()
  })
})
