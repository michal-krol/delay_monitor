import { describe, expect, it } from 'vitest'
import { matchesStationName, normalizeForSearch } from './search'

describe('normalizeForSearch', () => {
  it('lowercases and trims', () => {
    expect(normalizeForSearch('  Kraków Główny  ')).toBe('krakow glowny')
  })

  it('strips the diacritics that NFD decomposes', () => {
    expect(normalizeForSearch('Gdańsk')).toBe('gdansk')
    expect(normalizeForSearch('Świnoujście')).toBe('swinoujscie')
    expect(normalizeForSearch('Żory')).toBe('zory')
    expect(normalizeForSearch('Zduńska Wola')).toBe('zdunska wola')
  })

  it('handles ł and Ł, which no Unicode normalisation decomposes', () => {
    expect(normalizeForSearch('Łódź')).toBe('lodz')
    expect(normalizeForSearch('Biała Podlaska')).toBe('biala podlaska')
    expect(normalizeForSearch('ŁÓDŹ WIDZEW')).toBe('lodz widzew')
  })

  it('covers every Polish diacritic', () => {
    expect(normalizeForSearch('ąćęłńóśźż')).toBe('acelnoszz')
  })

  it('leaves plain ASCII untouched', () => {
    expect(normalizeForSearch('Sopot')).toBe('sopot')
  })
})

describe('matchesStationName', () => {
  it('finds an accented name from an unaccented query', () => {
    expect(matchesStationName('Wrocław Główny', normalizeForSearch('wroclaw'))).toBe(true)
    expect(matchesStationName('Gdańsk Wrzeszcz', normalizeForSearch('GDANSK'))).toBe(true)
    expect(matchesStationName('Łódź Kaliska', normalizeForSearch('lodz kal'))).toBe(true)
  })

  it('still finds an accented name from an accented query', () => {
    expect(matchesStationName('Wrocław Główny', normalizeForSearch('Wrocław'))).toBe(true)
  })

  it('matches on a substring, not only a prefix', () => {
    expect(matchesStationName('Warszawa Wschodnia', normalizeForSearch('wschodnia'))).toBe(true)
  })

  it('does not match an unrelated name', () => {
    expect(matchesStationName('Kraków Główny', normalizeForSearch('warszawa'))).toBe(false)
  })
})
