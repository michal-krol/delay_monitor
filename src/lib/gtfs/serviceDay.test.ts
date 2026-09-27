import { describe, expect, it } from 'vitest'
import { todayServiceIndex } from './serviceDay'

describe('todayServiceIndex', () => {
  it('returns the index of today in the service-date window', () => {
    const now = new Date('2026-09-04T10:00:00Z')
    const serviceDates = ['2026-09-03', '2026-09-04', '2026-09-05']
    expect(todayServiceIndex(serviceDates, 'Europe/Warsaw', now)).toBe(1)
  })

  it('day missing from serviceDates returns null', () => {
    const now = new Date('2026-09-04T10:00:00Z')
    const serviceDates = ['2026-09-01', '2026-09-02', '2026-09-03']
    expect(todayServiceIndex(serviceDates, 'Europe/Warsaw', now)).toBeNull()
  })

  it('resolves the day boundary by the target timezone, not the process clock (run under TZ=UTC too)', () => {
    // 22:30 UTC is already past midnight in Warsaw (CEST, UTC+2): the service
    // day is 2026-09-03 even though the instant's UTC calendar date is still
    // 2026-09-02. Same boundary exercised by serviceDateWindow's own tests.
    const now = new Date('2026-09-02T22:30:00Z')
    const serviceDates = ['2026-09-02', '2026-09-03', '2026-09-04']
    expect(todayServiceIndex(serviceDates, 'Europe/Warsaw', now)).toBe(1)
  })
})
