// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BottomNav } from './BottomNav'

const usePathname = vi.fn()
vi.mock('next/navigation', () => ({ usePathname: () => usePathname() }))

afterEach(() => vi.clearAllMocks())

// Render zawiera wyłącznie dolny pasek, więc `screen` widzi tylko jego cele.
const renderNav = (path: string, onSearch = vi.fn()) => {
  usePathname.mockReturnValue(path)
  render(<BottomNav onSearch={onSearch} />)
}

const link = (name: string) => screen.getByRole('link', { name })
const searchButton = () => screen.getByRole('button', { name: 'Szukaj' })

describe('BottomNav', () => {
  it('is a navigation landmark named „Nawigacja główna" with four targets: Start, Mapa, Szukaj, Linie', () => {
    renderNav('/')
    expect(screen.getByRole('navigation', { name: 'Nawigacja główna' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Start', 'Mapa', 'Szukaj', 'Linie'])
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/', '/map', '/lines'])
    expect(link('Start')).toBeInTheDocument()
    expect(searchButton()).toBeInTheDocument()
  })

  it('„Szukaj" is a button (an action, not a link) that calls onSearch', async () => {
    const onSearch = vi.fn()
    renderNav('/', onSearch)
    expect(screen.queryByRole('link', { name: 'Szukaj' })).toBeNull()
    await userEvent.setup().click(searchButton())
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it.each(['/station/33605', '/connection/x', '/city/warszawa/stop/1001', '/city/warszawa'])(
    'marks „Start" as the current page on %s',
    (path) => {
      renderNav(path)
      expect(link('Start')).toHaveAttribute('aria-current', 'page')
      expect(link('Linie')).not.toHaveAttribute('aria-current')
    },
  )

  it.each(['/city/warszawa/lines', '/city/warszawa/line/20'])('marks „Linie" as the current page on %s', (path) => {
    renderNav(path)
    expect(link('Linie')).toHaveAttribute('aria-current', 'page')
    expect(link('Start')).not.toHaveAttribute('aria-current')
  })

  it('marks „Mapa" on /map and not „Szukaj"', () => {
    renderNav('/map')
    expect(link('Mapa')).toHaveAttribute('aria-current', 'page')
    expect(searchButton()).not.toHaveAttribute('aria-current')
  })

  it('marks „Szukaj" as current (with the pastille) on /search', () => {
    renderNav('/search')
    expect(searchButton()).toHaveAttribute('aria-current', 'page')
    expect(searchButton()).toHaveAttribute('data-active')
  })

  it('marks nothing as current on an unknown path', () => {
    renderNav('/xyz')
    for (const target of [...screen.getAllByRole('link'), searchButton()]) expect(target).not.toHaveAttribute('aria-current')
  })
})
