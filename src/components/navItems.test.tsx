import { describe, expect, it } from 'vitest'
import { activeItemFromPath, NAV_ITEMS } from './navItems'
import { DeparturesBoardIcon } from './icons'

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
    expect(activeItemFromPath('/lines')).toBe('linie')
    expect(activeItemFromPath('/city/warszawa')).toBe('odjazdy')
  })

  it('returns undefined for a path with no menu entry', () => {
    expect(activeItemFromPath('/station/33605')).toBeUndefined()
  })
})

describe('NAV_ITEMS', () => {
  it('uses the departures-board icon for Odjazdy, not the generic list icon (one icon per concept)', () => {
    expect(NAV_ITEMS.find((i) => i.key === 'odjazdy')?.icon).toBe(DeparturesBoardIcon)
  })

  it('has an active Mapa entry pointing at /map', () => {
    const item = NAV_ITEMS.find((i) => i.label === 'Mapa')
    expect(item).toEqual({ key: 'mapa', href: '/map', label: 'Mapa', shortLabel: 'Mapa', icon: expect.any(Function) })
  })

  it('has a short label for the bottom bar: „Odjazdy" for „Odjazdy / Przyjazdy"', () => {
    expect(NAV_ITEMS.find((i) => i.key === 'odjazdy')?.shortLabel).toBe('Odjazdy')
    expect(NAV_ITEMS.map((i) => i.shortLabel)).toEqual(['Pulpit', 'Odjazdy', 'Linie', 'Mapa'])
  })

  it('has exactly 4 entries (no disabled placeholders)', () => {
    expect(NAV_ITEMS).toHaveLength(4)
  })
})
