import { Fragment } from 'react'
import type { LineDepartureBlock } from '@/lib/gtfs/query'

/** Stałe kolumny tygodniowe — zawsze widoczne, nawet puste (spec 0b). */
const WEEKLY = [
  { label: 'Dni robocze', from: ['weekday', 'friday'] as const },
  { label: 'Soboty', from: ['saturday'] as const },
  { label: 'Niedziele i święta', from: ['sunday'] as const },
] as const

type Props = {
  /** Odjazdy z przystanku startowego, per kategoria dnia. */
  blocks: LineDepartureBlock[]
  /** Sekundy przejazdu do wyświetlanego przystanku — dodawane do godzin. */
  offsetSec: number
  /** Wybrany kurs (godzina z przystanku startowego) — podświetlony. `null` = brak. */
  selectedBaseSec: number | null
  onSelect: (baseSec: number | null) => void
}

type Column = { label: string; times: number[]; frequencyBased: boolean }

function buildColumns(blocks: LineDepartureBlock[]): Column[] {
  const byCat = new Map(blocks.map((b) => [b.category, b]))
  const columns: Column[] = WEEKLY.map(({ label, from }) => {
    const times = new Set<number>()
    let frequencyBased = false
    for (const cat of from) {
      const b = byCat.get(cat)
      if (b === undefined) continue
      for (const t of b.times) times.add(t)
      if (b.frequencyBased) frequencyBased = true
    }
    return { label, times: [...times].sort((a, b) => a - b), frequencyBased }
  })
  const other = byCat.get('other')
  if (other !== undefined && other.times.length > 0) {
    columns.push({ label: 'Inne dni', times: [...other.times].sort((a, b) => a - b), frequencyBased: other.frequencyBased })
  }
  return columns
}

const twoDigit = (n: number) => String(n).padStart(2, '0')

/**
 * Tabliczka rozkładowa linii — trzy stałe kolumny tygodniowe (soboty/niedziele
 * OBOK dni roboczych, nie pod), wiersze per godzina. Klik w minutę wybiera kurs
 * — strona linii podświetla wtedy jego godzinę na każdym przystanku trasy.
 */
export function LineTimetable({ blocks, offsetSec, selectedBaseSec, onSelect }: Props) {
  const columns = buildColumns(blocks)
  const hours = [
    ...new Set(columns.flatMap((c) => c.times.map((t) => Math.floor((t + offsetSec) / 3600)))),
  ].sort((a, b) => a - b)

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--surface-border)' }}>
            {columns.map((c) => (
              <Fragment key={c.label}>
                <th className="w-10 px-2 py-2 text-right text-xs font-semibold text-text-muted">godz.</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-text-secondary">{c.label}</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.length === 0 ? (
            <tr>
              <td colSpan={columns.length * 2} className="px-2 py-3 text-sm text-text-secondary">
                Brak kursów w rozkładzie.
              </td>
            </tr>
          ) : (
            hours.map((hour) => (
              <tr key={hour} className="border-b align-baseline" style={{ borderColor: 'var(--surface-border)' }}>
                {columns.map((c) => {
                  const cells = c.times
                    .map((base) => ({ base, disp: base + offsetSec }))
                    .filter((cell) => Math.floor(cell.disp / 3600) === hour)
                    .sort((a, b) => a.disp - b.disp)
                  return (
                    <Fragment key={c.label}>
                      <th scope="row" className="px-2 py-1.5 text-right font-bold tabular-nums text-foreground">
                        {twoDigit(hour % 24)}
                      </th>
                      <td className="px-2 py-1.5">
                        <span className="flex flex-wrap gap-x-1.5 gap-y-1">
                          {cells.map((cell) => {
                            const on = cell.base === selectedBaseSec
                            const minute = twoDigit(Math.floor((cell.disp % 3600) / 60))
                            return (
                              <button
                                key={cell.base}
                                type="button"
                                aria-pressed={on}
                                aria-label={`${twoDigit(hour % 24)}:${minute}`}
                                onClick={() => onSelect(on ? null : cell.base)}
                                className={`rounded px-1 tabular-nums transition ${
                                  on ? 'font-bold text-white' : 'text-text-secondary hover:text-foreground'
                                }`}
                                style={on ? { background: 'var(--accent-gradient)' } : undefined}
                              >
                                {minute}
                                {c.frequencyBased && <span className="text-text-muted">~</span>}
                              </button>
                            )
                          })}
                        </span>
                      </td>
                    </Fragment>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
