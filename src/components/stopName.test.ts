import { describe, expect, it } from 'vitest'
import { stopDisplayName, stopsWithLines, stopModes } from './stopName'

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

describe('stopModes', () => {
  const board = {
    modes: ['tram', 'bus'] as ('tram' | 'bus' | 'metro' | 'rail' | 'other')[],
    members: [
      { id: '100101', lines: [{ mode: 'tram' as const }] },
      { id: '100102', lines: [{ mode: 'bus' as const }, { mode: 'bus' as const }] },
      { id: '7014M', lines: [] },
    ],
  }
  it('a whole group shows the modes of the group, in the order the server gave', () => {
    expect(stopModes(board, null)).toEqual(['tram', 'bus'])
  })
  it('a single stop shows only the modes of ITS lines — not every saved stop is a bus', () => {
    expect(stopModes(board, '100101')).toEqual(['tram'])
    expect(stopModes(board, '100102')).toEqual(['bus'])
  })
  it('a stop that is not listed or has no lines falls back to the group modes', () => {
    expect(stopModes(board, 'unknown')).toEqual(['tram', 'bus'])
    expect(stopModes(board, '7014M')).toEqual(['tram', 'bus'])
  })
  it('no board yet = unknown (empty), never a default bus', () => {
    expect(stopModes(null, null)).toEqual([])
    expect(stopModes(null, '100101')).toEqual([])
  })
})
