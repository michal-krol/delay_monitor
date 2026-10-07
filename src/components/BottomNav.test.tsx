// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BottomNav } from './BottomNav'

const usePathname = vi.fn()
vi.mock('next/navigation', () => ({ usePathname: () => usePathname() }))

afterEach(() => vi.clearAllMocks())

describe('BottomNav', () => {
  it('is a navigation landmark named „Nawigacja główna" with four tabs', () => {
    usePathname.mockReturnValue('/')
    render(<BottomNav />)
    const nav = screen.getByRole('navigation', { name: 'Nawigacja główna' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Pulpit', 'Odjazdy', 'Linie', 'Mapa'])
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/', '/city', '/lines', '/map'])
    for (const [index, name] of ['Pulpit', 'Odjazdy', 'Linie', 'Mapa'].entries()) {
      expect(links[index]).toHaveAccessibleName(name)
    }
  })

  it('marks „Linie" as the current page on a city lines path', () => {
    usePathname.mockReturnValue('/city/warszawa/lines')
    render(<BottomNav />)
    expect(screen.getByRole('link', { name: 'Linie' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Odjazdy' })).not.toHaveAttribute('aria-current')
  })

  it('marks nothing as current on a station page', () => {
    usePathname.mockReturnValue('/station/33605')
    render(<BottomNav />)
    for (const link of screen.getAllByRole('link')) expect(link).not.toHaveAttribute('aria-current')
  })
})
