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
  { id: 'waw', name: 'Warszawa', railStations: [{ id: '1' }, { id: '2' }, { id: '3' }] },
  { id: 'krk', name: 'Kraków', railStations: [{ id: '4' }] },
]

describe('CityPicker', () => {
  it('lists cities sorted by rail-station count, descending', () => {
    render(<CityPicker cities={cities} current="waw" />)
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Warszawa', 'Kraków'])
  })

  it('navigates and stores the context on change', async () => {
    render(<CityPicker cities={cities} current="waw" />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'krk')
    expect(push).toHaveBeenCalledWith('/miasto/krk')
    expect(JSON.parse(window.localStorage.getItem('monitor.cityContext.v1') ?? 'null')).toBe('krk')
  })

  it('falls back to the current id when the list has not loaded', () => {
    render(<CityPicker cities={[]} current="waw" />)
    expect(screen.getByRole('option')).toHaveValue('waw')
  })
})
