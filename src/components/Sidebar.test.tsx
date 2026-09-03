// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'
import { __resetCityContext } from '@/hooks/useCityContext'

// CitySwitcher (nad menu) używa useRouter.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeEach(() => {
  // useSidebarCollapsed persists to real localStorage — a test that toggles
  // collapse (like the one below) would otherwise leak collapsed=true into
  // every test that runs after it in this file.
  window.localStorage.clear()
  __resetCityContext()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Sidebar', () => {
  it('pokazuje wersję i środowisko pod nazwą aplikacji — "main" jako czytelne "prod"', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.2.3')
    vi.stubEnv('NEXT_PUBLIC_APP_BRANCH', 'main')

    render(<Sidebar activeItem="pulpit" />)

    expect(screen.getByText('v1.2.3 · prod')).toBeInTheDocument()
  })

  it('pokazuje "dev" bez zmian, i nieznaną gałąź tak jak jest', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.2.3')
    vi.stubEnv('NEXT_PUBLIC_APP_BRANCH', 'dev')
    const { unmount } = render(<Sidebar activeItem="pulpit" />)
    expect(screen.getByText('v1.2.3 · dev')).toBeInTheDocument()
    unmount()

    vi.stubEnv('NEXT_PUBLIC_APP_BRANCH', 'claude/some-feature')
    render(<Sidebar activeItem="pulpit" />)
    expect(screen.getByText('v1.2.3 · claude/some-feature')).toBeInTheDocument()
  })

  it('chowa wersję/środowisko razem z nazwą aplikacji, gdy sidebar jest zwinięty', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.2.3')
    vi.stubEnv('NEXT_PUBLIC_APP_BRANCH', 'dev')
    render(<Sidebar activeItem="pulpit" />)

    fireEvent.click(screen.getByRole('button', { name: /zwiń|rozwiń/i }))

    expect(screen.queryByText('v1.2.3 · dev')).not.toBeInTheDocument()
    expect(screen.queryByText('Monitor opóźnień')).not.toBeInTheDocument()
  })

  it('renderuje aktywny link do Pulpitu', () => {
    render(<Sidebar activeItem="pulpit" />)
    expect(screen.getByRole('link', { name: 'Pulpit' })).toBeInTheDocument()
  })

  it('podświetla bieżącą pozycję przez aria-current', () => {
    render(<Sidebar activeItem="pulpit" />)
    expect(screen.getByRole('link', { name: 'Pulpit' })).toHaveAttribute('aria-current', 'page')
  })

  it('„Odjazdy / Przyjazdy" prowadzi na /miasto (trasa dobiera domyślne miasto)', () => {
    render(<Sidebar activeItem="odjazdy" />)
    const link = screen.getByRole('link', { name: 'Odjazdy / Przyjazdy' })
    expect(link).toHaveAttribute('href', '/miasto')
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('„Trasy" prowadzi na /linie (trasa dobiera domyślne miasto)', () => {
    render(<Sidebar activeItem="trasy" />)
    const link = screen.getByRole('link', { name: 'Trasy' })
    expect(link).toHaveAttribute('href', '/linie')
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('Ulubione/Powiadomienia/Mapa/Ustawienia są nieaktywne — brak href, aria-disabled', () => {
    render(<Sidebar activeItem="pulpit" />)
    for (const label of ['Ulubione', 'Powiadomienia', 'Mapa', 'Ustawienia']) {
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
    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container -- potrzebujemy węzła <aside>, żeby sprawdzić atrybut data-collapsed (getByRole('complementary') dałby ten sam element, ale nie atrybut wprost)
    const aside = container.querySelector('aside')
    expect(aside).toHaveAttribute('data-collapsed', 'false')

    fireEvent.click(toggle)

    expect(aside).toHaveAttribute('data-collapsed', 'true')
  })
})
