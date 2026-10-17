'use client'

import { startTransition, useId, useState } from 'react'
import {
  activeTimetableDay,
  buildTimetableColumns,
  dayOffsetLabel,
  dayOffsetOf,
  groupByHour,
  timetableCellLabel,
} from '@/lib/lineTimetable'
import type { LineDepartureBlock } from '@/lib/gtfs/query'
import type { LineDay } from '@/lib/lineViewState'
import { TabCrossfade } from '@/components/TabCrossfade'
import { LG_UP, useMediaQuery } from '@/hooks/useMediaQuery'

type Props = {
  /** Odjazdy z przystanku startowego, per kategoria dnia. */
  blocks: LineDepartureBlock[]
  /** Sekundy przejazdu do wyświetlanego przystanku — dodawane do godzin. `null` = nie ma przystanku, dla którego można je podać (nie zgadujemy 0). */
  offsetSec: number | null
  /** Wybrany kurs (godzina z przystanku startowego) — podświetlony. `null` = brak. */
  selectedBaseSec: number | null
  onSelect: (baseSec: number | null) => void
  /** Kategoria dnia widoczna poniżej `lg` (domyślnie dni robocze). Bez niej komponent trzyma wybór sam. */
  day?: LineDay
  onDayChange?: (day: LineDay) => void
}

const twoDigit = (n: number) => String(n).padStart(2, '0')

/**
 * Tabliczka rozkładowa linii. Poniżej `lg` jedna kategoria dnia naraz (chipy „Dni robocze / Soboty / …”, bez
 * przewijania w bok); od `lg` wszystkie kolumny obok siebie — to ten sam DOM, nieaktywne kolumny chowa CSS.
 * Wiersz = godzina (24, 25… dla kursów po północy, z „+1 dzień”), minuty to przyciski ≥ 44 px na telefonie.
 * Klik w minutę wybiera kurs — strona linii podświetla wtedy jego godzinę na każdym przystanku trasy.
 */
export function LineTimetable({ blocks, offsetSec, selectedBaseSec, onSelect, day, onDayChange }: Props) {
  const headingPrefix = useId()
  const lgUp = useMediaQuery(LG_UP, true)
  const [localDay, setLocalDay] = useState<LineDay>('weekday')
  const columns = buildTimetableColumns(blocks)
  const activeDay = activeTimetableDay(columns, day ?? localDay)

  // `startTransition`: tylko w nim zmiana stanu odtwarza crossfade (`ui-motion.md`); URL zapisuje `onDayChange` synchronicznie.
  function changeDay(next: LineDay): void {
    startTransition(() => {
      if (day === undefined) setLocalDay(next)
      onDayChange?.(next)
    })
  }

  if (columns.every((c) => c.times.length === 0)) {
    return <p className="mt-3 text-sm text-text-secondary">Brak kursów w rozkładzie.</p>
  }

  return (
    <div className="mt-3">
      {/* Bez przystanku nie ma co przełączać: chipy zmieniałyby tylko adres. */}
      {offsetSec !== null && (
        <div role="group" aria-label="Kategoria dnia" className="mb-3 flex flex-wrap gap-2 lg:hidden">
          {columns.map((c) => (
            <button key={c.day} type="button" aria-pressed={c.day === activeDay} onClick={() => changeDay(c.day)} className="chip-filter">
              {c.label}
            </button>
          ))}
        </div>
      )}

      {offsetSec === null ? (
        <p className="py-2 text-sm text-text-secondary">Brak przystanku, dla którego można pokazać godziny.</p>
      ) : (
        // Poniżej `lg` zmiana kategorii podmienia siatkę (klucz = dzień): stara i nowa treść to para wyjście/wejście. Od `lg`
        // wszystkie kolumny stoją naraz, a klik w minutę innej kolumny nie może jej odmontować (fokus). Przekroczenie progu `lg` (też pierwszy render po hydracji na telefonie) odmontowuje siatkę raz — wybór kursu żyje w rodzicu, więc nic się nie gubi (najwyżej fokus na minucie).
        <TabCrossfade id={lgUp ? 'all' : activeDay} name="line-day">
          <div className={`grid gap-4 ${columns.length > 3 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            {columns.map((c) => {
              const active = c.day === activeDay
              const headingId = `${headingPrefix}-${c.day}`
              const rows = groupByHour(c.times, offsetSec)
              return (
                <div key={c.day} role="group" aria-labelledby={headingId} className={`min-w-0 ${active ? '' : 'max-lg:hidden'}`}>
                  <h3 id={headingId} className="mb-1 border-b border-surface-border pb-1.5 text-xs font-semibold text-text-secondary max-lg:sr-only">
                    {c.label}
                  </h3>
                  {c.fridayDiffers && (
                    <p className="mb-1 text-[13px] text-text-secondary">Piątek ma osobny rozkład — pokazano godziny pn–czw i piątku.</p>
                  )}
                  {c.frequencyBased && (
                    <p className="mb-1 text-[13px] text-text-secondary">„~” — godziny orientacyjne, kursy jeżdżą według częstotliwości.</p>
                  )}
                  {rows.length === 0 ? (
                    <p className="py-2 text-sm text-text-secondary">Brak kursów w tej kategorii dnia</p>
                  ) : (
                    <ul>
                      {rows.map(({ hour, cells }) => {
                        const nextDay = dayOffsetLabel(dayOffsetOf(hour))
                        return (
                          <li key={hour} className="flex items-start gap-2 border-b border-surface-border py-1">
                            <span aria-hidden="true" className="w-14 shrink-0 pt-1.5 text-right tabular-nums max-lg:pt-3">
                              <span className="font-bold text-foreground">{twoDigit(hour % 24)}</span>
                              {nextDay !== null && <span className="block text-[13px] font-medium leading-tight text-text-secondary">{nextDay}</span>}
                            </span>
                            <div className="flex min-w-0 flex-wrap gap-1">
                              {cells.map((cell) => {
                                const on = active && cell.base === selectedBaseSec
                                return (
                                  <button
                                    key={cell.base}
                                    type="button"
                                    aria-pressed={on}
                                    aria-label={timetableCellLabel(cell.disp, c.label, c.frequencyBased)}
                                    onClick={() => {
                                      if (!active) changeDay(c.day)
                                      onSelect(on ? null : cell.base)
                                    }}
                                    className={`inline-flex min-h-6 min-w-6 items-center justify-center rounded px-1 tabular-nums transition max-lg:min-h-11 max-lg:min-w-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text ${
                                      on ? 'bg-primary font-bold text-primary-fg' : 'text-text-secondary hover:text-foreground'
                                    }`}
                                  >
                                    {twoDigit(cell.minute)}
                                    {c.frequencyBased && <span aria-hidden="true">~</span>}
                                  </button>
                                )
                              })}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </TabCrossfade>
      )}
    </div>
  )
}
