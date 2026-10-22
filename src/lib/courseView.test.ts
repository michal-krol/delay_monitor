import { describe, expect, it } from 'vitest'
import { courseHref, departureDateLabel, parseCourseView, safeStopReturnHref, timetableHref } from './courseView'

describe('course navigation', () => {
  it('retains course, service date, repeated stop sequence and source board', () => {
    const href = courseHref('warszawa', '20', { tripId: 'a/b', serviceDate: '2026-09-02', stopId: '100101', stopSequence: 3 })
    const state = parseCourseView(new URL(href, 'http://local').searchParams)!
    expect(state).toEqual({ tripId: 'a/b', serviceDate: '2026-09-02', sequence: 3, stopId: '100101' })
    expect(timetableHref('warszawa', '20', '100101', 1)).toContain('pane=timetable')
    expect(timetableHref('warszawa', '20', '100101', 1)).toContain('dir=1')
  })
  it('ignores malformed course/date/sequence input without throwing', () => {
    expect(parseCourseView(new URLSearchParams('trip=x&date=2026-02-31&seq=3'))).toBeNull()
    expect(parseCourseView(new URLSearchParams('trip=x&date=2026-09-02&seq=-1'))).toBeNull()
  })
  it('labels civil departure date rather than GTFS service day', () => {
    expect(departureDateLabel('2026-09-03T00:05:00+02:00', Date.parse('2026-09-02T23:30:00+02:00'))).toBe('03.09.2026')
    expect(departureDateLabel('2026-09-03T00:05:00+02:00', Date.parse('2026-09-03T00:01:00+02:00'))).toBeNull()
  })
  it('preserves board scope safely and rejects external or another-city return destinations', () => {
    expect(safeStopReturnHref('/city/warszawa/stop/1001?przystanek=100102&line=20&tab=schedule', 'warszawa')).toBe('/city/warszawa/stop/1001?przystanek=100102&line=20&tab=schedule')
    expect(safeStopReturnHref('/city/warszawa?stop=1001&przystanek=100102', 'warszawa')).toBe('/city/warszawa?stop=1001&przystanek=100102')
    expect(safeStopReturnHref('//evil.test/city/warszawa/stop/1001', 'warszawa')).toBeNull()
    expect(safeStopReturnHref('/city/krakow/stop/1001', 'warszawa')).toBeNull()
    expect(safeStopReturnHref('javascript:alert(1)', 'warszawa')).toBeNull()
  })
})
