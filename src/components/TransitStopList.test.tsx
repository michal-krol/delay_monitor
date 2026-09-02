// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransitStopList } from './TransitStopList'
import { jsonResponse } from '@/test-utils/http'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

beforeEach(() => {
  push.mockClear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('TransitStopList', () => {
  it('queries the city-scoped gtfs stops endpoint and navigates to the chosen stop', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => jsonResponse({ stations: [{ id: '7014M', name: 'Świętokrzyska' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<TransitStopList city="waw" />)
    await user.type(screen.getByRole('combobox'), 'swi')
    await vi.advanceTimersByTimeAsync(300)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/gtfs/stops?city=waw&q=swi'))
    await user.click(await screen.findByRole('option', { name: 'Świętokrzyska' }))
    expect(push).toHaveBeenCalledWith('/miasto/waw/przystanek/7014M')
  })
})
