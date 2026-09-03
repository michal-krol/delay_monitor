/** Minimum, którego tabliczka potrzebuje — `TimetableEntry` je spełnia. */
export type TimetableRow = { departureSec: number; headsign?: string | null; frequencyBased?: boolean }

type Props = {
  entries: TimetableRow[]
  loading?: boolean
  /** Komunikat, gdy linia nie kursuje w tej dobie z tego przystanku. */
  emptyMessage?: string
}

type Row = { hour: string; minutes: { value: string; headsign: string | null; frequencyBased: boolean }[] }

/** `sec` może przekroczyć 86400 (kurs po północy) — godzina zwija się do doby. */
function groupByHour(entries: TimetableRow[]): Row[] {
  const rows = new Map<number, Row['minutes']>()
  for (const entry of entries) {
    const hour = Math.floor(entry.departureSec / 3600)
    const minute = Math.floor((entry.departureSec % 3600) / 60)
    const list = rows.get(hour) ?? []
    list.push({
      value: String(minute).padStart(2, '0'),
      headsign: entry.headsign ?? null,
      frequencyBased: entry.frequencyBased ?? false,
    })
    rows.set(hour, list)
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, minutes]) => ({ hour: String(hour % 24).padStart(2, '0'), minutes }))
}

/**
 * Klasyczna tabliczka dobowa: wiersz na godzinę, minuty odjazdów obok.
 * „Rozkład", nigdy „na czas" — komunikacja miejska nie ma realizacji.
 */
export function DayTimetable({ entries, loading = false, emptyMessage = 'Linia nie kursuje z tego przystanku w tej dobie.' }: Props) {
  if (loading) {
    return (
      <div className="mt-3 space-y-2" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-6 animate-pulse rounded bg-black/5 dark:bg-white/5" />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return <p className="mt-3 text-sm text-text-secondary">{emptyMessage}</p>
  }

  return (
    <table className="mt-3 w-full border-collapse text-sm">
      <tbody>
        {groupByHour(entries).map((row) => (
          <tr key={row.hour} className="border-t align-baseline" style={{ borderColor: 'var(--surface-border)' }}>
            <th scope="row" className="w-12 py-1.5 pr-3 text-right font-bold tabular-nums text-foreground">
              {row.hour}
            </th>
            <td className="py-1.5">
              <span className="flex flex-wrap gap-x-2 gap-y-1">
                {row.minutes.map((minute, index) => (
                  <span
                    key={index}
                    title={minute.headsign ?? undefined}
                    className="tabular-nums text-text-secondary"
                  >
                    {minute.value}
                    {minute.frequencyBased && <span className="text-text-muted">~</span>}
                  </span>
                ))}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
