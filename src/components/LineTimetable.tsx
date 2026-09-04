import { Fragment } from 'react'
import type { LineDepartureBlock } from '@/lib/gtfs/query'
import type { ServiceCategory } from '@/lib/gtfs/schema'

const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  // WTP ma osobny rozkład piątkowy (`PtS`), więc dzień roboczy to pon–czw.
  weekday: 'Poniedziałek – Czwartek',
  friday: 'Piątek',
  saturday: 'Soboty',
  sunday: 'Niedziele i święta',
  other: 'Inne dni',
}

type Props = {
  /** Odjazdy z przystanku startowego, per kategoria dnia. */
  blocks: LineDepartureBlock[]
  /** Sekundy przejazdu do wyświetlanego przystanku — dodawane do godzin. */
  offsetSec: number
  /** Wybrany kurs (godzina z przystanku startowego) — podświetlony. `null` = brak. */
  selectedBaseSec: number | null
  onSelect: (baseSec: number | null) => void
}

const twoDigit = (n: number) => String(n).padStart(2, '0')

/**
 * Tabliczka rozkładowa linii — kolumny per kategoria dnia (soboty/niedziele
 * OBOK dni roboczych, nie pod), wiersze per godzina. Klik w minutę wybiera kurs
 * — strona linii podświetla wtedy jego godzinę na każdym przystanku trasy.
 */
export function LineTimetable({ blocks, offsetSec, selectedBaseSec, onSelect }: Props) {
  if (blocks.length === 0) {
    return <p className="mt-3 text-sm text-text-secondary">Brak odjazdów w rozkładzie okna.</p>
  }

  const hours = [
    ...new Set(blocks.flatMap((block) => block.times.map((t) => Math.floor((t + offsetSec) / 3600)))),
  ].sort((a, b) => a - b)

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--surface-border)' }}>
            {blocks.map((block) => (
              <Fragment key={block.category}>
                <th className="w-10 px-2 py-2 text-right text-xs font-semibold text-text-muted">godz.</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-text-secondary">
                  {CATEGORY_LABEL[block.category]}
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour} className="border-b align-baseline" style={{ borderColor: 'var(--surface-border)' }}>
              {blocks.map((block) => {
                const cells = block.times
                  .map((base) => ({ base, disp: base + offsetSec }))
                  .filter((cell) => Math.floor(cell.disp / 3600) === hour)
                  .sort((a, b) => a.disp - b.disp)
                return (
                  <Fragment key={block.category}>
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
                              {block.frequencyBased && <span className="text-text-muted">~</span>}
                            </button>
                          )
                        })}
                      </span>
                    </td>
                  </Fragment>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
