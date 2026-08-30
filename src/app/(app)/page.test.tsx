// @vitest-environment jsdom
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import Page from './page'
import type { Favourite } from '@/hooks/useFavourites'
import { jsonResponse } from '@/test-utils/http'

const push = vi.fn()
const replace = vi.fn()
// Mutable seed read once per `render(<Page />)` — set per-test before rendering.
let searchParamsSeed = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(searchParamsSeed),
}))

// Mutable seed read once per `render(<Page />)` (fresh component tree per
// test) — set it in `beforeEach`/per-test before rendering. The hook itself
// uses real `useState` so `removeFavourite` triggers a real re-render within
// a test, the same reactivity a stateful `useFavourites()` gives the real page.
let initialFavourites: Favourite[] = []

vi.mock('@/hooks/useFavourites', () => ({
  useFavourites: () => {
    const [favourites, setFavourites] = useState(initialFavourites)
    return {
      favourites,
      loaded: true,
      addFavourite: vi.fn(),
      removeFavourite: (id: string) => setFavourites((current) => current.filter((item) => item.id !== id)),
      isFavourite: () => true,
    }
  },
}))

vi.mock('@/hooks/useBoard', () => ({
  useBoard: () => ({ data: null, error: null }),
}))

describe('Page (Pulpit)', () => {
  beforeEach(() => {
    push.mockClear()
    replace.mockClear()
    searchParamsSeed = ''
    initialFavourites = [{ id: '33605', name: 'Warszawa Centralna' }]
  })

  it('klik w kartę stacji otwiera pełny widok stacji, z nazwą w adresie', async () => {
    render(<Page />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Pokaż pełną tablicę: Warszawa Centralna/ }))
    expect(push).toHaveBeenCalledWith('/odjazdy/33605?name=Warszawa%20Centralna')
  })

  it('przekierowuje stary adres ?focus= na widok stacji, zachowując nazwę z ulubionych', () => {
    searchParamsSeed = 'focus=33605'
    render(<Page />)

    // `replace`, nie `push` -- przekierowanie nie ma zostawiać wpisu w
    // historii, bo „wstecz" wracałoby na adres, który znów przekierowuje.
    expect(replace).toHaveBeenCalledWith('/odjazdy/33605?name=Warszawa%20Centralna')
    expect(push).not.toHaveBeenCalled()
  })

  it('przekierowuje ?focus= także dla stacji spoza ulubionych, bez nazwy', () => {
    searchParamsSeed = 'focus=999999999'
    render(<Page />)

    expect(replace).toHaveBeenCalledWith('/odjazdy/999999999')
  })

  it('ignoruje po cichu nieprawidłowe ?focus= i pokazuje zwykły pulpit', () => {
    searchParamsSeed = 'focus=abc'
    render(<Page />)

    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('pokazuje stan pusty z wyszukiwarką, gdy nie ma ulubionych', () => {
    initialFavourites = []
    render(<Page />)

    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText(/Wyszukaj stację/)).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('pokazuje dashboard zamiast stanu pustego, gdy ulubione są zapisane', () => {
    render(<Page />)

    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.queryByText(/Wyszukaj stację/)).not.toBeInTheDocument()
  })

  it('usuwa ostatnią ulubioną stację i wraca do stanu pustego', async () => {
    const user = userEvent.setup()
    render(<Page />)

    await user.click(screen.getByRole('button', { name: /Usuń z ulubionych:/ }))

    expect(await screen.findByText(/Wyszukaj stację/)).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('wyszukiwarka stacji jest dostępna także wtedy, gdy dashboard ma już ulubione stacje', async () => {
    render(<Page />)

    const search = screen.getByRole('combobox')
    expect(search).toBeInTheDocument()
    // Karta ulubionej stacji nadal widoczna obok wyszukiwarki — to dodatkowe
    // pole, nie zamiennik dashboardu.
    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
  })

  it('wybranie stacji z wyszukiwarki nawiguje do jej tablicy, niezależnie od tego czy dashboard był pusty czy nie', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ stations: [{ id: '5136', name: 'Kraków Główny' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<Page />)

    await user.type(screen.getByRole('combobox'), 'krak')
    await vi.advanceTimersByTimeAsync(300)
    await user.click(await screen.findByRole('option', { name: 'Kraków Główny' }))

    // encodeURIComponent (not form-encoding) — spaces become %20, same contract as the card click.
    expect(push).toHaveBeenCalledWith('/odjazdy/5136?name=Krak%C3%B3w%20G%C5%82%C3%B3wny')

    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
})
