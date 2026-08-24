// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import Page from './page'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/hooks/useFavourites', () => ({
  useFavourites: () => ({
    favourites: [{ id: '33605', name: 'Warszawa Centralna' }],
    loaded: true,
    addFavourite: vi.fn(),
    removeFavourite: vi.fn(),
    isFavourite: () => true,
  }),
}))

vi.mock('@/hooks/useBoard', () => ({
  useBoard: () => ({ data: null, error: null }),
}))

describe('Page (Pulpit)', () => {
  beforeEach(() => push.mockClear())

  it('klik w kartę stacji nawiguje do /odjazdy/[stationId], nie ustawia lokalnego stanu', async () => {
    render(<Page />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Pokaż pełną tablicę: Warszawa Centralna/ }))
    // encodeURIComponent (not form-encoding) is the contract — spaces become %20, not '+'.
    expect(push).toHaveBeenCalledWith('/odjazdy/33605?name=Warszawa%20Centralna')
  })
})
