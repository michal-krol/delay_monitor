import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LINE_VIEW,
  lineViewPatch,
  parseLineViewState,
  resolveLineView,
  type LineViewState,
} from './lineViewState'

const parse = (query: string) => parseLineViewState(new URLSearchParams(query))
const view = (patch: Partial<LineViewState>): LineViewState => ({ ...DEFAULT_LINE_VIEW, ...patch })

describe('parseLineViewState', () => {
  it('restores the second occurrence of a loop stop and ignores invalid occurrence', () => {
    const state = parse('stop=A&occ=1')
    expect(resolveLineView(state, [{ directionId: 0, stops: [{ stopId: 'A' }, { stopId: 'B' }, { stopId: 'A' }] }])).toEqual({ directionIndex: 0, stopIndex: 2 })
    expect(parse('stop=A&occ=-1')).toEqual(view({ stopId: 'A' }))
  })
  it('returns the default view for an empty query', () => {
    expect(parse('')).toEqual({ directionId: null, stopId: null, pane: 'route', day: 'weekday' })
  })

  it('reads valid dir, stop, pane and day', () => {
    expect(parse('dir=1&stop=7014M:P1&pane=timetable&day=saturday')).toEqual({
      directionId: 1,
      stopId: '7014M:P1',
      pane: 'timetable',
      day: 'saturday',
    })
  })

  it('accepts dir with one or two digits', () => {
    expect(parse('dir=0').directionId).toBe(0)
    expect(parse('dir=12').directionId).toBe(12)
  })

  it('ignores a non-numeric dir', () => {
    expect(parse('dir=abc').directionId).toBeNull()
    expect(parse('dir=1e1').directionId).toBeNull()
    expect(parse('dir=').directionId).toBeNull()
  })

  it('ignores a negative, fractional, signed or too long dir', () => {
    for (const bad of ['-1', '1.5', '+1', '123', ' 1', '1 ']) {
      expect(parse(`dir=${encodeURIComponent(bad)}`).directionId).toBeNull()
    }
  })

  it('ignores a stop that fails GTFS_STOP_ID_PATTERN', () => {
    for (const bad of ['', 'a/b', '../x', '1234567890123', 'a:b:c', '<script>', 'a b']) {
      expect(parse(`stop=${encodeURIComponent(bad)}`).stopId).toBeNull()
    }
  })

  it('ignores a pane outside the allow-list', () => {
    expect(parse('pane=map').pane).toBe('route')
    expect(parse('pane=TIMETABLE').pane).toBe('route')
    expect(parse('pane=__proto__').pane).toBe('route')
  })

  it('ignores a day outside the allow-list', () => {
    expect(parse('day=monday').day).toBe('weekday')
    expect(parse('day=constructor').day).toBe('weekday')
  })

  it('accepts every allowed day', () => {
    for (const day of ['weekday', 'saturday', 'sunday', 'other'] as const) {
      expect(parse(`day=${day}`).day).toBe(day)
    }
  })

  it('keeps valid params when another one is bad', () => {
    expect(parse('dir=x&stop=100&pane=timetable')).toEqual(
      view({ stopId: '100', pane: 'timetable' }),
    )
  })

  it('uses the first value of a repeated param (URLSearchParams.get) without throwing', () => {
    expect(parse('dir=1&dir=2').directionId).toBe(1)
  })
})

describe('lineViewPatch', () => {
  it('maps the default view to removal of all four params', () => {
    expect(lineViewPatch(DEFAULT_LINE_VIEW)).toEqual({ dir: null, stop: null, pane: null, day: null })
  })

  it('writes non-default values as strings', () => {
    expect(lineViewPatch({ directionId: 0, stopId: '100', pane: 'timetable', day: 'sunday' })).toEqual({
      dir: '0',
      stop: '100',
      pane: 'timetable',
      day: 'sunday',
    })
  })

  it('writes directionId 0 (falsy but valid) instead of dropping it', () => {
    expect(lineViewPatch(view({ directionId: 0 })).dir).toBe('0')
  })

  it('returns only its own four keys', () => {
    expect(Object.keys(lineViewPatch(view({ pane: 'timetable' }))).sort()).toEqual(['day', 'dir', 'pane', 'stop'])
  })

  it('keeps foreign query params when applied to URLSearchParams', () => {
    const params = new URLSearchParams('tab=lines&line=M1&dir=1&pane=timetable')
    for (const [key, value] of Object.entries(lineViewPatch(view({ stopId: '100' })))) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    expect(params.get('tab')).toBe('lines')
    expect(params.get('line')).toBe('M1')
    expect(params.get('stop')).toBe('100')
    expect(params.has('dir')).toBe(false)
    expect(params.has('pane')).toBe(false)
  })

  it('round-trips through parseLineViewState', () => {
    const state: LineViewState = { directionId: 1, stopId: '7014M:P1', pane: 'timetable', day: 'other' }
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(lineViewPatch(state))) {
      if (value !== null) params.set(key, value)
    }
    expect(parseLineViewState(params)).toEqual(state)
  })
})

describe('resolveLineView', () => {
  const dirs = [
    { directionId: 1, stops: [{ stopId: 'A' }, { stopId: 'B' }, { stopId: 'C' }] },
    { directionId: 0, stops: [{ stopId: 'C' }, { stopId: 'B' }, { stopId: 'A' }, { stopId: 'B' }] },
  ]

  it('returns null when there are no directions', () => {
    expect(resolveLineView(DEFAULT_LINE_VIEW, [])).toBeNull()
  })

  it('picks the first direction and first stop for the default view', () => {
    expect(resolveLineView(DEFAULT_LINE_VIEW, dirs)).toEqual({ directionIndex: 0, stopIndex: 0 })
  })

  it('resolves direction by id, not array index', () => {
    expect(resolveLineView(view({ directionId: 0 }), dirs)).toEqual({ directionIndex: 1, stopIndex: 0 })
    expect(resolveLineView(view({ directionId: 1 }), dirs)).toEqual({ directionIndex: 0, stopIndex: 0 })
  })

  it('falls back to the first direction when dir matches nothing', () => {
    expect(resolveLineView(view({ directionId: 7 }), dirs)).toEqual({ directionIndex: 0, stopIndex: 0 })
  })

  it('picks the first direction containing the stop when dir is absent', () => {
    const d = [
      { directionId: 0, stops: [{ stopId: 'A' }] },
      { directionId: 1, stops: [{ stopId: 'B' }, { stopId: 'X' }] },
    ]
    expect(resolveLineView(view({ stopId: 'X' }), d)).toEqual({ directionIndex: 1, stopIndex: 1 })
  })

  it('picks the first direction containing the stop when dir matches nothing', () => {
    const d = [
      { directionId: 0, stops: [{ stopId: 'A' }] },
      { directionId: 1, stops: [{ stopId: 'X' }] },
    ]
    expect(resolveLineView(view({ directionId: 9, stopId: 'X' }), d)).toEqual({ directionIndex: 1, stopIndex: 0 })
  })

  it('keeps the chosen direction even when the stop is only on another one', () => {
    const d = [
      { directionId: 0, stops: [{ stopId: 'A' }] },
      { directionId: 1, stops: [{ stopId: 'X' }] },
    ]
    expect(resolveLineView(view({ directionId: 0, stopId: 'X' }), d)).toEqual({ directionIndex: 0, stopIndex: 0 })
  })

  it('uses the first index of a stop that repeats in the direction (loop line)', () => {
    expect(resolveLineView(view({ directionId: 0, stopId: 'B' }), dirs)).toEqual({ directionIndex: 1, stopIndex: 1 })
  })

  it('falls back to the first stop when the stop is not on the chosen direction', () => {
    expect(resolveLineView(view({ directionId: 1, stopId: 'ZZZ' }), dirs)).toEqual({ directionIndex: 0, stopIndex: 0 })
  })

  it('returns stopIndex 0 for a direction with no stops', () => {
    expect(resolveLineView(view({ stopId: 'A' }), [{ directionId: 0, stops: [] }])).toEqual({
      directionIndex: 0,
      stopIndex: 0,
    })
  })
})
