import { describe, expect, it } from 'vitest'
import { compassDirection, describeWeatherCode } from './format'

describe('describeWeatherCode', () => {
  it.each([
    [0, 'sun'],
    [2, 'cloud'],
    [45, 'fog'],
    [61, 'rain'],
    [71, 'snow'],
    [95, 'thunder'],
  ] as const)('maps WMO code %i to icon %s', (code, icon) => {
    expect(describeWeatherCode(code).icon).toBe(icon)
  })

  it('falls back to a neutral condition for an unrecognized code, instead of throwing', () => {
    expect(describeWeatherCode(12345)).toEqual({ label: 'Warunki nieznane', icon: 'cloud' })
  })
})

describe('compassDirection', () => {
  it.each([
    [0, 'N'],
    [45, 'NE'],
    [90, 'E'],
    [135, 'SE'],
    [180, 'S'],
    [225, 'SW'],
    [270, 'W'],
    [315, 'NW'],
    [360, 'N'],
  ])('maps %i° to %s', (degrees, expected) => {
    expect(compassDirection(degrees)).toBe(expected)
  })

  it('rounds boundary values to the nearest point', () => {
    expect(compassDirection(22)).toBe('N')
    expect(compassDirection(23)).toBe('NE')
  })

  it('normalizes out-of-range degrees', () => {
    expect(compassDirection(359)).toBe('N')
    expect(compassDirection(-45)).toBe('NW')
    expect(compassDirection(405)).toBe('NE')
  })
})
