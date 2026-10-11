import { describe, expect, it } from 'vitest'
import { dedupeAlerts, toAlertFeedStatus, toContextAlertsState, type AlertFeedStatus } from './alertView'
import type { AlertRecord } from './alerts'

const alert = (over: Partial<AlertRecord> = {}): AlertRecord => ({ id: 'a', routes: ['20'], effect: 'DETOUR', link: '', title: 'T', body: 'b', ...over })
const feed = (over: Partial<AlertFeedStatus> = {}): AlertFeedStatus => ({ state: 'ready', fetchedAt: '2026-10-10T10:00:00.000Z', ageMs: 1000, ...over })

describe('toContextAlertsState', () => {
  it.each(['idle', 'loading'] as const)('%s feed is loading, even when a list is attached', (state) => {
    expect(toContextAlertsState(feed({ state, fetchedAt: null, ageMs: null }), [])).toEqual({ state: 'loading', stale: false })
  })

  it('ready feed is ready (also with an empty list: only ready+[] means "none")', () => {
    expect(toContextAlertsState(feed(), [])).toEqual({ state: 'ready', stale: false })
    expect(toContextAlertsState(feed(), [alert()])).toEqual({ state: 'ready', stale: false })
  })

  it('failed without any successful fetch is failed and NOT stale (no last good data)', () => {
    expect(toContextAlertsState(feed({ state: 'failed', fetchedAt: null, ageMs: null }), [])).toEqual({ state: 'failed', stale: false })
  })

  it('failed after a successful fetch is failed and stale (last good list is shown)', () => {
    expect(toContextAlertsState(feed({ state: 'failed' }), [alert()])).toEqual({ state: 'failed', stale: true })
  })

  it('does not read the list length as a success signal', () => {
    expect(toContextAlertsState(feed({ state: 'failed', fetchedAt: null, ageMs: null }), [alert()])).toEqual({ state: 'failed', stale: false })
  })

  it.each([null, undefined])('legacy payload without feed metadata (%s): null alerts = loading, a list = ready', (missing) => {
    expect(toContextAlertsState(missing, null)).toEqual({ state: 'loading', stale: false })
    expect(toContextAlertsState(missing, [])).toEqual({ state: 'ready', stale: false })
    expect(toContextAlertsState(missing, [alert()])).toEqual({ state: 'ready', stale: false })
  })
})

describe('toAlertFeedStatus', () => {
  it('projects the poller view and drops counters', () => {
    expect(
      toAlertFeedStatus({ state: 'ready', fetchedAt: '2026-10-10T10:00:00.000Z', ageMs: 5, count: 3, droppedAlerts: 0 })
    ).toEqual({ state: 'ready', fetchedAt: '2026-10-10T10:00:00.000Z', ageMs: 5 })
  })

  it('is null without a poller (unknown, not "ready")', () => {
    expect(toAlertFeedStatus(undefined)).toBeNull()
  })
})

describe('dedupeAlerts', () => {
  it('dedupes by id (first wins), never by title', () => {
    const list = [alert({ id: 'x', title: 'same' }), alert({ id: 'x', title: 'other' }), alert({ id: 'y', title: 'same' })]
    expect(dedupeAlerts(list).map((a) => [a.id, a.title])).toEqual([['x', 'same'], ['y', 'same']])
  })
})
