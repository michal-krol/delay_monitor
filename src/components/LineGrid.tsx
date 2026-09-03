import Link from 'next/link'
import type { LineListEntry } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'
import { LineBadge } from './LineBadge'
import type { ModeValue } from './ModeFilter'
import { MODE_LABEL, MODE_ORDER } from './transitMode'

type Props = {
  linesByMode: Record<GtfsMode, LineListEntry[]>
  city: string
  filter: ModeValue
}

/**
 * Siatka wszystkich linii miasta, sekcja per rodzaj. Każda plakietka prowadzi
 * na stronę przebiegu linii. Filtr zawęża do jednego rodzaju.
 */
export function LineGrid({ linesByMode, city, filter }: Props) {
  const modes = MODE_ORDER.filter((mode) => (filter === 'all' || filter === mode) && linesByMode[mode].length > 0)

  if (modes.length === 0) {
    return <p className="text-sm text-text-secondary">Feed nie zawiera linii tego rodzaju.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {modes.map((mode) => (
        <section key={mode}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {MODE_LABEL[mode]} · {linesByMode[mode].length}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {linesByMode[mode].map((entry) => (
              <li key={entry.routeId}>
                <Link
                  href={`/miasto/${city}/linia/${encodeURIComponent(entry.routeId)}`}
                  title={entry.longName}
                  aria-label={`Linia ${entry.line} — ${entry.longName}`}
                  className="inline-flex rounded-md outline-none ring-offset-2 transition focus-visible:ring-2 focus-visible:ring-indigo-500 hover:opacity-80"
                >
                  <LineBadge line={entry.line} color={entry.color} mode={entry.mode} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
