import { describe, expect, it } from 'vitest'
import { getCarrierLogo } from './carriers'

describe('getCarrierLogo', () => {
  it('resolves a known carrier code to its logo path', () => {
    expect(getCarrierLogo('IC')).toBe('/carriers/pkp-ic.svg')
  })

  it('resolves Polregio (PR) to its logo path', () => {
    expect(getCarrierLogo('PR')).toBe('/carriers/pr.svg')
  })

  it('returns undefined for a carrier code without a logo', () => {
    expect(getCarrierLogo('UNKNOWN')).toBeUndefined()
  })

  it('returns undefined for an empty carrier code', () => {
    expect(getCarrierLogo('')).toBeUndefined()
  })
})
