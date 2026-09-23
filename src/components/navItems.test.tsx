import { describe, expect, it } from 'vitest'
import { activeItemFromPath, NAV_ITEMS } from './navItems'

describe('activeItemFromPath', () => {
  it('recognizes /map and /city/[city]/map as the map item', () => {
    expect(activeItemFromPath('/map')).toBe('mapa')
    expect(activeItemFromPath('/city/warszawa/map')).toBe('mapa')
  })

  it('does not confuse the map path with the departures path', () => {
    expect(activeItemFromPath('/city/warszawa/map')).not.toBe('odjazdy')
  })

  it('still recognizes existing routes', () => {
    expect(activeItemFromPath('/')).toBe('pulpit')
    expect(activeItemFromPath('/lines')).toBe('trasy')
    expect(activeItemFromPath('/city/warszawa')).toBe('odjazdy')
  })

  it('returns undefined for a path with no menu entry', () => {
    expect(activeItemFromPath('/station/33605')).toBeUndefined()
  })
})

describe('NAV_ITEMS', () => {
  it('has an active Mapa entry pointing at /map', () => {
    const item = NAV_ITEMS.find((i) => i.label === 'Mapa')
    expect(item).toEqual({ kind: 'active', key: 'mapa', href: '/map', label: 'Mapa', icon: expect.any(Function) })
  })
})
