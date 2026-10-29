// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { HeaderMapShortcut } from './HeaderMapShortcut'

const route = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }))

it.each([
  ['/', '/map'],
  ['/station/33605', '/map'],
  ['/city/warszawa/stop/1001', '/city/warszawa/map'],
  ['/city/warszawa/line/20', '/city/warszawa/map'],
])('maps %s to its context without reading location', (pathname, href) => {
  route.pathname = pathname
  render(<HeaderMapShortcut />)
  expect(screen.getByRole('link', { name: 'Mapa' })).toHaveAttribute('href', href)
  expect(screen.getByRole('link', { name: 'Mapa' })).toHaveClass('min-h-11', 'min-w-11')
})
