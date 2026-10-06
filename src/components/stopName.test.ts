import { describe, expect, it } from 'vitest'
import { stopDisplayName, stopsWithLines } from './stopName'

describe('stopDisplayName', () => {
  it('appends the code to the group name', () => {
    expect(stopDisplayName('Saska', '01')).toBe('Saska 01')
  })
  it('falls back to the bare name without a code', () => {
    expect(stopDisplayName('Metro Świętokrzyska', null)).toBe('Metro Świętokrzyska')
  })
  it('falls back to the bare name for an empty code', () => {
    expect(stopDisplayName('Centrum', '')).toBe('Centrum')
  })
  it('does not repeat a number the name already ends with', () => {
    expect(stopDisplayName('Centrum 01', '01')).toBe('Centrum 01')
  })
  it('appends when the name only ends with the same digits', () => {
    expect(stopDisplayName('Linia 101', '01')).toBe('Linia 101 01')
  })
})

describe('stopsWithLines', () => {
  it('drops members without lines (metro parent stations) and tolerates a missing list', () => {
    expect(stopsWithLines([{ id: 'a', lines: ['20'] }, { id: '7014M', lines: [] }]).map((m) => m.id)).toEqual(['a'])
    expect(stopsWithLines(undefined)).toEqual([])
  })
})
