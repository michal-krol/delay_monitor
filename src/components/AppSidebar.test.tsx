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
})
