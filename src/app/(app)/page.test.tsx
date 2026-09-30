// @vitest-environment jsdom
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import Page from './page'
import { pinnedKey, type PinnedItem } from '@/hooks/usePinned'
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
// uses real `useState` so `removePinned` triggers a real re-render within
// a test, the same reactivity a stateful `usePinned()` gives the real page.
let initialPinned: PinnedItem[] = []

vi.mock('@/hooks/usePinned', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/usePinned')>()),
  usePinned: () => {
    const [pinnedItems, setPinnedItems] = useState(initialPinned)
    return {
      pinnedItems,
      loaded: true,
      addPinned: vi.fn(),
      removePinned: (key: string) =>
        setPinnedItems((current) => current.filter((item) => pinnedKey(item) !== key)),
      isPinned: () => true,
    }
  },
}))

vi.mock('@/hooks/useBoard', () => ({
  useBoard: () => ({ data: null, error: null }),
}))

describe('Page (Pulpit)', () => {
  // Restore even when an assertion fails, so fake timers and stubs never leak into the next test.
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    push.mockClear()
    replace.mockClear()
    searchParamsSeed = ''
    initialPinned = [{ kind: 'pkp', id: '33605', name: 'Warszawa Centralna' }]
  })

  it('klik w kartę stacji otwiera pełny widok stacji, z nazwą w adresie', async () => {
    render(<Page />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Pokaż pełną tablicę: Warszawa Centralna/ }))
    expect(push).toHaveBeenCalledWith('/station/33605?name=Warszawa%20Centralna')
  })

  it('przekierowuje stary adres ?focus= na widok stacji, zachowując nazwę z przypiętych', () => {
    searchParamsSeed = 'focus=33605'
    render(<Page />)

    // `replace`, nie `push` -- przekierowanie nie ma zostawiać wpisu w
    // historii, bo „wstecz" wracałoby na adres, który znów przekierowuje.
    expect(replace).toHaveBeenCalledWith('/station/33605?name=Warszawa%20Centralna')
    expect(push).not.toHaveBeenCalled()
  })

  it('przekierowuje ?focus= także dla stacji spoza przypiętych, bez nazwy', () => {
    searchParamsSeed = 'focus=999999999'
    render(<Page />)

    expect(replace).toHaveBeenCalledWith('/station/999999999')
  })

  it('ignoruje po cichu nieprawidłowe ?focus= i pokazuje zwykły pulpit', () => {
    searchParamsSeed = 'focus=abc'
    render(<Page />)

    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('pokazuje stan pusty z wyszukiwarką, gdy nie ma przypiętych', () => {
    initialPinned = []
    render(<Page />)

    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText(/Wyszukaj stację/)).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('pokazuje dashboard zamiast stanu pustego, gdy przypięte są zapisane', () => {
    render(<Page />)

    expect(screen.getByRole('heading', { name: 'Warszawa Centralna' })).toBeInTheDocument()
    expect(screen.queryByText(/Wyszukaj stację/)).not.toBeInTheDocument()
  })

  it('usuwa ostatnią przypiętą stację i wraca do stanu pustego', async () => {
    const user = userEvent.setup()
    render(<Page />)

    await user.click(screen.getByRole('button', { name: /Odepnij z Pulpitu:/ }))

    expect(await screen.findByText(/Wyszukaj stację/)).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('wyszukiwarka stacji jest dostępna także wtedy, gdy dashboard ma już przypięte stacje', async () => {
    render(<Page />)

    const search = screen.getByRole('combobox')
    expect(search).toBeInTheDocument()
    // Karta przypiętej stacji nadal widoczna obok wyszukiwarki — to dodatkowe
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
    expect(push).toHaveBeenCalledWith('/station/5136?name=Krak%C3%B3w%20G%C5%82%C3%B3wny')
  })

  it('exactly one h1 on the empty Pulpit and on the Pulpit with pinned cards', () => {
    initialPinned = []
    const { unmount } = render(<Page />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    unmount()

    initialPinned = [{ kind: 'pkp', id: '33605', name: 'Warszawa Centralna' }]
    render(<Page />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
