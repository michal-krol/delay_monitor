// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CityPage from './page'
import { jsonResponse } from '@/test-utils/http'

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
let cityParam = 'waw'
vi.mock('next/navigation', () => ({
  useParams: () => ({ city: cityParam }),
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => notFound(),
}))
vi.mock('@/hooks/useBoard', () => ({ useBoard: () => ({ data: null }) }))

beforeEach(() => {
  cityParam = 'waw'
  window.localStorage.clear()
  window.history.replaceState(null, '', '/miasto/waw')
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      jsonResponse({
        cities: [
          {
            id: 'waw',
            name: 'Warszawa',
            hasTransit: true,
            railStations: [{ id: '33605', name: 'Warszawa Centralna' }],
          },
        ],
      })
    )
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('CityPage', () => {
  it('renders two separate columns: rail stations and transit stops', async () => {
    render(<CityPage />)
    expect(await screen.findByRole('heading', { name: 'Warszawa' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Stacje kolejowe' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Przystanki miejskie' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Warszawa Centralna/ })).toBeInTheDocument()
    // Kolumna miejska mówi „rozkład", nigdy „na czas".
    expect(screen.queryByText(/na czas/i)).not.toBeInTheDocument()
  })

  it('calls notFound for a malformed city id', () => {
    cityParam = 'a/b'
    expect(() => render(<CityPage />)).toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  it('still renders both columns when /api/cities is unavailable (falls back to the id)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('down'))))
    render(<CityPage />)
    expect(await screen.findByRole('heading', { name: 'Stacje kolejowe' })).toBeInTheDocument()
    expect(screen.getByText(/Brak stacji kolejowych w rejestrze/)).toBeInTheDocument()
  })

  it('handles a city that the registry does not list', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ cities: [] })))
    cityParam = 'krk'
    render(<CityPage />)
    expect(await screen.findByRole('heading', { name: 'Przystanki miejskie' })).toBeInTheDocument()
  })
})
