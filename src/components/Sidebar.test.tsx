// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

describe('Sidebar', () => {
  it('renderuje aktywne linki do Pulpitu i Odjazdów/Przyjazdów', () => {
    render(<Sidebar activeItem="pulpit" />)
    expect(screen.getByRole('link', { name: 'Pulpit' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Odjazdy / Przyjazdy' })).toBeInTheDocument()
  })

  it('podświetla bieżącą pozycję przez aria-current', () => {
    render(<Sidebar activeItem="pulpit" />)
    expect(screen.getByRole('link', { name: 'Pulpit' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Odjazdy / Przyjazdy' })).not.toHaveAttribute('aria-current')
  })

  it('Trasy/Mapa/Ustawienia/Powiadomienia są nieaktywne — brak href, aria-disabled', () => {
    render(<Sidebar activeItem="pulpit" />)
    for (const label of ['Trasy', 'Mapa', 'Ustawienia', 'Powiadomienia']) {
      // eslint-disable-next-line testing-library/no-node-access -- najbliższy element z aria-disabled to cały wiersz pozycji nawigacji
      const item = screen.getByText(label).closest('[aria-disabled]')
      expect(item).toHaveAttribute('aria-disabled', 'true')
      // eslint-disable-next-line testing-library/no-node-access -- sprawdzamy brak <a> wewnątrz TEGO konkretnego wiersza
      expect(item?.querySelector('a')).toBeNull()
    }
  })

  it('przycisk zwijania przełącza szerokość sidebara', async () => {
    const { container } = render(<Sidebar activeItem="pulpit" />)
    const toggle = screen.getByRole('button', { name: /zwiń|rozwiń/i })
    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container -- <aside> nie ma dedykowanej roli ARIA, to jedyny sposób odnaleźć go i sprawdzić data-collapsed
    const aside = container.querySelector('aside')
    expect(aside).toHaveAttribute('data-collapsed', 'false')

    toggle.click()

    expect(aside).toHaveAttribute('data-collapsed', 'true')
  })
})
