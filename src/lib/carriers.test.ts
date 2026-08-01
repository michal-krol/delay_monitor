import { describe, expect, it } from 'vitest'
import { getCarrierInfo } from './carriers'

describe('getCarrierInfo', () => {
  it('resolves a known carrier code to its name and logo', () => {
    const info = getCarrierInfo('IC')
    expect(info).toEqual({ code: 'IC', name: 'PKP Intercity', logoSrc: '/carriers/pkp-ic.svg' })
  })

  it('returns undefined for an unknown carrier code', () => {
    expect(getCarrierInfo('UNKNOWN')).toBeUndefined()
  })

  it('returns undefined for an empty carrier code', () => {
    expect(getCarrierInfo('')).toBeUndefined()
  })
})
