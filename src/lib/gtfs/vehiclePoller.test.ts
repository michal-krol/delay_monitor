import { describe, expect, it, vi } from 'vitest'
import { createVehiclePoller } from './vehiclePoller'

const pos = (tripId: string) => ({ id: tripId, tripId, lat: 52, lon: 21, sideNumber: '1', bearing: null, timestamp: new Date().toISOString() })

function harness(fetchFeed: () => Promise<{ positions: ReturnType<typeof pos>[]; droppedPositions: number; feedTime: string | null }>) {
  const timers: (() => void)[] = []
  const poller = createVehiclePoller({
    fetchFeed,
    pollMs: 1000,
    now: () => 1_000_000,
    setTimer: (fn) => { timers.push(fn); return timers.length as unknown as ReturnType<typeof setTimeout> },
    clearTimer: () => {},
  })
  return { poller, tick: () => timers.splice(0).forEach((fn) => fn()) }
}

describe('createVehiclePoller', () => {
  it('goes ready after the first successful fetch', async () => {
    const { poller } = harness(async () => ({ positions: [pos('A')], droppedPositions: 0, feedTime: 't' }))
    poller.ensureRunning()
    await vi.waitFor(() => expect(poller.getView().state).toBe('ready'))
    expect(poller.getPositions()).toHaveLength(1)
  })

  it('keeps last-known positions on a failed fetch', async () => {
    let ok = true
    const { poller, tick } = harness(async () => {
      if (!ok) throw new Error('boom')
      return { positions: [pos('A')], droppedPositions: 0, feedTime: 't' }
    })
    poller.ensureRunning()
    await vi.waitFor(() => expect(poller.getView().state).toBe('ready'))
    ok = false
    tick()
    await vi.waitFor(() => expect(poller.getView().state).toBe('failed'))
    expect(poller.getPositions()).toHaveLength(1) // unchanged
  })

  it('stop() clears positions and returns to idle', async () => {
    const { poller } = harness(async () => ({ positions: [pos('A')], droppedPositions: 0, feedTime: 't' }))
    poller.ensureRunning()
    await vi.waitFor(() => expect(poller.getView().state).toBe('ready'))
    poller.stop()
    expect(poller.getView().state).toBe('idle')
    expect(poller.getPositions()).toEqual([])
  })

  it('ensureRunning() twice does not double the timer', () => {
    let starts = 0
    const { poller } = harness(async () => { starts += 1; return { positions: [], droppedPositions: 0, feedTime: null } })
    poller.ensureRunning()
    poller.ensureRunning()
    expect(starts).toBe(1)
  })
})
