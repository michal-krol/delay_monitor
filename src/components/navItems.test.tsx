import { describe, expect, it } from 'vitest'
import { activeItemFromPath, MOBILE_NAV_ITEMS, mobileActiveItemFromPath, NAV_ITEMS } from './navItems'
import { DeparturesBoardIcon, HomeIcon, MapIcon, RouteIcon, SearchIcon } from './icons'

describe('activeItemFromPath (desktop)', () => {
  it('recognizes /map and /city/[city]/map as the map item', () => {
    expect(activeItemFromPath('/map')).toBe('mapa')
    expect(activeItemFromPath('/city/warszawa/map')).toBe('mapa')
  })

  it('does not confuse the map path with the departures path', () => {
    expect(activeItemFromPath('/city/warszawa/map')).not.toBe('odjazdy')
  })

  it('still recognizes existing routes', () => {
    expect(activeItemFromPath('/')).toBe('start')
    expect(activeItemFromPath('/lines')).toBe('linie')
    expect(activeItemFromPath('/city')).toBe('odjazdy')
    expect(activeItemFromPath('/city/warszawa')).toBe('odjazdy')
  })

  it('returns undefined for a path with no menu entry', () => {
    expect(activeItemFromPath('/station/33605')).toBeUndefined()
  })
})

describe('mobileActiveItemFromPath', () => {
  it.each([
    ['/', 'start'],
    ['/city', 'start'],
    ['/city/warszawa', 'start'],
    ['/station/33605', 'start'],
    ['/connection/x', 'start'],
    ['/connection/1/2/2026-10-10', 'start'],
    ['/city/warszawa/stop/1001', 'start'],
    ['/map', 'map'],
    ['/city/warszawa/map', 'map'],
    ['/search', 'search'],
    ['/lines', 'lines'],
    ['/city/warszawa/lines', 'lines'],
    ['/city/warszawa/line/20', 'lines'],
  ] as const)('%s -> %s', (path, expected) => {
    expect(mobileActiveItemFromPath(path)).toBe(expected)
  })

  it('returns undefined for an unknown path', () => {
    expect(mobileActiveItemFromPath('/xyz')).toBeUndefined()
  })
})

describe('MOBILE_NAV_ITEMS', () => {
  it('are Start, Mapa, Szukaj, Linie in that order with their hrefs', () => {
    expect(MOBILE_NAV_ITEMS.map((i) => [i.label, i.href])).toEqual([
      ['Start', '/'],
      ['Mapa', '/map'],
      ['Szukaj', '/search'],
      ['Linie', '/lines'],
    ])
  })

  it('uses the dictionary icons and marks only Szukaj as an action', () => {
    expect(MOBILE_NAV_ITEMS.map((i) => i.icon)).toEqual([HomeIcon, MapIcon, SearchIcon, RouteIcon])
    expect(MOBILE_NAV_ITEMS.map((i) => i.kind)).toEqual(['link', 'link', 'action', 'link'])
  })
})

describe('NAV_ITEMS (desktop)', () => {
  it('uses the departures-board icon for Odjazdy, not the generic list icon (one icon per concept)', () => {
    expect(NAV_ITEMS.find((i) => i.key === 'odjazdy')?.icon).toBe(DeparturesBoardIcon)
  })

  it('has an active Mapa entry pointing at /map', () => {
    const item = NAV_ITEMS.find((i) => i.label === 'Mapa')
    expect(item).toEqual({ key: 'mapa', href: '/map', label: 'Mapa', shortLabel: 'Mapa', icon: expect.any(Function) })
  })

  it('names the first entry „Start" and keeps „Odjazdy / Przyjazdy" on /city', () => {
    expect(NAV_ITEMS[0]).toMatchObject({ key: 'start', href: '/', label: 'Start' })
    expect(NAV_ITEMS.find((i) => i.key === 'odjazdy')).toMatchObject({ href: '/city', label: 'Odjazdy / Przyjazdy' })
    expect(NAV_ITEMS.map((i) => i.shortLabel)).toEqual(['Start', 'Odjazdy', 'Linie', 'Mapa'])
  })

  it('has exactly 4 entries (no disabled placeholders)', () => {
    expect(NAV_ITEMS).toHaveLength(4)
  })
})
