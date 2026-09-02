// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CitySwitcher } from './CitySwitcher'
import { __resetCityContext } from '@/hooks/useCityContext'
import { jsonResponse } from '@/test-utils/http'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

beforeEach(() => {
  push.mockClear()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  __resetCityContext()
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      jsonResponse({
        cities: [
          { id: 'waw', name: 'Warszawa', hasTransit: true },
          { id: 'xyz', name: 'Bez GTFS', hasTransit: false },
        ],
      })
    )
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('CitySwitcher', () => {
  it('offers the national context plus every transit-enabled city', async () => {
    render(<CitySwitcher />)
    expect(screen.getByRole('option', { name: 'Cała Polska — kolej' })).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Warszawa' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Bez GTFS' })).not.toBeInTheDocument()
  })

  it('navigates to the city screen on selection and back to root for the national context', async () => {
    render(<CitySwitcher />)
    expect(await screen.findByRole('option', { name: 'Warszawa' })).toBeInTheDocument()
    const user = userEvent.setup()

    await user.selectOptions(screen.getByRole('combobox'), 'waw')
    expect(push).toHaveBeenCalledWith('/miasto/waw')
    expect(JSON.parse(window.localStorage.getItem('monitor.cityContext.v1') ?? 'null')).toBe('waw')

    await user.selectOptions(screen.getByRole('combobox'), '')
    expect(push).toHaveBeenCalledWith('/')
  })
})
