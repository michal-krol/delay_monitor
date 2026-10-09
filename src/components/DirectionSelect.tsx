import type { Direction } from './FullBoard'

/** Nazwy stacji z wierszy tablicy, każda raz, alfabetycznie po polsku; wybrana zostaje, nawet gdy żaden wiersz jej nie ma (link z `?direction=`). */
export function headsignOptions(rows: readonly { headsign: string | null }[], selected: string | null): string[] {
  const names = new Set(rows.flatMap((row) => (row.headsign === null ? [] : [row.headsign])))
  if (selected !== null) names.add(selected)
  return [...names].sort((a, b) => a.localeCompare(b, 'pl'))
}

/**
 * Telefon: jeden selektor kierunku zamiast rzędu chipów — opcje liczone z wierszy, które tablica już ma
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
      className="glass min-h-11 w-full rounded-2xl px-3 text-base font-medium text-foreground outline-none focus:ring-2 focus:ring-indigo-500"
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
