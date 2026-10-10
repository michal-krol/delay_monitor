import { describe, expect, it } from 'vitest'
import { statusTint } from './realizationColors'

describe('realizationColors', () => {
  it('statusTint dilutes the status token instead of repeating its colour', () => {
    expect(statusTint('delayed', 5)).toBe('color-mix(in srgb, var(--status-delayed-bg) 5%, transparent)')
  })
})
