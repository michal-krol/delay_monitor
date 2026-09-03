// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CityPicker } from './CityPicker'
import { __resetCityContext } from '@/hooks/useCityContext'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

beforeEach(() => {
  push.mockClear()
  window.localStorage.clear()
  __resetCityContext()
})
afterEach(() => vi.unstubAllGlobals())

const cities = [
  { id: 'warszawa', name: 'Warszawa', railStations: [{ id: '1' }, { id: '2' }, { id: '3' }] },
  { id: 'krakow', name: 'Kraków', railStations: [{ id: '4' }] },
]

describe('CityPicker', () => {
  it('lists cities sorted by rail-station count, descending', () => {
    render(<CityPicker cities={cities} current="warszawa" />)
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Warszawa', 'Kraków'])
  })

  it('navigates and stores the context on change', async () => {
    render(<CityPicker cities={cities} current="warszawa" />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'krakow')
    expect(push).toHaveBeenCalledWith('/miasto/krakow')
    expect(JSON.parse(window.localStorage.getItem('monitor.cityContext.v2') ?? 'null')).toBe('krakow')
  })

  it('falls back to the current id when the list has not loaded', () => {
    render(<CityPicker cities={[]} current="warszawa" />)
    expect(screen.getByRole('option')).toHaveValue('warszawa')
  })
})
