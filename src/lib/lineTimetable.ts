import { formatSecondsOfDay } from '@/lib/format'
import type { LineDepartureBlock } from '@/lib/gtfs/query'
import type { LineDay } from '@/lib/lineViewState'

/**
 * Czysta transformacja bloków rozkładu linii (`LineDepartureBlock[]`) w kolumny dni i wiersze godzin. Sekundy
 * są sekundami doby operacyjnej: wartość ≥ 86400 to kurs po północy NASTĘPNEJ doby — zachowuje swoje miejsce
 * po wieczornych kursach (godzina 24, 25…), nigdy nie jest sortowana przez modulo 24.
 */

export const DAY_LABEL: Record<LineDay, string> = {
  weekday: 'Dni robocze',
  saturday: 'Soboty',
  sunday: 'Niedziele i święta',
  other: 'Inne dni',
}

/** Kategorie tygodniowe — zawsze widoczne, nawet puste; „Inne dni” dochodzi tylko z odjazdami. */
const WEEKLY: readonly LineDay[] = ['weekday', 'saturday', 'sunday']

export type TimetableColumn = {
  day: LineDay
  label: string
  /** Sekundy odjazdu z przystanku startowego (klucz kursu), rosnąco, bez duplikatów. */
  times: number[]
  frequencyBased: boolean
  /** Tylko `weekday`: osobny rozkład piątkowy różni się od pn–czw (kolumna jest sumą obu). */
  fridayDiffers: boolean
}

const sortedUnique = (...lists: number[][]): number[] => [...new Set(lists.flat())].sort((a, b) => a - b)

export function buildTimetableColumns(blocks: LineDepartureBlock[]): TimetableColumn[] {
  const byCategory = new Map(blocks.map((b) => [b.category, b]))
  const columns: TimetableColumn[] = WEEKLY.map((day) => {
    const own = byCategory.get(day)
    const friday = day === 'weekday' ? byCategory.get('friday') : undefined
    const merged = [own, friday].filter((b): b is LineDepartureBlock => b !== undefined)
    return {
      day,
      label: DAY_LABEL[day],
      times: sortedUnique(...merged.map((b) => b.times)),
      frequencyBased: merged.some((b) => b.frequencyBased),
      fridayDiffers:
        own !== undefined && friday !== undefined && sortedUnique(own.times).join() !== sortedUnique(friday.times).join(),
    }
  })
  const other = byCategory.get('other')
  if (other !== undefined && other.times.length > 0) {
    columns.push({
      day: 'other',
      label: DAY_LABEL.other,
      times: sortedUnique(other.times),
      frequencyBased: other.frequencyBased,
      fridayDiffers: false,
    })
  }
  return columns
}

/** Kategoria bez kolumny (np. `day=other` w linku do linii bez „Innych dni”) wraca do dni roboczych. */
export function activeTimetableDay(columns: TimetableColumn[], day: LineDay): LineDay {
  return columns.some((c) => c.day === day) ? day : 'weekday'
}

export type TimetableCell = { base: number; disp: number; minute: number }
export type TimetableHourRow = { hour: number; cells: TimetableCell[] }

/** Godzina wiersza = `floor(disp / 3600)` — 24, 25… dla kursów po północy; `base` zostaje kluczem kursu. */
export function groupByHour(times: number[], offsetSec: number): TimetableHourRow[] {
  const rows = new Map<number, TimetableCell[]>()
  for (const base of times) {
    const disp = base + offsetSec
    const hour = Math.floor(disp / 3600)
    const cells = rows.get(hour) ?? []
    cells.push({ base, disp, minute: Math.floor((disp % 3600) / 60) })
    rows.set(hour, cells)
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, cells]) => ({ hour, cells: cells.sort((a, b) => a.disp - b.disp) }))
}

/** Ile pełnych dób po dobie operacyjnej wypada godzina (0 = ta sama doba). */
export const dayOffsetOf = (hour: number): number => Math.floor(hour / 24)

export function dayOffsetLabel(offsetDays: number): string | null {
  if (offsetDays <= 0) return null
  return offsetDays === 1 ? '+1 dzień' : `+${offsetDays} dni`
}

export function dayOffsetAria(offsetDays: number): string | null {
  if (offsetDays <= 0) return null
  return offsetDays === 1 ? 'następny dzień' : `+${offsetDays} dni`
}

/**
 * Nazwa przycisku minuty: pełna godzina, kategoria, ewentualnie doba po północy i „orientacyjnie” (rozkład z częstotliwości).
 * Widoczny tekst to minuty z „~” przy rozkładzie z częstotliwości — „~” zostaje też w nazwie (WCAG 2.5.3).
 */
export function timetableCellLabel(dispSec: number, dayLabel: string, frequencyBased: boolean): string {
  const parts = [formatSecondsOfDay(dispSec) + (frequencyBased ? '~' : ''), dayLabel]
  const next = dayOffsetAria(dayOffsetOf(Math.floor(dispSec / 3600)))
  if (next !== null) parts.push(next)
  if (frequencyBased) parts.push('orientacyjnie')
  return parts.join(', ')
}
