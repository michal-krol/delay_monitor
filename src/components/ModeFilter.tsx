import type { GtfsMode } from '@/lib/gtfs/types'
import { MODE_ICON, MODE_LABEL, MODE_ORDER } from './transitMode'

export type ModeValue = 'all' | GtfsMode

type Props = {
  /** Rodzaje faktycznie obecne w feedzie — chip pojawia się tylko dla nich. */
  available: GtfsMode[]
  value: ModeValue
  onChange: (value: ModeValue) => void
}

/**
 * Rząd chipów rodzaju środka nad przeglądarką linii. Kontrolowany — stan trzyma
 * strona. Pokazujemy „Wszystko" plus po jednym chipie na rodzaj obecny w feedzie.
 */
export function ModeFilter({ available, value, onChange }: Props) {
  const modes = MODE_ORDER.filter((mode) => available.includes(mode))

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtr rodzaju transportu">
      {(['all', ...modes] as ModeValue[]).map((mode) => {
        const active = mode === value
        const Icon = mode === 'all' ? null : MODE_ICON[mode]
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(mode)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
              active ? 'text-white' : 'text-text-secondary hover:bg-black/5 dark:hover:bg-white/10'
            }`}
            style={
              active
                ? { background: 'var(--accent-gradient)', borderColor: 'transparent' }
                : { borderColor: 'var(--surface-border)' }
            }
          >
            {Icon !== null && <Icon size={13} />}
            {mode === 'all' ? 'Wszystko' : MODE_LABEL[mode]}
          </button>
        )
      })}
    </div>
  )
}
