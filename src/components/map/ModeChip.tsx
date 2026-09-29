import type { GtfsMode } from '@/lib/gtfs/types'
import { MODE_ICON } from '../transitMode'
import { MODE_COLOR } from './mapData'

/** Rodzaj środka na mapie: kwadrat 20 px w `MODE_COLOR` z ikoną 13 px. Jeden wariant dla kart, paneli i filtrów. */
export function ModeChip({ mode }: { mode: GtfsMode }) {
  const Icon = MODE_ICON[mode]
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-white" style={{ background: MODE_COLOR[mode] }} aria-hidden="true">
      <Icon size={13} />
    </span>
  )
}
