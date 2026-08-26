'use client'

import { useEffect, useState } from 'react'
import { DelayBadge } from './DelayBadge'
import { resolveStopStatus, type RealizationStatus } from '@/lib/board/realization'
import type { TrainDetailStop } from '@/lib/board/trainDetail'

type TrainDetailApiResponse = {
  scheduleId: string
  orderId: string
  operatingDate: string
  trainStatus: string | null
  carrierCode: string | null
  category: string | null
  routeName: string | null
  stops: TrainDetailStop[]
}

type Props = {
  scheduleId: string
  orderId: string
  operatingDate: string
  trainLabel: string
}

type Status = 'loading' | 'error' | 'ready'

/**
 * Jeden "przystanek" w tym widoku łączy przyjazd i odjazd — tu, i tylko tu,
 * trzeba wybrać, którym opóźnieniem się kierować (odjazdowe pierwsze: to ono
 * decyduje, czy podróż stąd dalej rusza planowo). Sam wynik "czy to się już
 * wydarzyło" idzie do współdzielonego `resolveStopStatus` — ta sama funkcja
 * co w `board/transform.ts`, żeby te dwa widoki nie mogły się już rozjechać.
 */
function stopDelayMinutes(stop: TrainDetailStop): number | null {
  return stop.departureDelayMinutes ?? stop.arrivalDelayMinutes
}

function formatTime(value: string | null): string | null {
  if (value === null) return null
  return new Date(value).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

// Kolor znacznika/odcinka toru per status — te same pary kolor/token co
// `DelayBadge` (src/app/globals.css, decyzja #1.1), żeby stepper i plakietka
// obok nigdy nie mogły pokazać dwóch różnych kolorów dla tego samego statusu.
const STOP_COLOR: Record<RealizationStatus, string> = {
  onTime: 'var(--status-onTime-bg)',
  delayed: 'var(--status-delayed-bg)',
  cancelled: 'var(--status-cancelled-bg)',
  unknown: 'var(--status-unknown-bg)',
  notStarted: 'var(--status-notStarted-bg)',
  enRoute: 'var(--status-enRoute-bg)',
}

/** Ten sam wzorzec zastrzeżenia co `ESTIMATE_TOOLTIP` w `DelayBadge.tsx` — inne źródło (godzina wprost z PKP dla TEGO przystanku), ta sama ostrożność. */
const PREDICTED_TIME_TOOLTIP = 'Przewidywana godzina na podstawie danych PKP dla tego przystanku — może się różnić od faktycznej.'

/** Pola, których nie ma w API PKP — nigdy zmyślonej wartości, zawsze jawne "niedostępne". */
function UnavailableField() {
  return (
    <span className="text-text-muted italic" title="Niedostępne w danych PKP">
      niedostępne
    </span>
  )
}

export function ConnectionDetails({ scheduleId, orderId, operatingDate, trainLabel }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [data, setData] = useState<TrainDetailApiResponse | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const params = new URLSearchParams({ scheduleId, orderId, operatingDate })
        const response = await fetch(`/api/train?${params}`)
        if (!response.ok) throw new Error(`Błąd odpowiedzi: ${response.status}`)
        const json = (await response.json()) as TrainDetailApiResponse
        if (!cancelled) {
          setData(json)
          setStatus('ready')
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [scheduleId, orderId, operatingDate])

  // Status per przystanek, policzony raz z `resolveStopStatus` — jedyne źródło
  // koloru zarówno dla `DelayBadge` w wierszu, jak i dla znacznika/odcinka
  // toru w stepperze niżej. Żadnej drugiej, równoległej logiki.
  const stopStatuses =
    status === 'ready' && data !== null
      ? data.stops.map((stop) =>
          resolveStopStatus({
            isCancelled: stop.isCancelled,
            isConfirmed: stop.isConfirmed,
            delayMinutes: stopDelayMinutes(stop),
            hasTrainStarted: stop.hasTrainStarted,
          })
        )
      : []

  return (
    <div className="flex flex-col gap-6">
      <div className="glass rounded-2xl p-5">
        <h1 className="font-heading text-xl font-bold tracking-tight text-foreground">
          {data?.routeName ?? trainLabel}
        </h1>
        {status === 'ready' && data !== null && (
          <p className="mt-0.5 text-sm text-text-muted">{data.stops.length} przystanków</p>
        )}
      </div>

      {status === 'loading' && <p className="text-sm text-text-muted">Wczytywanie trasy…</p>}

      {status === 'error' && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          Nie udało się pobrać szczegółów połączenia.
        </p>
      )}

      {status === 'ready' && data !== null && (
        <>
          <section className="glass rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-text-secondary">Informacje o połączeniu</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-text-muted">Przewoźnik</dt>
                <dd className="mt-0.5 font-medium text-foreground">{data.carrierCode ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Kategoria</dt>
                <dd className="mt-0.5 font-medium text-foreground">{data.category ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Tabor</dt>
                <dd className="mt-0.5">
                  <UnavailableField />
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Prędkość</dt>
                <dd className="mt-0.5">
                  <UnavailableField />
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Długość składu</dt>
                <dd className="mt-0.5">
                  <UnavailableField />
                </dd>
              </div>
            </dl>
          </section>

          {/* Pionowy stepper: kolumna znacznika ma `flex-direction: column`, więc
              każdy wiersz sam rysuje swój odcinek "szyny" do następnego przystanku
              (kropka = status TEGO przystanku, odcinek pod nią = status NASTĘPNEGO —
              to on informuje, jak wygląda dalsza podróż tym odcinkiem trasy). */}
          <ol className="glass rounded-2xl p-5">
            {data.stops.map((stop, index) => {
              // Oparte na fakcie przyjazdu/odjazdu (planowym LUB faktycznym), nie
              // tylko planowym — pociąg bez dopasowanej trasy (patrz trainDetail.ts)
              // ma plannedArrival/plannedDeparture zawsze null, ale wciąż zna
              // faktyczne czasy i nie może przez to zniknąć z widoku.
              const hasArrival = stop.plannedArrival !== null || stop.actualArrival !== null
              const hasDeparture = stop.plannedDeparture !== null || stop.actualDeparture !== null
              const isTerminus = !hasArrival || !hasDeparture
              // `actualArrival`/`actualDeparture` bez `isConfirmed` nie dowodzi
              // realizacji (patrz AGENTS.md/realization.ts) -- ta sama zasada
              // dotyczy wyboru CZASU DO WYŚWIETLENIA, nie tylko liczenia statusu.
              // Niepotwierdzony przystanek pokazuje więc zawsze plan, nigdy
              // surowe `actual` (które PKP bywa, że ustawia na wartość przesuniętą
              // o całą dobę dla przystanków daleko w przyszłości).
              const arrival = formatTime(stop.isConfirmed && stop.actualArrival !== null ? stop.actualArrival : stop.plannedArrival)
              const departure = formatTime(stop.isConfirmed && stop.actualDeparture !== null ? stop.actualDeparture : stop.plannedDeparture)
              // `?? null`, nie samo `stop.predictedArrival` -- odpowiedź API zawsze
              // niesie to pole, ale starsze/ręczne fixture'y w testach mogą go nie
              // mieć wcale (brakujący klucz to `undefined`, nie `null`).
              const predictedArrival = formatTime(stop.predictedArrival ?? null)
              const predictedDeparture = formatTime(stop.predictedDeparture ?? null)
              const isLast = index === data.stops.length - 1
              const thisStatus = stopStatuses[index]
              const nextStatus = stopStatuses[index + 1]

              return (
                <li key={stop.stationId} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: STOP_COLOR[thisStatus] }}
                      aria-hidden="true"
                    />
                    {!isLast && (
                      <span
                        className="mt-1 w-0.5 flex-1"
                        style={{ backgroundColor: STOP_COLOR[nextStatus] }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-5'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`font-medium text-foreground ${isTerminus ? '' : 'text-sm'}`}
                      >
                        {stop.stationName}
                      </span>
                      <DelayBadge
                        status={thisStatus}
                        delayMinutes={stopDelayMinutes(stop)}
                        estimatedDelayMinutes={stop.estimatedDelayMinutes}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                      {hasArrival && (
                        <span>
                          Przyjazd {arrival}
                          {predictedArrival !== null && (
                            <span className="italic" title={PREDICTED_TIME_TOOLTIP}>
                              {' '}
                              (przewidywany: {predictedArrival})
                            </span>
                          )}
                        </span>
                      )}
                      {hasDeparture && (
                        <span>
                          Odjazd {departure}
                          {predictedDeparture !== null && (
                            <span className="italic" title={PREDICTED_TIME_TOOLTIP}>
                              {' '}
                              (przewidywany: {predictedDeparture})
                            </span>
                          )}
                        </span>
                      )}
                      {stop.platform !== null && <span>Peron/tor {stop.platform}</span>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </div>
  )
}
