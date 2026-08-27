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
  /**
   * `pill` (domyślnie) — nasycona plakietka na własnym tle, do tablicy
   * i nagłówków. `text` — sam kolorowy tekst, do gęstych list, gdzie sześć
   * pigułek pod sobą przytłacza wiersz (przebieg trasy w panelu szczegółów).
   * Zmienia wyłącznie wygląd: etykieta, tooltip i znaczenie są te same.
   */
  variant?: 'pill' | 'text'
}

/** Wyeksportowane, żeby legenda statusów (`BoardTable.tsx`) mogła reużyć te same etykiety zamiast duplikować je osobno. */
export const LABELS: Record<RealizationStatus, string> = {
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

// Nasycone plakietki z tokenów CSS (src/app/globals.css) — ta sama para
// kolorów w obu motywach, patrz task 1.1. `notStarted` odróżnialny od
// `unknown` (brak danych) i `enRoute` (już jedzie) — wcześniej dzielił
// identyczny szary styl z `unknown`, co współtworzyło wrażenie, że tablica
// "nie ma żadnych danych" zamiast uczciwie pokazywać "to jeszcze się nie
// wydarzyło".
/** Wyeksportowane z tego samego powodu co `LABELS` wyżej -- jedno źródło prawdy dla kolorów, żeby legenda nigdy nie mogła rozjechać się z faktycznymi plakietkami. */
export const TOKENS: Record<RealizationStatus, { bg: string; fg: string }> = {
  onTime: { bg: 'var(--status-onTime-bg)', fg: 'var(--status-onTime-fg)' },
  delayed: { bg: 'var(--status-delayed-bg)', fg: 'var(--status-delayed-fg)' },
  cancelled: { bg: 'var(--status-cancelled-bg)', fg: 'var(--status-cancelled-fg)' },
  unknown: { bg: 'var(--status-unknown-bg)', fg: 'var(--status-unknown-fg)' },
  notStarted: { bg: 'var(--status-notStarted-bg)', fg: 'var(--status-notStarted-fg)' },
  enRoute: { bg: 'var(--status-enRoute-bg)', fg: 'var(--status-enRoute-fg)' },
}

/**
 * Tekstowe warianty kolorów statusu — druga połowa tego samego, jedynego
 * źródła co `TOKENS`. Osobna mapa, bo kolory pigułki są projektowane jako TŁO
 * pod białym tekstem i jako tekst na tle karty nie spełniają WCAG AA
 * (zmierzone wartości w komentarzu w `globals.css`). W przeciwieństwie do
 * `TOKENS` te tokeny są zależne od motywu.
 */
export const STATUS_TEXT: Record<RealizationStatus, string> = {
  onTime: 'var(--status-onTime-text)',
  delayed: 'var(--status-delayed-text)',
  cancelled: 'var(--status-cancelled-text)',
  unknown: 'var(--status-unknown-text)',
  notStarted: 'var(--status-notStarted-text)',
  enRoute: 'var(--status-enRoute-text)',
}

export function DelayBadge({ status, delayMinutes, direction = 'departure', estimatedDelayMinutes = null, variant = 'pill' }: Props) {
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
      className={variant === 'text' ? 'text-sm font-semibold' : 'rounded-full px-2.5 py-0.5 text-sm font-semibold'}
      style={
        variant === 'text'
          ? { color: STATUS_TEXT[status] }
          : { backgroundColor: TOKENS[status].bg, color: TOKENS[status].fg }
      }
      title={hasEstimate ? ESTIMATE_TOOLTIP : undefined}
    >
      {text}
    </span>
  )
}
