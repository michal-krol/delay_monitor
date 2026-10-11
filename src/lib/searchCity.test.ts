import { describe, expect, it } from 'vitest'
import { resolvePageCity } from './searchCity'

const WARSZAWA = { id: 'warszawa', railStations: [{}, {}, {}] }
const KRAKOW = { id: 'krakow', railStations: [{}] }

describe('resolvePageCity', () => {
  it('url city wins when known', () => {
    expect(resolvePageCity('krakow', 'warszawa', [WARSZAWA, KRAKOW])).toBe('krakow')
  })

  it('unknown url city falls back to context then default', () => {
    expect(resolvePageCity('gdansk', 'krakow', [WARSZAWA, KRAKOW])).toBe('krakow')
    expect(resolvePageCity('gdansk', null, [KRAKOW, WARSZAWA])).toBe('warszawa')
  })

  it('before cities load the url city is NOT trusted (an unknown ?city= must not reach /api/gtfs); context or null', () => {
    expect(resolvePageCity('krakow', 'warszawa', null)).toBe('warszawa')
    expect(resolvePageCity('zzz', null, null)).toBeNull()
    expect(resolvePageCity('krakow', null, null)).toBeNull()
  })

  it('a url city that fails the pattern is ignored even once cities are loaded', () => {
    expect(resolvePageCity('KRK!', 'warszawa', null)).toBe('warszawa')
    expect(resolvePageCity('../x', null, null)).toBeNull()
    expect(resolvePageCity('../x', 'krakow', [WARSZAWA, KRAKOW])).toBe('krakow')
  })

  it('null when nothing resolves', () => {
    expect(resolvePageCity(null, null, null)).toBeNull()
    expect(resolvePageCity(null, null, [])).toBeNull()
  })
})
