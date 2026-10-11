import type { Direction } from './FullBoard'

/** Nazwy stacji z wierszy tablicy, każda raz, alfabetycznie po polsku (pusta nazwa pominięta — `''` znaczy „wszystkie”); wybrana zostaje, nawet gdy żaden wiersz jej nie ma (link z `?direction=`). */
export function headsignOptions(rows: readonly { headsign: string | null }[], selected: string | null): string[] {
  const names = new Set(rows.flatMap((row) => (row.headsign ? [row.headsign] : [])))
  if (selected !== null) names.add(selected)
  return [...names].sort((a, b) => a.localeCompare(b, 'pl'))
}

/**
 * Telefon: jeden selektor kierunku (w sekcji tablicy, tuż pod zakładkami) zamiast rzędu chipów — opcje liczone z wierszy, które tablica już ma
 * (0 zapytań PKP, AGENTS.md #3). Na przyjazdach `headsign` to stacja początkowa, stąd „Skąd”.
 */
export function DirectionSelect({
  direction,
  rows,
  value,
  onChange,
}: {
  direction: Direction
  rows: readonly { headsign: string | null }[]
  value: string | null
  onChange: (value: string | null) => void
}) {
  const arrivals = direction === 'arrivals'
  return (
    <select
      aria-label={arrivals ? 'Skąd' : 'Kierunek'}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      className="min-h-11 w-full rounded-xl border border-surface-border bg-surface-strong px-3 text-base font-medium text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
    >
      <option value="">{arrivals ? 'Wszystkie stacje początkowe' : 'Wszystkie kierunki'}</option>
      {headsignOptions(rows, value).map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  )
}
