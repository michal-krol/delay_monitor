import type { CSSProperties } from 'react'
import Link from 'next/link'
import { contrastText } from '@/lib/gtfs/schema'
import type { GtfsMode } from '@/lib/gtfs/types'
import { BusIcon, MetroIcon, TrainIcon, TramIcon } from './icons'

type Props = {
  line: string
  /** `#RRGGBB` zwalidowany w `schema.ts`, albo `null`. NIGDY surowy string z feedu. */
  color: string | null
  mode: GtfsMode
  size?: 'sm' | 'md'
  /** Gdy podane — plakietka jest linkiem do szczegółów linii. */
  href?: string
}

const MODE_ICON = { metro: MetroIcon, tram: TramIcon, bus: BusIcon, rail: TrainIcon, other: BusIcon } as const

/**
 * Plakietka linii w kolorze z feedu. Kolor tekstu liczymy sami (luminancja
 * WCAG) i IGNORUJEMY `route_text_color` — mniej kodu niż walidacja drugiego
 * niezaufanego koloru i naprawia wiersz `route_color === route_text_color`.
 * `style={{ background }}` z wartością zwalidowaną; nigdy nazwa klasy z koloru.
 */
/** `#rrggbb` po walidacji w `schema.ts`. Druga warstwa: cokolwiek innego → brak koloru. */
const SAFE_HEX = /^#[0-9a-fA-F]{6}$/

export function LineBadge({ line, color, mode, size = 'md', href }: Props) {
  const Icon = MODE_ICON[mode]
  const safe = color !== null && SAFE_HEX.test(color) ? color : null
  const styled: CSSProperties =
    safe === null
      ? { background: 'var(--surface-border)', color: 'var(--foreground)' }
      : { background: safe, color: contrastText(safe) }

  const badge = (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md font-semibold tabular-nums ${
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm'
      }`}
      style={styled}
    >
      <Icon size={size === 'sm' ? 12 : 14} />
      {line}
    </span>
  )

  if (href === undefined) return badge
  return (
    <Link
      href={href}
      aria-label={`Linia ${line}`}
      className="inline-flex rounded-md outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      {badge}
    </Link>
  )
}
