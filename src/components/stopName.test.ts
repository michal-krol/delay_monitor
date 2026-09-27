import { describe, expect, it } from 'vitest'
import { stopDisplayName } from './stopName'

describe('stopDisplayName', () => {
  it('appends the code to the group name', () => {
    expect(stopDisplayName('Saska', '01')).toBe('Saska 01')
  })
  it('falls back to the bare name without a code', () => {
    expect(stopDisplayName('Metro Świętokrzyska', null)).toBe('Metro Świętokrzyska')
  })
})
