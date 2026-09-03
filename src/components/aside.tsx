import type { ReactNode } from 'react'
import { pluralPl } from '@/lib/plural'

/** Karta prawej kolumny kontekstowej — wspólna dla widoku stacji i przystanku. */
export function AsideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass rounded-2xl p-4">
      <h3 className="font-heading text-sm font-bold tracking-tight text-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-text-muted">{children}</p>
}

/**
 * Słupkowy wykres odjazdów w ciągu doby (24 kubełki). `null` = nie znamy
 * rozkładu; sam zerowy szczyt = rozkład bez odjazdów. Godzina bieżąca podświetlona.
 */
export function HourlyTraffic({
  hourly,
  loading,
  currentHour,
  emptyLabel = 'Rozkład na dziś nie zawiera odjazdów z tego miejsca.',
}: {
  hourly: number[] | null
  loading: boolean
  currentHour: number
  emptyLabel?: string
}) {
  if (loading) return <EmptyHint>Wczytywanie rozkładu…</EmptyHint>
  if (hourly === null) {
    return <EmptyHint>Nie udało się pobrać rozkładu, więc nie znamy rozkładu ruchu w dobie.</EmptyHint>
  }

  const peak = Math.max(...hourly)
  if (peak === 0) return <EmptyHint>{emptyLabel}</EmptyHint>

  return (
    <div>
      <div
        className="flex h-16 items-end gap-[2px]"
        role="img"
        aria-label={`Odjazdy w ciągu doby, szczyt ${peak} o godzinie ${hourly.indexOf(peak)}`}
      >
        {hourly.map((count, hour) => (
          <span
            key={hour}
            title={`${String(hour).padStart(2, '0')}:00 — ${count} ${pluralPl(count, 'odjazd', 'odjazdy', 'odjazdów')}`}
            className="flex-1 rounded-sm transition"
            style={{
              // Minimalna wysokość 2px dla godziny z zerem: pusty słupek i brak
              // słupka wyglądałyby identycznie, a to dwie różne rzeczy.
              height: `${Math.max(2, (count / peak) * 100)}%`,
              backgroundColor: hour === currentHour ? 'var(--status-enRoute-bg)' : 'var(--surface-border)',
              opacity: count === 0 ? 0.4 : 1,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-text-muted tabular-nums">
        <span>00</span>
        <span>12</span>
        <span>23</span>
      </div>
    </div>
  )
}
