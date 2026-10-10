// @vitest-environment jsdom
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

const useThemeMock = vi.fn()
vi.mock('next-themes', () => ({
  useTheme: () => useThemeMock(),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ThemeToggle accessible name', () => {
  it.each([
    ['dark', 'Przełącz na tryb jasny', 'light'],
    ['light', 'Przełącz na tryb ciemny', 'dark'],
  ])('when the theme is %s the name is the TARGET action and a click sets that theme', (resolvedTheme, name, target) => {
    const setTheme = vi.fn()
    useThemeMock.mockReset()
    useThemeMock.mockReturnValue({ resolvedTheme, setTheme })
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name }))
    expect(setTheme).toHaveBeenCalledWith(target)
  })
})

describe('ThemeToggle hydration', () => {
  it('renders identically on the server and on the first client pass, even when the real (dark) theme is already known client-side', () => {
    // next-themes resolves the real theme synchronously on the very first
    // client render (to avoid a flash of the wrong theme), but the server
    // never has access to localStorage/prefers-color-scheme -- resolvedTheme
    // is undefined there. A component reading resolvedTheme directly (no
    // "mounted" guard) renders a different icon/aria-label on that first
    // client pass than what the server sent, which React flags as
    // "Hydration failed" -- observed live in production console.
    useThemeMock.mockReturnValueOnce({ resolvedTheme: undefined, setTheme: vi.fn() }) // serwer
    useThemeMock.mockReturnValue({ resolvedTheme: 'dark', setTheme: vi.fn() }) // klient, od pierwszego renderu

    vi.spyOn(console, 'error').mockImplementation(() => {})

    // renderToString() z react-dom/server, nie render() z testing-library --
    // reguła nazewnictwa poniżej dotyczy tego drugiego.
    // eslint-disable-next-line testing-library/render-result-naming-convention
    const serverMarkup = renderToString(<ThemeToggle />)
    const container = document.createElement('div')
    container.innerHTML = serverMarkup
    document.body.appendChild(container)

    // Niezgodność hydratacji to w React 19 "recoverable error" -- zgłaszany
    // przez globalny kanał (React sam sobie z tym radzi, przebudowując
    // drzewo po stronie klienta), nie zwykły throw z hydrateRoot() do
    // złapania przez try/catch. onRecoverableError to oficjalny hak na
    // dokładnie ten sygnał.
    const recoverableErrors: unknown[] = []
    act(() => {
      hydrateRoot(container, <ThemeToggle />, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      })
    })
    expect(recoverableErrors).toEqual([])

    document.body.removeChild(container)
  })
})
