import { afterEach, describe, expect, it, vi } from 'vitest'
import { logEvent } from './log'

describe('logEvent', () => {
  afterEach(() => vi.restoreAllMocks())

  it('writes one JSON line with level, event and context fields', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logEvent('error', 'poller.operations_page_failed', { page: 3 })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({
      level: 'error',
      event: 'poller.operations_page_failed',
      page: 3,
    })
  })

  it('serializes an Error as name and message, not an empty object', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logEvent('error', 'train.fetch_failed', {}, new TypeError('boom'))
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ error: 'TypeError: boom' })
  })

  it('stringifies a non-Error throwable', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logEvent('error', 'x', {}, 'plain string')
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ error: 'plain string' })
  })

  it('routes warn level to console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    logEvent('warn', 'poller.operations_incomplete', { reason: 'page_limit' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })
})
