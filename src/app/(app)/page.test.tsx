// @vitest-environment jsdom
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import Page from './page'
import type { Favourite } from '@/hooks/useFavourites'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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
    initialFavourites = [{ id: '33605', name: 'Warszawa Centralna' }]
  })

  it('klik w kartę stacji nawiguje do /odjazdy/[stationId], nie ustawia lokalnego stanu', async () => {
    render(<Page />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Pokaż pełną tablicę: Warszawa Centralna/ }))
    // encodeURIComponent (not form-encoding) is the contract — spaces become %20, not '+'.
    expect(push).toHaveBeenCalledWith('/odjazdy/33605?name=Warszawa%20Centralna')
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
})
