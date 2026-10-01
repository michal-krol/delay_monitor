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

  it('„Odjazdy / Przyjazdy" prowadzi na /city (trasa dobiera domyślne miasto)', () => {
    render(<Sidebar activeItem="odjazdy" />)
    const link = screen.getByRole('link', { name: 'Odjazdy / Przyjazdy' })
    expect(link).toHaveAttribute('href', '/city')
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('„Linie" prowadzi na /lines (trasa dobiera domyślne miasto)', () => {
    render(<Sidebar activeItem="linie" />)
    const link = screen.getByRole('link', { name: 'Linie' })
    expect(link).toHaveAttribute('href', '/lines')
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('„Mapa" prowadzi na /map', () => {
    render(<Sidebar activeItem="mapa" />)
    const link = screen.getByRole('link', { name: 'Mapa' })
    expect(link).toHaveAttribute('href', '/map')
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('nawigacja ma dokładnie 4 linki i żadnych nieaktywnych placeholderów', () => {
    const { container } = render(<Sidebar activeItem="pulpit" />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(4)
    for (const [index, name] of ['Pulpit', 'Odjazdy / Przyjazdy', 'Linie', 'Mapa'].entries()) {
      expect(links[index]).toHaveAccessibleName(name)
    }
    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container -- brak jakiegokolwiek elementu z aria-disabled
    expect(container.querySelector('[aria-disabled]')).toBeNull()
    for (const label of ['Ulubione', 'Powiadomienia', 'Ustawienia']) {
      expect(screen.queryByText(label)).toBeNull()
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
