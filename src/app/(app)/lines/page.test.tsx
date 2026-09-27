// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LinieIndex from './page'
import { __resetCityContext } from '@/hooks/useCityContext'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

beforeEach(() => {
  replace.mockClear()
  window.localStorage.clear()
  __resetCityContext()
})
afterEach(() => vi.unstubAllGlobals())

describe('LinieIndex', () => {
  it('redirects to its own path', async () => {
    window.localStorage.setItem('monitor.cityContext.v2', JSON.stringify('krakow'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<LinieIndex />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/city/krakow/lines'))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
