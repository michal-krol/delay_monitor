import { describe, expect, it } from 'vitest'
import { pluralPl } from './plural'

const delayed = (count: number) => pluralPl(count, 'opóźniony', 'opóźnione', 'opóźnionych')

describe('pluralPl', () => {
  it('uses the singular form for exactly one', () => {
    expect(delayed(1)).toBe('opóźniony')
  })

  it('uses the "few" form for 2-4', () => {
    expect(delayed(2)).toBe('opóźnione')
    expect(delayed(3)).toBe('opóźnione')
    expect(delayed(4)).toBe('opóźnione')
  })

  it('uses the "many" form for 0 and 5-21', () => {
    expect(delayed(0)).toBe('opóźnionych')
    expect(delayed(5)).toBe('opóźnionych')
    expect(delayed(11)).toBe('opóźnionych')
    expect(delayed(21)).toBe('opóźnionych')
  })

  it('uses the "many" form for the teens despite their 2-4 ending', () => {
    expect(delayed(12)).toBe('opóźnionych')
    expect(delayed(13)).toBe('opóźnionych')
    expect(delayed(14)).toBe('opóźnionych')
  })

  it('uses the "few" form when a 2-4 ending is not a teen', () => {
    expect(delayed(22)).toBe('opóźnione')
    expect(delayed(103)).toBe('opóźnione')
    expect(delayed(1024)).toBe('opóźnione')
  })

  it('is not confused by 112-114, whose last two digits are teens', () => {
    expect(delayed(112)).toBe('opóźnionych')
    expect(delayed(113)).toBe('opóźnionych')
    expect(delayed(114)).toBe('opóźnionych')
  })
})
