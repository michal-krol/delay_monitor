// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DirectionSelect, headsignOptions } from './DirectionSelect'

describe('headsignOptions', () => {
  it('lists each headsign once, in Polish alphabetical order, skipping rows without one', () => {
    const rows = [{ headsign: 'Łódź Fabryczna' }, { headsign: 'Kraków Główny' }, { headsign: null }, { headsign: 'Kraków Główny' }, { headsign: 'Lublin' }]
    expect(headsignOptions(rows, null)).toEqual(['Kraków Główny', 'Lublin', 'Łódź Fabryczna'])
  })

  it('keeps the selected value even when no row has it (e.g. ?direction= from a link), so the select shows the active filter', () => {
    expect(headsignOptions([{ headsign: 'Lublin' }], 'Gdynia Główna')).toEqual(['Gdynia Główna', 'Lublin'])
  })
})

describe('DirectionSelect', () => {
  const rows = [{ headsign: 'Kraków Główny' }, { headsign: 'Lublin' }]

  it('departures: „Kierunek” with „Wszystkie kierunki” first; choosing a headsign filters, the first option clears', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<DirectionSelect direction="departures" rows={rows} value={null} onChange={onChange} />)
    const select = screen.getByRole('combobox', { name: 'Kierunek' })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Wszystkie kierunki', 'Kraków Główny', 'Lublin'])

    await user.selectOptions(select, 'Lublin')
    expect(onChange).toHaveBeenLastCalledWith('Lublin')

    rerender(<DirectionSelect direction="departures" rows={rows} value="Lublin" onChange={onChange} />)
    await user.selectOptions(select, 'Wszystkie kierunki')
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('arrivals: the headsign is where the train comes from, so the wording is „Skąd”', () => {
    render(<DirectionSelect direction="arrivals" rows={rows} value={null} onChange={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Skąd' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Wszystkie stacje początkowe' })).toBeInTheDocument()
  })
})
