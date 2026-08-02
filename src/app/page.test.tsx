// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Page from './page'

/**
 * Kompozycja trzech widoków (stan pusty / dashboard / pełna tablica) zawiera
 * jedyną logikę przełączania w aplikacji, a nie miała żadnego testu.
 */

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
}

const EMPTY_BOARD = { snapshots: [null, null], budget: undefined, status: 'ok', throttled: false }

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) =>
      String(url).startsWith('/api/stations')
        ? jsonResponse({ stations: [{ id: '5136', name: 'Kraków Główny' }] })
        : jsonResponse(EMPTY_BOARD)
    )
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Page', () => {
  it('pokazuje stan pusty z wyszukiwarką, gdy nie ma ulubionych', async () => {
    render(<Page />)

    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    expect(screen.getByText(/Wyszukaj stację/)).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('pokazuje dashboard zamiast stanu pustego, gdy ulubione są zapisane', async () => {
    window.localStorage.setItem(
      'pkp.favourites.v1',
      JSON.stringify([{ id: '5100', name: 'Warszawa Centralna' }])
    )

    render(<Page />)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument())
    expect(screen.queryByText(/Wyszukaj stację/)).not.toBeInTheDocument()
  })

  it('rozwija pełną tablicę po kliknięciu kafelki i wraca po zamknięciu', async () => {
    window.localStorage.setItem(
      'pkp.favourites.v1',
      JSON.stringify([{ id: '5100', name: 'Warszawa Centralna' }])
    )
    const user = userEvent.setup()

    render(<Page />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Pokaż pełną tablicę/ })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Pokaż pełną tablicę/ }))

    // Tablica ma przelacznik kierunku, ktorego dashboard nie ma.
    expect(screen.getByRole('tab', { name: 'Odjazdy' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Zamknij' }))

    expect(screen.queryByRole('tab', { name: 'Odjazdy' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pokaż pełną tablicę/ })).toBeInTheDocument()
  })

  it('dodaje stację do ulubionych z poziomu rozwiniętej tablicy', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<Page />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())

    await user.type(screen.getByRole('combobox'), 'krak')
    await vi.advanceTimersByTimeAsync(300)
    await user.click(await vi.waitFor(() => screen.getByRole('option', { name: 'Kraków Główny' })))

    // Wybor z wyszukiwarki otwiera tablice, jeszcze bez zapisu do ulubionych.
    expect(screen.getByRole('button', { name: 'Dodaj do ulubionych' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dodaj do ulubionych' }))

    expect(JSON.parse(window.localStorage.getItem('pkp.favourites.v1') ?? '[]')).toEqual([
      { id: '5136', name: 'Kraków Główny' },
    ])
    expect(screen.getByRole('button', { name: 'Usuń z ulubionych' })).toBeInTheDocument()
  })

  it('usuwa ostatnią ulubioną stację i wraca do stanu pustego', async () => {
    window.localStorage.setItem(
      'pkp.favourites.v1',
      JSON.stringify([{ id: '5100', name: 'Warszawa Centralna' }])
    )
    const user = userEvent.setup()

    render(<Page />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Usuń z ulubionych:/ })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Usuń z ulubionych:/ }))

    await waitFor(() => expect(screen.getByText(/Wyszukaj stację/)).toBeInTheDocument())
    expect(JSON.parse(window.localStorage.getItem('pkp.favourites.v1') ?? '[]')).toEqual([])
  })
})
