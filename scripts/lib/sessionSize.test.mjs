import { describe, expect, it } from 'vitest'
import { measureSession, sessionWarning } from './sessionSize.mjs'

const assistant = (id, ctx, extra = {}) =>
  JSON.stringify({
    type: 'assistant',
    requestId: `r${id}`,
    message: {
      id: `m${id}`,
      model: 'claude-sonnet-5-5',
      usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: ctx - 10, output_tokens: 5 },
    },
    ...extra,
  })

describe('measureSession', () => {
  it('counts assistant turns and takes context from the last one', () => {
    const text = [assistant(1, 50_000), JSON.stringify({ type: 'user' }), assistant(2, 120_000)].join('\n')
    expect(measureSession(text)).toEqual({ turns: 2, ctx: 120_000 })
  })

  it('counts a message streamed in several lines once', () => {
    const text = [assistant(1, 50_000), assistant(1, 50_000)].join('\n')
    expect(measureSession(text).turns).toBe(1)
  })

  it('ignores synthetic messages and malformed lines', () => {
    const synthetic = JSON.stringify({ type: 'assistant', message: { id: 's', model: '<synthetic>', usage: { input_tokens: 1 } } })
    expect(measureSession(['not json', '', synthetic].join('\n'))).toEqual({ turns: 0, ctx: 0 })
  })

  it('returns zeros for an empty transcript', () => {
    expect(measureSession('')).toEqual({ turns: 0, ctx: 0 })
  })
})

describe('sessionWarning', () => {
  it('stays quiet below both thresholds', () => {
    expect(sessionWarning({ turns: 150, ctx: 300_000 })).toBeNull()
  })

  it('warns on too many turns', () => {
    expect(sessionWarning({ turns: 151, ctx: 100_000 })).toMatch(/151 turns/)
  })

  it('warns on a large context', () => {
    expect(sessionWarning({ turns: 10, ctx: 301_000 })).toMatch(/301k/)
  })

  it('points at handoff and /clear', () => {
    expect(sessionWarning({ turns: 200, ctx: 400_000 })).toMatch(/handoff.*\/clear/s)
  })
})
