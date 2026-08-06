// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { patchUrlParams, readUrlParam } from './urlState'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('readUrlParam', () => {
  it('reads a parameter from the current URL', () => {
    window.history.pushState({}, '', '/?station=33605&name=Warszawa')
    expect(readUrlParam('station')).toBe('33605')
    expect(readUrlParam('name')).toBe('Warszawa')
  })

  it('returns null for a missing parameter', () => {
    window.history.pushState({}, '', '/')
    expect(readUrlParam('station')).toBeNull()
  })
})

describe('patchUrlParams', () => {
  it('sets new parameters without touching unrelated ones already in the URL', () => {
    window.history.pushState({}, '', '/?tab=arrivals')
    patchUrlParams({ station: '33605', name: 'Warszawa Centralna' })

    const params = new URLSearchParams(window.location.search)
    expect(params.get('tab')).toBe('arrivals')
    expect(params.get('station')).toBe('33605')
    expect(params.get('name')).toBe('Warszawa Centralna')
  })

  it('removes a parameter when its value is null, keeping the rest', () => {
    window.history.pushState({}, '', '/?station=33605&name=Warszawa+Centralna&tab=arrivals')
    patchUrlParams({ station: null, name: null })

    const params = new URLSearchParams(window.location.search)
    expect(params.has('station')).toBe(false)
    expect(params.has('name')).toBe(false)
    expect(params.get('tab')).toBe('arrivals')
  })

  it('drops the trailing "?" entirely when no parameters remain', () => {
    window.history.pushState({}, '', '/?station=33605')
    patchUrlParams({ station: null })

    expect(window.location.search).toBe('')
    expect(window.location.pathname + window.location.search).toBe('/')
  })

  it('uses replaceState, not pushState -- it must not add a browser-history entry', () => {
    window.history.pushState({}, '', '/')
    const before = window.history.length
    patchUrlParams({ station: '33605' })
    expect(window.history.length).toBe(before)
  })
})
