// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileNav } from './MobileNav'

const pathname = vi.fn(() => '/')
vi.mock('next/navigation', () => ({ usePathname: () => pathname() }))

beforeEach(() => {
  pathname.mockReturnValue('/')
  document.body.style.overflow = ''
})
afterEach(() => vi.clearAllMocks())

describe('MobileNav', () => {
  it('renders the hamburger button collapsed by default — no drawer', () => {
    render(<MobileNav />)
    const button = screen.getByRole('button', { name: /otwórz menu/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the drawer on hamburger click and traps focus on the close button', async () => {
    render(<MobileNav />)
    await userEvent.click(screen.getByRole('button', { name: /otwórz menu/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: /otwórz menu/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /zamknij menu/i })).toHaveFocus()
    // szuflada niesie te same 3 działające pozycje co pasek desktop
    expect(screen.getByRole('link', { name: 'Pulpit' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Odjazdy / Przyjazdy' })).toHaveAttribute('href', '/miasto')
    expect(screen.getByRole('link', { name: 'Trasy' })).toHaveAttribute('href', '/linie')
    // blokada scrolla tła
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('closes on Escape and restores focus + body scroll', async () => {
    render(<MobileNav />)
    const hamburger = screen.getByRole('button', { name: /otwórz menu/i })
    await userEvent.click(hamburger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(hamburger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('closes on backdrop click', async () => {
    render(<MobileNav />)
    await userEvent.click(screen.getByRole('button', { name: /otwórz menu/i }))
    await userEvent.click(screen.getByTestId('mobile-nav-backdrop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes when a nav link is tapped', async () => {
    render(<MobileNav />)
    await userEvent.click(screen.getByRole('button', { name: /otwórz menu/i }))
    const link = screen.getByRole('link', { name: 'Trasy' })
    // Blokujemy realną nawigację jsdom (component's React onClick i tak odpali):
    // bez tego jsdom loguje „Not implemented: navigation to another Document".
    link.addEventListener('click', (event) => event.preventDefault())
    await userEvent.click(link)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes automatically when the route changes while open', async () => {
    const { rerender } = render(<MobileNav />)
    await userEvent.click(screen.getByRole('button', { name: /otwórz menu/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    pathname.mockReturnValue('/miasto/warszawa')
    rerender(<MobileNav />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })

  it('marks the current route in the drawer via aria-current', async () => {
    pathname.mockReturnValue('/miasto/warszawa/linia/20')
    render(<MobileNav />)
    await userEvent.click(screen.getByRole('button', { name: /otwórz menu/i }))
    expect(screen.getByRole('link', { name: 'Trasy' })).toHaveAttribute('aria-current', 'page')
  })
})
