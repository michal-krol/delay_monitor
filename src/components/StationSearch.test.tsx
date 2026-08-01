// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StationSearch } from './StationSearch'

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('StationSearch', () => {
  it('has combobox role and starts closed', () => {
    render(<StationSearch onSelect={vi.fn()} />)
    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not search below the 3-character minimum', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stations: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<StationSearch onSelect={vi.fn()} />)
    await user.type(screen.getByRole('combobox'), 'kr')
    await vi.advanceTimersByTimeAsync(300)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  })

  it('debounces the search request by 300ms', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stations: [{ id: '5136', name: 'Kraków Główny' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<StationSearch onSelect={vi.fn()} />)
    await user.type(screen.getByRole('combobox'), 'krak')

    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/stations?q=krak'))
  })

  it('opens the listbox and calls onSelect when an option is chosen', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stations: [{ id: '5136', name: 'Kraków Główny' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const onSelect = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<StationSearch onSelect={onSelect} />)
    await user.type(screen.getByRole('combobox'), 'krak')
    await vi.advanceTimersByTimeAsync(300)

    const option = await vi.waitFor(() => screen.getByRole('option', { name: 'Kraków Główny' }))
    await user.click(option)

    expect(onSelect).toHaveBeenCalledWith({ id: '5136', name: 'Kraków Główny' })
  })
})
