import { describe, expect, it, vi } from 'vitest'
import { createAlertPoller } from './alertPoller'

const alert = (id: string) => ({ id, routes: ['20'], effect: 'DETOUR', link: '', title: 't', body: 'b' })

function harness(fetchFeed: () => Promise<{ alerts: ReturnType<typeof alert>[]; droppedAlerts: number; feedTime: string | null }>) {
  const timers: (() => void)[] = []
  const poller = createAlertPoller({
    fetchFeed,
    pollMs: 1000,
    now: () => 1_000_000,
    setTimer: (fn) => { timers.push(fn); return timers.length as unknown as ReturnType<typeof setTimeout> },
    clearTimer: () => {},
  })
  return { poller, tick: () => timers.splice(0).forEach((fn) => fn()) }
}

describe('createAlertPoller', () => {
  it('goes ready after the first successful fetch', async () => {
    const { poller } = harness(async () => ({ alerts: [alert('A')], droppedAlerts: 0, feedTime: 't' }))
    poller.ensureRunning()
    await vi.waitFor(() => expect(poller.getView().state).toBe('ready'))
    expect(poller.getAlerts()).toHaveLength(1)
  })

  it('keeps last-known alerts on a failed fetch', async () => {
    let ok = true
    const { poller, tick } = harness(async () => {
      if (!ok) throw new Error('boom')
      return { alerts: [alert('A')], droppedAlerts: 0, feedTime: 't' }
    })
    poller.ensureRunning()
    await vi.waitFor(() => expect(poller.getView().state).toBe('ready'))
    ok = false
    tick()
    await vi.waitFor(() => expect(poller.getView().state).toBe('failed'))
    expect(poller.getAlerts()).toHaveLength(1) // unchanged
  })

  it('stop() clears alerts and returns to idle', async () => {
    const { poller } = harness(async () => ({ alerts: [alert('A')], droppedAlerts: 0, feedTime: 't' }))
    poller.ensureRunning()
    await vi.waitFor(() => expect(poller.getView().state).toBe('ready'))
    poller.stop()
    expect(poller.getView().state).toBe('idle')
    expect(poller.getAlerts()).toEqual([])
  })

  it('stop() during an in-flight fetch discards its result and can restart', async () => {
    let resolveFetch: (v: { alerts: ReturnType<typeof alert>[]; droppedAlerts: number; feedTime: string | null }) => void = () => {}
    let calls = 0
    const { poller } = harness(() => {
      calls += 1
      return new Promise((resolve) => { resolveFetch = resolve })
    })
    poller.ensureRunning()
    await vi.waitFor(() => expect(poller.getView().state).toBe('loading'))
    poller.stop()
    resolveFetch({ alerts: [alert('A')], droppedAlerts: 0, feedTime: 't' })
    await Promise.resolve()
    expect(poller.getView().state).toBe('idle')
    expect(poller.getAlerts()).toEqual([])

    poller.ensureRunning()
    resolveFetch({ alerts: [alert('B')], droppedAlerts: 0, feedTime: 't' })
    await vi.waitFor(() => expect(poller.getView().state).toBe('ready'))
    expect(calls).toBe(2)
    expect(poller.getAlerts()).toHaveLength(1)
  })

  it('ensureRunning() twice does not double the timer', () => {
    let starts = 0
    const { poller } = harness(async () => { starts += 1; return { alerts: [], droppedAlerts: 0, feedTime: null } })
    poller.ensureRunning()
    poller.ensureRunning()
    expect(starts).toBe(1)
  })
})
