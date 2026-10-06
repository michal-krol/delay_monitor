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
