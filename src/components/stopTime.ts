import type { RealizationStatus } from '@/lib/board/realization'
import type { TrainDetailStop } from '@/lib/board/trainDetail'
import { stopDelayMinutes } from '@/lib/board/journey'
import { timePresentation, type TimePresentation } from './boardTime'

export type StopEvent = 'arrival' | 'departure'

export type StopTime = Pick<TimePresentation, 'kind' | 'label'> & {
  /** Godzina dominująca (ISO); `null` = nic nie wiemy (brak planu, faktu i prognozy). */
  at: string | null
  /** Mała linia „Plan HH:mm” — tylko dla faktu i prognozy z planem; `null` dla `plan`. */
  planAt: string | null
}

/**
 * Które zdarzenie opisuje wiersz przystanku: odjazd, a na stacji końcowej przyjazd. Oparte na planowym LUB faktycznym
 * odjeździe — pociąg bez dopasowanej trasy (patrz trainDetail.ts) ma plany `null`, ale zna faktyczne czasy.
 */
export function stopEvent(stop: TrainDetailStop): StopEvent {
  return stop.plannedDeparture !== null || stop.actualDeparture !== null ? 'departure' : 'arrival'
}

/**
 * Plan / prognoza / fakt jednego zdarzenia przystanku. Adapter pól przystanku na wejście `timePresentation()` (jedna
 * reguła z tablicą i Pulpitem, `boardTime.ts`) — zero nowej logiki realizacji (AGENTS.md #2): `actual*` liczy się
 * tylko przy `isConfirmed`, prognoza tylko przy NIEpotwierdzonym; globalnego opóźnienia pociągu nie dodajemy.
 */
export function describeStopTime(stop: TrainDetailStop, status: RealizationStatus, now: number, event: StopEvent): StopTime {
  const departure = event === 'departure'
  const plannedAt = departure ? stop.plannedDeparture : stop.plannedArrival
  const actualAt = stop.isConfirmed ? (departure ? stop.actualDeparture : stop.actualArrival) : null
  // `?? null`: odpowiedź API zawsze niesie te pola, ale starsze literały w testach mogą ich nie mieć wcale.
  const predictedAt = stop.isConfirmed ? null : ((departure ? stop.predictedDeparture : stop.predictedArrival) ?? null)

  if (plannedAt === null) {
    // Trasa niedopasowana: `timePresentation` wymaga planu. Bez planu zostaje fakt albo prognoza, inaczej „nie wiadomo”.
    if (status !== 'cancelled' && actualAt !== null) return { kind: 'fact', label: 'Faktycznie', at: actualAt, planAt: null }
    if (status !== 'cancelled' && predictedAt !== null) return { kind: 'forecast', label: 'Przew.', at: predictedAt, planAt: null }
    return { kind: 'plan', label: 'Plan', at: null, planAt: null }
  }

  const { kind, label, at, planAt } = timePresentation(
    { plannedAt, actualAt, delayMinutes: stopDelayMinutes(stop), predictedAt, status },
    now
  )
  return { kind, label, at, planAt }
}
