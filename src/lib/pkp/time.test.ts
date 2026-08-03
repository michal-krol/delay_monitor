import { describe, expect, it } from 'vitest'
import { normalizeApiTimestamp, warsawDateString } from './time'

describe('warsawDateString', () => {
  it('returns the Warsaw calendar date even when the process/UTC date has not rolled over yet (CEST, UTC+2)', () => {
    // 23:50 czasu warszawskiego latem to dopiero 21:50 UTC — data wg UTC
    // byłaby wciąż poprzednim dniem, mimo że w Warszawie already "jutro" za 10 min.
    expect(warsawDateString(new Date('2026-08-01T21:50:00Z'))).toBe('2026-08-01')
    expect(warsawDateString(new Date('2026-08-01T22:10:00Z'))).toBe('2026-08-02')
  })

  it('returns the Warsaw calendar date in winter (CET, UTC+1)', () => {
    expect(warsawDateString(new Date('2026-01-15T22:30:00Z'))).toBe('2026-01-15')
    expect(warsawDateString(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16')
  })
})

describe('normalizeApiTimestamp', () => {
  it('interprets a timezone-less summer timestamp as Warsaw local time (CEST, UTC+2)', () => {
    // Ten dokładny przypadek trafił do produkcji: pociąg pokazywany jako
    // nadchodzący, mimo że wg zegara warszawskiego już odjechał.
    expect(normalizeApiTimestamp('2026-08-02T00:33:00')).toBe('2026-08-01T22:33:00.000Z')
  })

  it('interprets a timezone-less winter timestamp as Warsaw local time (CET, UTC+1)', () => {
    expect(normalizeApiTimestamp('2026-01-15T10:00:00')).toBe('2026-01-15T09:00:00.000Z')
  })

  it('handles milliseconds on a timezone-less timestamp', () => {
    expect(normalizeApiTimestamp('2026-08-02T00:33:00.500')).toBe('2026-08-01T22:33:00.500Z')
  })

  it('leaves a timestamp with an explicit offset untouched', () => {
    // fixtures/operations.json jest pisane ręcznie z jawnym przesunięciem —
    // normalizacja musi być tożsamościowa, żeby nie przesunąć ich drugi raz.
    expect(normalizeApiTimestamp('2026-08-01T12:15:00+02:00')).toBe('2026-08-01T12:15:00+02:00')
  })

  it('leaves a timestamp already in Z form untouched', () => {
    expect(normalizeApiTimestamp('2026-08-01T10:15:00Z')).toBe('2026-08-01T10:15:00Z')
  })

  it('does not confuse the date-part dashes with a timezone offset', () => {
    // "2026-08-01T..." zawiera myślniki wyłącznie w części datowej — regex
    // musi patrzeć tylko na koniec ciągu.
    const result = normalizeApiTimestamp('2026-08-01T00:00:00')
    expect(result).not.toBe('2026-08-01T00:00:00')
    expect(result).toMatch(/Z$/)
  })
})
