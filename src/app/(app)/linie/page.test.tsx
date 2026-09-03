// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LinieIndex from './page'
import { __resetCityContext } from '@/hooks/useCityContext'
import { jsonResponse } from '@/test-utils/http'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

beforeEach(() => {
  replace.mockClear()
  window.localStorage.clear()
  __resetCityContext()
})
afterEach(() => vi.unstubAllGlobals())

describe('LinieIndex', () => {
  it('redirects to the stored city line browser without a network call', async () => {
    window.localStorage.setItem('monitor.cityContext.v1', JSON.stringify('krk'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<LinieIndex />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/miasto/krk/linie'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('picks the city with the most rail stations when nothing is stored', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        jsonResponse({
          cities: [
            { id: 'krk', railStations: [{ id: '1' }] },
            { id: 'waw', railStations: [{ id: '1' }, { id: '2' }] },
          ],
        })
      )
    )
    render(<LinieIndex />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/miasto/waw/linie'))
  })

  it('shows a message when there are no configured cities', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ cities: [] })))
    render(<LinieIndex />)
    expect(await screen.findByText(/Brak skonfigurowanych miast/)).toBeInTheDocument()
  })
})
