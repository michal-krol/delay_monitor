// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_BG } from '@/lib/siteMeta'
import { ThemeColorSync } from './ThemeColorSync'

const useThemeMock = vi.fn()
vi.mock('next-themes', () => ({
  useTheme: () => useThemeMock(),
}))

/** Jak `viewport.themeColor` w layout.tsx: dwie metki z `media` per schemat systemu. */
function addSystemMetas() {
  document.head.innerHTML = `
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_BG.light}">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_BG.dark}">`
}

// eslint-disable-next-line testing-library/no-node-access -- metki w <head> nie mają roli ani tekstu
const contents = () => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content'))

beforeEach(addSystemMetas)
afterEach(() => {
  document.head.innerHTML = ''
  useThemeMock.mockReset()
})

describe('ThemeColorSync', () => {
  it('forced dark on a light system: every theme-color meta gets the dark --bg-base', () => {
    useThemeMock.mockReturnValue({ resolvedTheme: 'dark' })
    render(<ThemeColorSync />)
    expect(contents()).toEqual([THEME_BG.dark, THEME_BG.dark])
  })

  it('forced light on a dark system: every theme-color meta gets the light --bg-base', () => {
    useThemeMock.mockReturnValue({ resolvedTheme: 'light' })
    render(<ThemeColorSync />)
    expect(contents()).toEqual([THEME_BG.light, THEME_BG.light])
  })

  it('follows a later switch back to light', () => {
    useThemeMock.mockReturnValue({ resolvedTheme: 'dark' })
    const { rerender } = render(<ThemeColorSync />)
    useThemeMock.mockReturnValue({ resolvedTheme: 'light' })
    rerender(<ThemeColorSync />)
    expect(contents()).toEqual([THEME_BG.light, THEME_BG.light])
  })

  it('leaves the server metas alone while the theme is not resolved yet', () => {
    useThemeMock.mockReturnValue({ resolvedTheme: undefined })
    render(<ThemeColorSync />)
    expect(contents()).toEqual([THEME_BG.light, THEME_BG.dark])
  })

  it('renders nothing (no hydration difference against the server)', () => {
    useThemeMock.mockReturnValue({ resolvedTheme: 'dark' })
    const { container } = render(<ThemeColorSync />)
    expect(container).toBeEmptyDOMElement()
  })
})
