import { describe, expect, it } from 'vitest'
import { placeTransitionName } from './navTransition'

describe('placeTransitionName', () => {
  it('is a valid CSS identifier even for GTFS ids with colons, spaces and Polish letters', () => {
    for (const id of ['33605', 'metro:A18', 'Młociny 01', 'a/b?c=d']) {
      expect(placeTransitionName('gtfs', id)).toMatch(/^place-gtfs-[A-Za-z0-9_-]+$/)
    }
  })

  it('never maps two different ids to the same name (a duplicate name aborts the transition)', () => {
    const ids = ['a:b', 'a_b', 'a-b', 'a b', 'a_003ab', 'a:b:c']
    expect(new Set(ids.map((id) => placeTransitionName('gtfs', id))).size).toBe(ids.length)
  })

  it('separates rail stations from city stops with the same id', () => {
    expect(placeTransitionName('pkp', '1001')).not.toBe(placeTransitionName('gtfs', '1001'))
  })
})

describe('transition type constants', () => {
  it('are frozen: a consumer that mutates the array it was handed must not change every later navigation', async () => {
    const { NAV_BACK_TYPES, NAV_TAB_TYPES, NAV_FORWARD_OPTIONS } = await import('./navTransition')
    expect(Object.isFrozen(NAV_BACK_TYPES)).toBe(true)
    expect(Object.isFrozen(NAV_TAB_TYPES)).toBe(true)
    expect(Object.isFrozen(NAV_FORWARD_OPTIONS.transitionTypes)).toBe(true)
  })
})
