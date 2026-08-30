import type { ReactNode } from 'react'
import type { StationStats } from '@/lib/board/stationStats'
import { ArrowRightIcon, ClockIcon, CheckIcon, TrainIcon } from './icons'
import { pluralPl } from '@/lib/plural'

/**
 * Cztery kafelki KPI nad tablicą.
 *
 * Każda liczba tu jest **naszym** wskaźnikiem policzonym z danych operacyjnych
 * PKP, nie oficjalną statystyką przewoźnika — makieta §4 wprost przed tym
 * przestrzega. Stąd `hint` pod każdą wartością: mówi wprost, z czego liczba
 * powstała („z potwierdzonych dziś przejazdów", „próg 5 min"), zamiast
 * zostawiać ją do interpretacji.
 *
 * `null` w danych to zawsze „brak danych", nigdy „0" — patrz `stationStats.ts`.
 * Kafelek „0 pociągów" przy zepsutym pobraniu rozkładu byłby kłamstwem, i to
 * dokładnie tym rodzajem, przed którym stoi AGENTS.md #7.
 */

type CardProps = {
  icon: ReactNode
  /** Kolor akcentu ikony — token statusu, nie własny hex (patrz `globals.css`). */
  accent: string
  label: string
  value: string
  unit?: string
  hint: string
}

function StatCard({ icon, accent, label, value, unit, hint }: CardProps) {
  return (
    <div className="glass flex items-start gap-3 rounded-2xl p-4">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-text-muted">{label}</span>
        <span className="block">
          <span className="font-heading text-2xl font-extrabold tracking-tight text-foreground tabular-nums">{value}</span>
          {/* Spacja jest znakiem treści, nie tylko odstępem: `ml-1` daje
              margines wizualny, ale czytnik ekranu przeczytałby „2pociągi". */}
          {unit !== undefined && <span className="ml-1 text-sm text-text-secondary"> {unit}</span>}
        </span>
        <span className="block text-xs text-text-muted">{hint}</span>
      </span>
    </div>
  )
}

const NO_DATA = 'brak danych'
const LOADING = '—'

/**
 * Trzy różne stany, trzy różne komunikaty — nigdy jeden udający drugi:
 * „jeszcze się ładuje", „nie udało się pobrać" i konkretna liczba. Zlanie
 * pierwszych dwóch w jeden komunikat to dokładnie ten błąd, przed którym
 * ostrzega AGENTS.md #7 („brak wyników" ≠ „nie udało się sprawdzić").
 */
function countValue(count: number | null, loading: boolean): { value: string; unit?: string; hint: string } {
  if (loading) return { value: LOADING, hint: 'wczytywanie rozkładu…' }
  if (count === null) return { value: NO_DATA, hint: 'nie udało się pobrać rozkładu' }
  // „2 pociągów" jest po polsku błędne -- odmiana idzie przez wspólny `pluralPl`.
  return { value: String(count), unit: pluralPl(count, 'pociąg', 'pociągi', 'pociągów'), hint: 'wg rozkładu na dziś' }
}

/** Podpis dla wskaźnika liczonego z realizacji — patrz `countValue` co do trzech stanów. */
function realizationHint(loading: boolean, sample: number, ready: string): string {
  if (loading) return 'wczytywanie danych…'
  if (sample === 0) return 'żaden dzisiejszy przejazd nie jest jeszcze potwierdzony'
  return ready
}

export function StationStatsCards({ stats, loading = false }: { stats: StationStats | undefined; loading?: boolean }) {
  // Snapshotu jeszcze nie ma (zimny start pollera) -- kafelki i tak muszą
  // zająć swoje miejsce w kompozycji, żeby układ nie skakał, gdy dane dojdą.
  const safe: StationStats = stats ?? {
    departuresToday: null,
    arrivalsToday: null,
    averageDelayMinutes: null,
    averageDelaySample: 0,
    punctualityPct: null,
    punctualitySample: 0,
    punctualityThresholdMinutes: 5,
  }

  const departures = countValue(safe.departuresToday, loading)
  const arrivals = countValue(safe.arrivalsToday, loading)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={<TrainIcon size={18} />}
        accent="var(--status-notStarted-bg)"
        label="Odjazdy dzisiaj"
        {...departures}
      />
      <StatCard
        icon={<ArrowRightIcon size={18} />}
        accent="var(--status-onTime-bg)"
        label="Przyjazdy dzisiaj"
        {...arrivals}
      />
      <StatCard
        icon={<ClockIcon size={18} />}
        accent="var(--status-delayed-bg)"
        label="Średnie opóźnienie"
        value={loading ? LOADING : safe.averageDelayMinutes === null ? NO_DATA : `+${safe.averageDelayMinutes}`}
        unit={loading || safe.averageDelayMinutes === null ? undefined : 'min'}
        hint={realizationHint(loading, safe.averageDelaySample, `z ${safe.averageDelaySample} potwierdzonych dziś przejazdów`)}
      />
      <StatCard
        icon={<CheckIcon size={18} />}
        accent="var(--status-enRoute-bg)"
        label="Punktualność"
        value={loading ? LOADING : safe.punctualityPct === null ? NO_DATA : `${safe.punctualityPct}%`}
        hint={realizationHint(loading, safe.punctualitySample, `dziś, opóźnienie do ${safe.punctualityThresholdMinutes} min`)}
      />
    </div>
  )
}
