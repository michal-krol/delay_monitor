import type { CityStats } from '@/lib/gtfs/query'
import { LayersIcon, ListIcon, StopIcon, TrainIcon, ICON_SIZE } from './icons'

type Props = {
  stats: CityStats | null
  loading: boolean
  /** `null` = /api/cities jeszcze się wczytuje, zawiodło, albo `railStationsUnknown` (AGENTS.md #7). */
  railStationCount: number | null
}

function Tile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: string
  label: string
}) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-border text-text-secondary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-xl font-extrabold tracking-tight text-foreground tabular-nums">{value}</span>
        <span className="block text-xs text-text-secondary">{label}</span>
      </span>
    </div>
  )
}

/** `null` renderuje się jako „—", nigdy jako `0` (AGENTS.md #7). */
const num = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : value.toLocaleString('pl-PL')

/**
 * Pasek kafelków pod nagłówkiem ekranu miasta — wizualne podsumowanie zamiast
 * linijki tekstu. Fakty rozkładowe, nie „na czas".
 */
export function CityStatTiles({ stats, loading, railStationCount }: Props) {
  const modes = loading ? null : (stats?.modeCount ?? null)
  const trips = loading ? null : (stats?.tripsToday ?? null)
  const groups = loading ? null : (stats?.stopGroupCount ?? null)

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile icon={<StopIcon size={ICON_SIZE.tile} />} value={num(groups)} label="przystanki miejskie" />
      <Tile icon={<TrainIcon size={ICON_SIZE.tile} />} value={num(railStationCount)} label="stacje kolejowe" />
      <Tile icon={<LayersIcon size={ICON_SIZE.tile} />} value={num(modes)} label="środki transportu" />
      <Tile icon={<ListIcon size={ICON_SIZE.tile} />} value={num(trips)} label="połączenia dziś" />
    </div>
  )
}
