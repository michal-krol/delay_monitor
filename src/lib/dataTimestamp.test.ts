import { describe, expect, it } from 'vitest'
import { formatDataTimestamp } from './dataTimestamp'

describe('data timestamp', () => {
  it('shows the full date and minute in the source timezone, independent of machine timezone', () => {
    expect(formatDataTimestamp('2026-10-20T21:59:42Z')).toBe('20.10.2026, 23:59')
    expect(formatDataTimestamp('2026-10-20T22:00:42Z')).toBe('21.10.2026, 00:00')
    expect(formatDataTimestamp(Date.parse('2026-10-20T22:00:42Z'), 'UTC')).toBe('20.10.2026, 22:00')
  })
})
