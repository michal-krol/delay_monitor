// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppSidebar } from './AppSidebar'
import { __resetCityContext } from '@/hooks/useCityContext'

const usePathname = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => usePathname(),
  useRouter: () => ({ push: vi.fn() }),
}))

afterEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  __resetCityContext()
})

describe('AppSidebar', () => {
  it('marks "Pulpit" as the current page only on the root path', () => {
    usePathname.mockReturnValue('/')
    render(<AppSidebar />)
    expect(screen.getByRole('link', { name: 'Pulpit' })).toHaveAttribute('aria-current', 'page')
  })

  it('marks nothing as current on a station or connection page', () => {
    usePathname.mockReturnValue('/odjazdy/33605')
    render(<AppSidebar />)
    expect(screen.getByRole('link', { name: 'Pulpit' })).not.toHaveAttribute('aria-current')
  })

  it('marks "Odjazdy / Przyjazdy" on a city page, "Trasy" on a line page', () => {
    usePathname.mockReturnValue('/miasto/waw')
    const { rerender } = render(<AppSidebar />)
    expect(screen.getByRole('link', { name: 'Odjazdy / Przyjazdy' })).toHaveAttribute('aria-current', 'page')

    usePathname.mockReturnValue('/miasto/waw/linia/20')
    rerender(<AppSidebar />)
    expect(screen.getByRole('link', { name: 'Trasy' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Odjazdy / Przyjazdy' })).not.toHaveAttribute('aria-current')
  })
})
