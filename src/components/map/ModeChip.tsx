import type { GtfsMode } from '@/lib/gtfs/types'
import { MODE_ICON, lineColor } from '../transitMode'
import { ICON_SIZE } from '../icons'

/** Rodzaj środka na mapie: kwadrat 20 px w kolorze rodzaju (paleta z `transitMode`) z ikoną 13 px. Jeden wariant dla kart, paneli i filtrów. */
export function ModeChip({ mode }: { mode: GtfsMode }) {
  const Icon = MODE_ICON[mode]
  const { bg, fg } = lineColor(mode, 'regular')
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md" style={{ background: bg, color: fg }} aria-hidden="true">
      <Icon size={ICON_SIZE.chip} />
    </span>
  )
}
