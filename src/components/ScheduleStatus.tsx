import type { TransitBoardResponse } from '@/hooks/useTransitBoard'

type Props = {
  schedule: TransitBoardResponse['schedule']
  cityName: string
  /** Bieżący błąd sieci z hooka — dokłada się jako chip, nie zastępuje wieku. */
  error?: boolean
}

const WARNING_CLASS = 'text-amber-700 dark:text-amber-400'

function formatAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60000)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/** `yyyy-MM-dd` → „środa, 3 września" (data doby „dziś" z okna rozkładu). */
function formatServiceDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
}

const PHASE_LABEL: Record<string, string> = {
  start: 'start',
  feed_info: 'wersja feedu',
  tabele: 'przystanki i linie',
  stop_times: 'rozkład przejazdów',
  weryfikacja: 'weryfikacja',
}

/**
 * Linijka stanu rozkładu miejskiego. Pomiar lokalny: całe ładowanie to rząd
 * kilkunastu sekund, więc `loading` jest zaprojektowanym stanem z widoczną
 * FAZĄ (nazwa fazy niepokoi mniej niż licznik sekund). `droppedRows` nie ma
 * w tej odpowiedzi — trójstan jest w `/api/health`.
 */
export function ScheduleStatus({ schedule, cityName, error = false }: Props) {
  if (schedule.state === 'loading') {
    return (
      <p aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
          Wczytuję rozkład — {cityName}
          {schedule.phase !== null && <span className="text-text-muted">· {PHASE_LABEL[schedule.phase] ?? schedule.phase}</span>}
        </span>
      </p>
    )
  }

  const stale = schedule.ageMs !== null && schedule.ageMs >= 60 * 60 * 1000

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
      <span>Rozkład jazdy — {cityName}</span>
      {schedule.serviceDates !== null && (
        <span className="text-text-muted">· aktualny na {formatServiceDate(schedule.serviceDates[1])}</span>
      )}
      <span className="contents" aria-live="polite">
        {(schedule.state === 'failed' || stale) && schedule.ageMs !== null && (
          <span className={WARNING_CLASS}>dane sprzed {formatAge(schedule.ageMs)}</span>
        )}
        {schedule.state === 'failed' && <span className={WARNING_CLASS}>odświeżanie nie powiodło się</span>}
        {error && schedule.state !== 'failed' && (
          <span className={WARNING_CLASS}>błąd ostatniego odświeżenia</span>
        )}
      </span>
    </p>
  )
}
