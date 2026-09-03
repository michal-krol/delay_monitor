// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StationSearch } from './StationSearch'
import { jsonResponse } from '@/test-utils/http'

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

  it('queries a custom endpoint, appending q with the right separator', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stations: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<StationSearch onSelect={vi.fn()} endpoint="/api/search?city=warszawa&mode=all" />)
    await user.type(screen.getByRole('combobox'), 'metro')
    await vi.advanceTimersByTimeAsync(300)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/search?city=warszawa&mode=all&q=metro'))
  })

  it('renders rich transit tiles (icon + line badges) while keeping the accessible name stable', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({
        stations: [
          {
            id: '7014M',
            name: 'Świętokrzyska',
            kind: 'transit',
            mode: 'metro',
            modes: ['metro', 'tram'],
            lines: [
              { routeId: 'M1', line: 'M1', color: '#0000bb', mode: 'metro' },
              { routeId: '20', line: '20', color: null, mode: 'tram' },
            ],
          },
          { id: '33605', name: 'Warszawa Centralna', kind: 'rail', mode: 'rail' },
        ],
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const onSelect = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<StationSearch onSelect={onSelect} endpoint="/api/search?city=warszawa" />)
    await user.type(screen.getByRole('combobox'), 'swi')
    await vi.advanceTimersByTimeAsync(300)

    // Dostępna nazwa opcji nadal to sama nazwa mimo plakietek/podtytułu.
    const option = await screen.findByRole('option', { name: 'Świętokrzyska' })
    expect(option).toHaveTextContent('M1')
    expect(option).toHaveTextContent('20')
    expect(screen.getByRole('option', { name: 'Warszawa Centralna' })).toHaveTextContent('stacja kolejowa')

    await user.click(option)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '7014M', kind: 'transit' }))
  })

  it('retries while the endpoint reports loading, then settles', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ stations: [], loading: true }))
      .mockImplementation(() => jsonResponse({ stations: [{ id: '1', name: 'Rondo' }], loading: false }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<StationSearch onSelect={vi.fn()} endpoint="/api/search?city=warszawa" />)
    await user.type(screen.getByRole('combobox'), 'ron')
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(1500)
    await vi.waitFor(() => expect(screen.getByRole('option', { name: 'Rondo' })).toBeInTheDocument())
  })

  it('tells the user it is searching, then that nothing matched', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stations: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<StationSearch onSelect={vi.fn()} />)
    await user.type(screen.getByRole('combobox'), 'zzz')
    await vi.advanceTimersByTimeAsync(300)

    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Brak stacji o tej nazwie'))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  })

  it('distinguishes a failed lookup from an empty result', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ stations: [], error: 'Nie udało się pobrać listy stacji' }), { status: 503 }))
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<StationSearch onSelect={vi.fn()} />)
    await user.type(screen.getByRole('combobox'), 'krak')
    await vi.advanceTimersByTimeAsync(300)

    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Nie udało się pobrać listy stacji'))
  })

  it('shows no message at all below the 3-character minimum', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<StationSearch onSelect={vi.fn()} />)
    await user.type(screen.getByRole('combobox'), 'kr')
    await vi.advanceTimersByTimeAsync(300)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('closes the list on Escape', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stations: [{ id: '5136', name: 'Kraków Główny' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<StationSearch onSelect={vi.fn()} />)
    await user.type(screen.getByRole('combobox'), 'krak')
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('exposes an accessible name and the list-autocomplete pattern', () => {
    render(<StationSearch onSelect={vi.fn()} placeholder="Dodaj stację…" />)
    const input = screen.getByRole('combobox')
    // `placeholder` znika, gdy pole ma wartość -- nazwa musi żyć osobno.
    expect(input).toHaveAccessibleName('Dodaj stację…')
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
  })

  it('walks the results with the arrow keys and selects the active one on Enter', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse({
        stations: [
          { id: '5136', name: 'Kraków Główny' },
          { id: '5137', name: 'Kraków Płaszów' },
        ],
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const onSelect = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<StationSearch onSelect={onSelect} />)
    const input = screen.getByRole('combobox')
    await user.type(input, 'krak')
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())

    // Nic nie jest aktywne, dopóki użytkownik nie zejdzie strzałką.
    expect(input).not.toHaveAttribute('aria-activedescendant')

    await user.keyboard('{ArrowDown}')
    const first = screen.getByRole('option', { name: 'Kraków Główny' })
    expect(input).toHaveAttribute('aria-activedescendant', first.id)
    expect(first).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    const second = screen.getByRole('option', { name: 'Kraków Płaszów' })
    expect(input).toHaveAttribute('aria-activedescendant', second.id)

    // Na ostatniej opcji strzałka w dół nie wychodzi poza listę.
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', second.id)

    await user.keyboard('{ArrowUp}')
    expect(input).toHaveAttribute('aria-activedescendant', first.id)

    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith({ id: '5136', name: 'Kraków Główny' })
    expect(input).toHaveValue('')
  })

  it('does nothing on Enter when no option is active (does not pick the first blindly)', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stations: [{ id: '5136', name: 'Kraków Główny' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const onSelect = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<StationSearch onSelect={onSelect} />)
    await user.type(screen.getByRole('combobox'), 'krak')
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())

    await user.keyboard('{Enter}')
    expect(onSelect).not.toHaveBeenCalled()
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
