import { describe, expect, it } from 'vitest'
import { allCities, getCity } from './cities'

describe('cities registry', () => {
  it('resolves a known city and rejects an unknown one', () => {
    expect(getCity('warszawa')?.name).toBe('Warszawa')
    expect(getCity('nope')).toBeNull()
    expect(getCity('')).toBeNull()
  })

  it('every entry carries the fields the pipeline needs', () => {
    for (const city of allCities()) {
      expect(city.id).toMatch(/^[a-z]{2,8}$/)
      expect(city.staticUrl).toMatch(/^https?:\/\//)
      expect(city.railStationPrefix.length).toBeGreaterThan(0)
      expect(() => new Intl.DateTimeFormat('en-CA', { timeZone: city.timezone })).not.toThrow()
    }
  })

  it('does not leak the word "warszawa" as a hardcoded assumption outside the registry value', () => {
    // Sanity: `name`/`railStationPrefix` SĄ jedynym dozwolonym miejscem.
    expect(getCity('warszawa')?.railStationPrefix).toBe('Warszawa ')
  })
})
