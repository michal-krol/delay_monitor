import { describe, expect, it } from 'vitest'
import { getCarrierLogo } from './carriers'

describe('getCarrierLogo', () => {
  it('resolves a known carrier code to its logo path', () => {
    expect(getCarrierLogo('IC')).toBe('/carriers/pkp-ic.svg')
  })

  it('resolves Polregio (PR) to its logo path', () => {
    expect(getCarrierLogo('PR')).toBe('/carriers/pr.svg')
  })

  it.each([
    ['AR', '/carriers/ar.svg'],
    ['CARGO', '/carriers/cargo.svg'],
    ['KMŁ', '/carriers/kml.png'],
    ['KS', '/carriers/ks.png'],
    ['KW', '/carriers/kw.svg'],
    ['ODEG', '/carriers/odeg.svg'],
    ['RJ', '/carriers/rj.svg'],
    ['SKMT', '/carriers/skmt.svg'],
    ['WKD', '/carriers/wkd.svg'],
  ])('resolves %s to its logo path', (code, expected) => {
    expect(getCarrierLogo(code)).toBe(expected)
  })

  it('returns undefined for a carrier code without a logo', () => {
    expect(getCarrierLogo('UNKNOWN')).toBeUndefined()
  })

  it('returns undefined for an empty carrier code', () => {
    expect(getCarrierLogo('')).toBeUndefined()
  })
})
