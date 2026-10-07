// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CityRedirect } from './CityRedirect'
import { __resetCityContext } from '@/hooks/useCityContext'
import { resetCitiesCacheForTests } from '@/hooks/useCities'
import { jsonResponse } from '@/test-utils/http'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

const to = (city: string) => `/city/${city}`

beforeEach(() => {
  replace.mockClear()
  window.localStorage.clear()
  __resetCityContext()
  resetCitiesCacheForTests()
})
afterEach(() => vi.unstubAllGlobals())

describe('CityRedirect', () => {
  it('redirects to preferred city', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        jsonResponse({
          cities: [
            { id: 'krakow', name: 'Kraków', railStations: [{ id: '1', name: 'a' }] },
            {
              id: 'warszawa',
              name: 'Warszawa',
              railStations: [{ id: '1', name: 'a' }, { id: '2', name: 'b' }, { id: '3', name: 'c' }],
            },
          ],
        })
      )
    )
    render(<CityRedirect to={to} />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/city/warszawa'))
  })

  it('shows a skeleton (not bare text) while the city is being resolved', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<CityRedirect to={to} />)
    expect(screen.getByTestId('page-skeleton')).toBeInTheDocument()
    expect(screen.queryByText('Wybieram miasto…')).not.toBeInTheDocument()
  })

  it('empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ cities: [] })))
    render(<CityRedirect to={to} />)
    expect(await screen.findByText('Brak skonfigurowanych miast.')).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('fetch failed shows error with retry', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))))
    render(<CityRedirect to={to} />)
    expect(await screen.findByText('Nie udało się wczytać listy miast.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('retry succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error('network down')))
      .mockImplementationOnce(() =>
        jsonResponse({ cities: [{ id: 'warszawa', name: 'Warszawa', railStations: [{ id: '1', name: 'a' }] }] })
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<CityRedirect to={to} />)
    const button = await screen.findByRole('button', { name: 'Spróbuj ponownie' })
    fireEvent.click(button)

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/city/warszawa'))
  })
})
