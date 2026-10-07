import { describe, expect, it } from 'vitest'
import { parseDisplayNumber } from './displayNumber'

describe('parseDisplayNumber', () => {
  it('splits a plain integer', () => {
    expect(parseDisplayNumber('12')).toEqual({ prefix: '', value: 12, suffix: '' })
  })

  it('keeps a leading plus as the prefix', () => {
    expect(parseDisplayNumber('+3')).toEqual({ prefix: '+', value: 3, suffix: '' })
  })

  it('keeps a trailing percent sign as the suffix', () => {
    expect(parseDisplayNumber('87%')).toEqual({ prefix: '', value: 87, suffix: '%' })
  })

  it.each(['brak danych', '—', '', '+', '%', '1 2', '1,5', '-4'])('never turns %j into a number (unknown stays text)', (text) => {
    expect(parseDisplayNumber(text)).toBeNull()
  })
})
