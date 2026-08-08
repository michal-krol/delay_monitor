import type { RealizationStatus } from '@/lib/board/realization'

type Props = {
  status: RealizationStatus
  /** Czytane tylko przy `status === 'delayed'`, gdzie zawsze jest realną wartością. */
  delayMinutes: number | null
  /**
   * Kierunek zdarzenia, którego dotyczy ten wiersz — decyduje tylko o
   * brzmieniu etykiety `notStarted` ("jeszcze nie wyjechał" dla odjazdu vs
   * "jeszcze nie przyjechał" dla przyjazdu). Domyślnie `'departure'`, bo
   * większość wywołań (np. panel szczegółów połączenia, gdzie jeden wiersz
   * łączy przyjazd i odjazd) nie ma jednoznacznego pojedynczego kierunku.
   */
  direction?: 'departure' | 'arrival'
  /**
   * Szacunek opóźnienia liczony ze stacji poprzedniej — czytany tylko przy
   * `status === 'enRoute'`. `null`/pominięte: samo "w trasie", bez liczby
   * (patrz `board/transform.ts`, `estimatedDelayMinutes`).
   */
  estimatedDelayMinutes?: number | null
}

const LABELS: Record<RealizationStatus, string> = {
  onTime: 'punktualnie',
  delayed: 'opóźniony',
  cancelled: 'odwołany',
  unknown: 'brak danych',
  notStarted: 'jeszcze nie wyjechał',
  enRoute: 'w trasie',
}

const ARRIVAL_NOT_STARTED_LABEL = 'jeszcze nie przyjechał'

const ESTIMATE_TOOLTIP =
  'Szacunek na podstawie ostatniej potwierdzonej stacji — może się różnić od faktycznego opóźnienia tutaj.'

const STYLES: Record<RealizationStatus, string> = {
  onTime: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  delayed: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  // Odróżnialne od `unknown` (brak danych) i `enRoute` (już jedzie) —
  // wcześniej `notStarted` dzielił identyczny szary styl z `unknown`, co
  // współtworzyło wrażenie, że tablica "nie ma żadnych danych" zamiast
  // uczciwie pokazywać "to jeszcze się nie wydarzyło".
  notStarted: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  enRoute: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
}

export function DelayBadge({ status, delayMinutes, direction = 'departure', estimatedDelayMinutes = null }: Props) {
  const hasEstimate = status === 'enRoute' && estimatedDelayMinutes !== null
  const text = hasEstimate
    ? estimatedDelayMinutes >= 1
      ? `w trasie, ~+${estimatedDelayMinutes} min`
      : 'w trasie, punktualnie'
    : status === 'delayed'
      ? `+${delayMinutes} min`
      : status === 'notStarted' && direction === 'arrival'
        ? ARRIVAL_NOT_STARTED_LABEL
        : LABELS[status]
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${STYLES[status]}`}
      title={hasEstimate ? ESTIMATE_TOOLTIP : undefined}
    >
      {text}
    </span>
  )
}
