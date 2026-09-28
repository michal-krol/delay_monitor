'use client'

import type { AlertRecord } from '@/lib/gtfs/alerts'
import type { LineDetail } from '@/lib/gtfs/query'
import { fetchJson, usePolling } from './usePolling'

/** `alerts: null` = feed alertów jeszcze nie odpowiedział (nieznane, nie „brak") -- patrz `/api/gtfs/line`. */
type LineResponse = { line: LineDetail | null; schedule: { state: string }; alerts?: AlertRecord[] | null }

/**
 * Przebieg linii (kształt + przystanki obu kierunków) dla trybu linii na mapie —
 * istniejące `/api/gtfs/line`, jedno pobranie na linię (ponawiane drabinką
 * `usePolling`, dopóki rozkład się ładuje, i co 30 s po błędzie). `detail`:
 * `undefined` = wczytuje się (także gdy rozkład jeszcze się ładuje), `null` =
 * rozkład nie zna tej linii, obiekt = dane. `routeId: null` = tryb linii wyłączony.
 */
type LineDetailState = { detail: LineDetail | null | undefined; alerts: AlertRecord[]; error: boolean }

/**
 * Jedyny predykat „odpowiedź jeszcze niepełna" -- też dla strony linii: rozkład się wczytuje albo
 * alerty nieznane (`alerts === null`, feed jeszcze nie odpowiedział). Rozkład `failed` NIE jest
 * „ładowaniem": drabinka staje, a UI pokazuje błąd zamiast szkieletu w pętli.
 */
export const isLineLoading = (json: LineResponse) => (json.line === null && json.schedule.state === 'loading') || json.alerts === null

const isLineScheduleLoading = (json: LineResponse) => json.line === null && json.schedule.state === 'loading'

export function useLineDetail(city: string, routeId: string | null): LineDetailState {
  const { data, error } = usePolling<LineResponse>(
    routeId === null ? null : JSON.stringify([city, routeId]),
    () => fetchJson(`/api/gtfs/line?city=${encodeURIComponent(city)}&route=${encodeURIComponent(routeId as string)}`),
    { refreshMs: null, isLoading: isLineLoading }
  )
  const scheduleFailed = data?.schedule.state === 'failed'
  // Przebieg jest dostępny, gdy tylko rozkład go zna -- nie czeka na alerty (te dojdą kolejną próbą drabinki).
  const ready = data !== null && !isLineScheduleLoading(data) && !scheduleFailed
  return { detail: ready ? data.line : undefined, alerts: ready ? (data.alerts ?? []) : [], error: error !== null || scheduleFailed }
}
