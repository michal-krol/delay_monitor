'use client'

import { useHeaderDataContext } from './pageHeader'
import { formatDataTimestamp } from '@/lib/dataTimestamp'

export function HeaderData() {
  const sources = useHeaderDataContext()
  if (sources.length === 0) return null
  const valid = sources.map((source) => source.updatedAt === null ? NaN : new Date(source.updatedAt).getTime()).filter(Number.isFinite)
  const oldest = valid.length === 0 ? null : Math.min(...valid)
  const incomplete = sources.some((source) => source.error || source.warning || source.updatedAt === null)
  return (
    <details className="relative min-w-0 text-xs text-text-secondary">
      <summary className="press flex min-h-11 cursor-pointer items-center rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-primary-text">
        Dane {oldest === null ? '— brak aktualizacji' : formatDataTimestamp(oldest)}{incomplete ? ' · część danych nieaktualna' : ''}
      </summary>
      <section aria-label="Aktualność źródeł danych" className="absolute right-0 z-40 mt-1 max-h-[min(70dvh,32rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-surface-border bg-surface-strong p-3 shadow-xl">
        <p className="mb-2 text-xs text-text-muted">Podsumowanie wskazuje najstarszą aktualizację. Każde źródło odświeża się osobno.</p>
        <ul className="space-y-3">
          {sources.map((source, index) => (
            <li key={`${source.id}-${index}`} className="[overflow-wrap:anywhere]">
              <p className="font-semibold text-foreground">{source.label}</p>
              <p>{source.updatedAt === null ? (source.error ? 'Nie udało się pobrać danych' : 'Wczytywanie…') : formatDataTimestamp(source.updatedAt)}</p>
              {source.error && source.updatedAt !== null && <p className="text-warning-text">Nie udało się odświeżyć</p>}
              {source.warning && <p className="text-warning-text">{source.warning}</p>}
              {source.refresh && <button type="button" onClick={source.refresh} aria-label={`Odśwież: ${source.label}`} className="press min-h-11 rounded-lg px-2 font-medium text-primary-text focus-visible:outline-2 focus-visible:outline-primary-text">Odśwież</button>}
            </li>
          ))}
        </ul>
      </section>
    </details>
  )
}
