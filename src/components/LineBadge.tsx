import Link from 'next/link'
import type { GtfsMode, LineKind } from '@/lib/gtfs/types'
import { MODE_ICON, darkRingClass, lineColor } from './transitMode'

type Props = {
  line: string
  mode: GtfsMode
  /** Rodzaj linii (nocna, strefowa…) — razem z `mode` wybiera kolor. Brak danych = `lineKindFrom(shortName, undefined)`, nigdy cichy `'regular'`. */
  kind: LineKind
  size?: 'sm' | 'md'
  /** Gdy podane — plakietka jest linkiem do szczegółów linii. */
  href?: string
}

/**
 * Plakietka linii w kolorze KATEGORII (`lineColor` w `transitMode.tsx`), nie `route_color` z feedu —
 * kolor z cudzego serwera nie trafia do CSS w ogóle. Czerń (nocna) i granat (lokalna) giną na ciemnym
 * tle, więc dostają jasny pierścień w trybie ciemnym (`darkRingClass`).
 */
export function LineBadge({ line, mode, kind, size = 'md', href }: Props) {
  const Icon = MODE_ICON[mode]
  const { bg, fg } = lineColor(mode, kind)
  const ring = darkRingClass(kind)

  const badge = (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md font-semibold tabular-nums ${ring} ${
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm'
      }`}
      style={{ background: bg, color: fg }}
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
