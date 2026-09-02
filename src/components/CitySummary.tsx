import type { GtfsMode } from '@/lib/gtfs/types'
import { pluralPl } from '@/lib/plural'

export type CitySummaryData = {
  railStations: { id: string }[]
  schedule: { state: string; ageMs: number | null; feedVersion: string | null; serviceDates: [string, string, string] | null }
  lineCounts: Record<GtfsMode, number> | null
  stopGroupCount: number | null
}

function formatAge(ageMs: number | null): string {
  if (ageMs === null) return '—'
  const minutes = Math.floor(ageMs / 60000)
  if (minutes < 1) return 'przed chwilą'
  if (minutes < 90) return `${minutes} min temu`
  return `${Math.round(minutes / 60)} h temu`
}

/**
 * Pasek informacji pod pickerem miasta. `null` renderuje się jako „—", nigdy
 * jako `0` (AGENTS.md #3). Rozkład miejski, nie „na czas".
 */
export function CitySummary({ data }: { data: CitySummaryData }) {
  const parts: string[] = []

  parts.push(
    `${data.railStations.length} ${pluralPl(data.railStations.length, 'stacja kolejowa', 'stacje kolejowe', 'stacji kolejowych')}`
  )

  if (data.stopGroupCount !== null) {
    parts.push(
      `${data.stopGroupCount} ${pluralPl(data.stopGroupCount, 'zespół przystankowy', 'zespoły przystankowe', 'zespołów przystankowych')}`
    )
  }

  if (data.lineCounts !== null) {
    const total = Object.values(data.lineCounts).reduce((sum, count) => sum + count, 0)
    const breakdown = (['metro', 'tram', 'bus'] as const)
      .filter((mode) => data.lineCounts![mode] > 0)
      .map((mode) => `${data.lineCounts![mode]} ${{ metro: 'metro', tram: 'tram', bus: 'autobus' }[mode]}`)
      .join(', ')
    parts.push(`${total} ${pluralPl(total, 'linia', 'linie', 'linii')}${breakdown ? ` (${breakdown})` : ''}`)
  }

  const scheduleLabel =
    data.schedule.state === 'ready'
      ? `rozkład ${formatAge(data.schedule.ageMs)}`
      : data.schedule.state === 'loading' || data.schedule.state === 'idle'
        ? 'rozkład się wczytuje'
        : 'rozkład niedostępny'

  return (
    <p className="text-xs text-text-secondary">
      {scheduleLabel}
      {parts.length > 0 && <> · {parts.join(' · ')}</>}
    </p>
  )
}
