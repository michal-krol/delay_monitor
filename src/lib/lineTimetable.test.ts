import { describe, expect, it } from 'vitest'
import {
  activeTimetableDay,
  buildTimetableColumns,
  dayOffsetAria,
  dayOffsetLabel,
  groupByHour,
  timetableCellLabel,
} from './lineTimetable'
import type { LineDepartureBlock } from '@/lib/gtfs/query'

const H = 3600
const block = (category: LineDepartureBlock['category'], times: number[], frequencyBased = false): LineDepartureBlock => ({
  category,
  times,
  frequencyBased,
})

describe('buildTimetableColumns', () => {
  it('always lists the three weekly categories, in order, even when empty', () => {
    const columns = buildTimetableColumns([])
    expect(columns.map((c) => [c.day, c.label, c.times])).toEqual([
      ['weekday', 'Dni robocze', []],
      ['saturday', 'Soboty', []],
      ['sunday', 'Niedziele i święta', []],
    ])
  })

  it('merges friday into weekday, each time once and sorted', () => {
    const [weekday] = buildTimetableColumns([block('weekday', [7 * H, 6 * H]), block('friday', [7 * H, 23 * H])])
    expect(weekday.times).toEqual([6 * H, 7 * H, 23 * H])
  })

  it('flags a weekday column whose friday timetable differs — and only then', () => {
    const differs = buildTimetableColumns([block('weekday', [6 * H]), block('friday', [6 * H, 23 * H])])
    expect(differs[0].fridayDiffers).toBe(true)
    const same = buildTimetableColumns([block('weekday', [6 * H, 7 * H]), block('friday', [7 * H, 6 * H])])
    expect(same[0].fridayDiffers).toBe(false)
    const noFriday = buildTimetableColumns([block('weekday', [6 * H])])
    expect(noFriday[0].fridayDiffers).toBe(false)
    const onlyFriday = buildTimetableColumns([block('friday', [6 * H])])
    expect(onlyFriday[0].fridayDiffers).toBe(false)
  })

  it('adds „Inne dni” only when the other category has departures — no false tab', () => {
    expect(buildTimetableColumns([block('other', [])]).map((c) => c.day)).toEqual(['weekday', 'saturday', 'sunday'])
    expect(buildTimetableColumns([block('other', [9 * H])]).map((c) => c.day)).toEqual(['weekday', 'saturday', 'sunday', 'other'])
  })

  it('marks a column frequency-based when any merged block is', () => {
    const columns = buildTimetableColumns([block('weekday', [6 * H]), block('friday', [7 * H], true), block('sunday', [8 * H])])
    expect(columns.map((c) => c.frequencyBased)).toEqual([true, false, false])
  })
})

describe('activeTimetableDay', () => {
  const columns = buildTimetableColumns([block('weekday', [6 * H])])
  it('keeps a day that has a column', () => {
    expect(activeTimetableDay(columns, 'sunday')).toBe('sunday')
  })
  it('falls back to weekday for „other” when the line has no such category', () => {
    expect(activeTimetableDay(columns, 'other')).toBe('weekday')
  })
})

describe('groupByHour', () => {
  it('keeps after-midnight departures after the evening ones, on their own hour rows (no modulo-24 sort)', () => {
    const rows = groupByHour([23 * H + 50 * 60, 24 * H + 10 * 60, 25 * H, 6 * H], 0)
    expect(rows.map((r) => r.hour)).toEqual([6, 23, 24, 25])
    expect(rows[2].cells).toEqual([{ base: 24 * H + 600, disp: 24 * H + 600, minute: 10 }])
  })

  it('shifts the displayed time by the stop offset but keeps baseSec as the key', () => {
    const rows = groupByHour([6 * H], 480)
    expect(rows).toEqual([{ hour: 6, cells: [{ base: 6 * H, disp: 6 * H + 480, minute: 8 }] }])
  })

  it('pushes a late departure past midnight when the offset crosses 24:00', () => {
    const rows = groupByHour([23 * H + 50 * 60], 900)
    expect(rows).toEqual([{ hour: 24, cells: [{ base: 23 * H + 3000, disp: 24 * H + 300, minute: 5 }] }])
  })

  it('groups minutes of one hour in ascending order', () => {
    const [row] = groupByHour([6 * H + 40 * 60, 6 * H, 6 * H + 20 * 60], 0)
    expect(row.cells.map((c) => c.minute)).toEqual([0, 20, 40])
  })

  it('returns no rows for no times', () => {
    expect(groupByHour([], 0)).toEqual([])
  })
})

describe('day offset labels', () => {
  it('is 0 inside the service day and counts whole days after it', () => {
    expect(dayOffsetLabel(0)).toBeNull()
    expect(dayOffsetLabel(1)).toBe('+1 dzień')
    expect(dayOffsetLabel(2)).toBe('+2 dni')
    expect(dayOffsetAria(0)).toBeNull()
    expect(dayOffsetAria(1)).toBe('następny dzień')
    expect(dayOffsetAria(2)).toBe('+2 dni')
  })
})

describe('timetableCellLabel', () => {
  it('names the full clock time, the category, and the next day', () => {
    expect(timetableCellLabel(6 * H + 480, 'Dni robocze', false)).toBe('06:08, Dni robocze')
    expect(timetableCellLabel(24 * H + 600, 'Soboty', false)).toBe('00:10, Soboty, następny dzień')
  })
  it('says the time is approximate for a frequency-based timetable, keeping the visible „~” in the name (WCAG 2.5.3)', () => {
    expect(timetableCellLabel(6 * H, 'Dni robocze', true)).toBe('06:00~, Dni robocze, orientacyjnie')
  })
})
