import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Task 1 — `register()` musi kończyć się natychmiast (nigdy nie awaituje
// ładowania rozkładu) i działać wyłącznie na runtime Node (nie Edge).
describe('instrumentation register()', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('@/lib/gtfs/instance')
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('warms up GTFS schedules on the nodejs runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const warmUpGtfsPollers = vi.fn()
    vi.doMock('@/lib/gtfs/instance', () => ({ warmUpGtfsPollers }))

    const { register } = await import('./instrumentation')
    await register()

    expect(warmUpGtfsPollers).toHaveBeenCalledTimes(1)
  })

  it('does nothing on a non-nodejs runtime (edge)', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    const warmUpGtfsPollers = vi.fn()
    vi.doMock('@/lib/gtfs/instance', () => ({ warmUpGtfsPollers }))

    const { register } = await import('./instrumentation')
    await register()

    expect(warmUpGtfsPollers).not.toHaveBeenCalled()
  })
})
