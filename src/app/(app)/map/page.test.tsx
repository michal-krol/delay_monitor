// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MapIndex from './page'

const captured = vi.hoisted(() => ({ to: null as null | ((city: string) => string) }))
vi.mock('@/components/CityRedirect', () => ({
  CityRedirect: ({ to }: { to: (city: string) => string }) => {
    captured.to = to
    return null
  },
}))

beforeEach(() => {
  captured.to = null
})

describe('/map index', () => {
  it('map index redirect keeps line dir at hide alerts nearby', () => {
    window.history.replaceState(null, '', '/map?line=20&dir=1&at=52.25000%2C21.05000%2C15.0&hide=busStops&alerts=1&nearby=1')
    render(<MapIndex />)
    expect(captured.to?.('warszawa')).toBe('/city/warszawa/map?line=20&dir=1&at=52.25000%2C21.05000%2C15.0&hide=busStops&alerts=1&nearby=1')
  })

  it('adds no query when there is none, and the callback is stable across renders', () => {
    window.history.replaceState(null, '', '/map')
    const { rerender } = render(<MapIndex />)
    const first = captured.to
    expect(first?.('krakow')).toBe('/city/krakow/map')
    rerender(<MapIndex />)
    expect(captured.to).toBe(first)
  })
})
