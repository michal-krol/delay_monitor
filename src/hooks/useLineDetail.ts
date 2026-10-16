'use client'

import type { AlertRecord } from '@/lib/gtfs/alerts'
import { toContextAlertsState, type AlertFeedStatus, type ContextAlertsState } from '@/lib/gtfs/alertView'
import type { LineDetail } from '@/lib/gtfs/query'
import { fetchJson, usePolling } from './usePolling'

/** Rytm serwerowego pollera alertów (5 min) -- ponawiamy `failed` nie częściej, żeby powrót feedu był widoczny (jak `useCityStats`). */
const ALERT_RETRY_MS = 5 * 60_000

/**
 * `alerts: null` = feed alertów jeszcze nie odpowiedział (nieznane, nie „brak") -- patrz `/api/gtfs/line`.
 * `alertFeed`: stan feedu (`null` = brak pollera; brak pola = stary payload).
 */
export type LineResponse = { line: LineDetail | null; schedule: { state: string }; alerts?: AlertRecord[] | null; alertFeed?: AlertFeedStatus | null }

/**
 * Przebieg linii (kształt + przystanki obu kierunków) dla trybu linii na mapie —
 * istniejące `/api/gtfs/line`, jedno pobranie na linię (ponawiane drabinką
 * `usePolling`, dopóki rozkład się ładuje, i co 30 s po błędzie). `detail`:
 * `undefined` = wczytuje się (także gdy rozkład jeszcze się ładuje), `null` =
 * rozkład nie zna tej linii, obiekt = dane. `routeId: null` = tryb linii wyłączony.
 */
type LineDetailState = {
  detail: LineDetail | null | undefined
  alerts: AlertRecord[]
  error: boolean
  /** Stan komunikatów dla UI (#7): `ready` + `[]` to jedyne „brak"; `stale` = ostatnia dobra lista, odświeżenie padło. */
  alertsState: ContextAlertsState['state']
  alertsStale: boolean
}

/**
 * Jedyny predykat „odpowiedź jeszcze niepełna" -- też dla strony linii: rozkład się wczytuje albo
 * alerty nieznane (`alerts === null`, feed jeszcze nie odpowiedział). Rozkład `failed` NIE jest
 * „ładowaniem": drabinka staje, a UI pokazuje błąd zamiast szkieletu w pętli. Tak samo feed alertów
 * `failed` -- to stan znany; ponawia go `refreshMs` (`ALERT_RETRY_MS`), nie drabinka.
 */
export const isLineLoading = (json: LineResponse) =>
  (json.line === null && json.schedule.state === 'loading') || (json.alerts === null && json.alertFeed?.state !== 'failed')

const isLineScheduleLoading = (json: LineResponse) => json.line === null && json.schedule.state === 'loading'

/** Projekcja alertów z jednej odpowiedzi; `alerts: []` przy ładującym się/padłym rozkładzie nic nie znaczy o linii. */
function projectAlerts(data: LineResponse): ContextAlertsState {
  if (isLineScheduleLoading(data)) return { state: 'loading', stale: false }
  if (data.schedule.state === 'failed') return { state: 'failed', stale: false }
  // Stary payload bez pola `alerts` = jak dawniej `[]` (gotowe); `null` zostaje „nieznane".
  return toContextAlertsState(data.alertFeed, data.alerts === undefined ? [] : data.alerts)
}

/**
 * Stan komunikatów z jednej odpowiedzi + ewentualnego błędu odświeżenia -- JEDNO miejsce dla hooka i strony linii
 * (własny `usePolling` strony nie wolno dublować przepisanym mapperem). Błąd sieci po sukcesie: ostatnia lista
 * zostaje, ale jest nieaktualna (`stale`) -- tylko gdy była znana (nie „wczytuje się").
 */
export function deriveLineAlerts(data: LineResponse | null, networkError: boolean): ContextAlertsState {
  if (data === null) return { state: networkError ? 'failed' : 'loading', stale: false }
  const view = projectAlerts(data)
  if (!networkError) return view
  return { state: 'failed', stale: view.state === 'ready' || (view.state === 'failed' && view.stale) }
}

/** `refreshMs` linii: `failed` feed alertów ponawiamy co 5 min, resztę wyłącza drabinka/brak odświeżania. */
export const lineRefreshMs = (json: LineResponse): number | null => (json.alertFeed?.state === 'failed' ? ALERT_RETRY_MS : null)

export function useLineDetail(city: string, routeId: string | null): LineDetailState {
  const { data, error } = usePolling<LineResponse>(
    routeId === null ? null : JSON.stringify([city, routeId]),
    () => fetchJson(`/api/gtfs/line?city=${encodeURIComponent(city)}&route=${encodeURIComponent(routeId as string)}`),
    { refreshMs: lineRefreshMs, isLoading: isLineLoading }
  )
  const scheduleFailed = data?.schedule.state === 'failed'
  // Przebieg jest dostępny, gdy tylko rozkład go zna -- nie czeka na alerty (te dojdą kolejną próbą drabinki).
  const ready = data !== null && !isLineScheduleLoading(data) && !scheduleFailed
  const alertsState = deriveLineAlerts(data, error !== null)
  return {
    detail: ready ? data.line : undefined,
    alerts: ready ? (data.alerts ?? []) : [],
    error: error !== null || scheduleFailed,
    alertsState: alertsState.state,
    alertsStale: alertsState.stale,
  }
}
