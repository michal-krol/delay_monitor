'use client'

import type { AlertRecord } from '@/lib/gtfs/alerts'
import type { LineDetail } from '@/lib/gtfs/query'
import { fetchJson, usePolling } from './usePolling'

type LineResponse = { line: LineDetail | null; schedule: { state: string }; alerts?: AlertRecord[] }

/**
 * Przebieg linii (kształt + przystanki obu kierunków) dla trybu linii na mapie —
 * istniejące `/api/gtfs/line`, jedno pobranie na linię (ponawiane drabinką
 * `usePolling`, dopóki rozkład się ładuje, i co 30 s po błędzie). `detail`:
 * `undefined` = wczytuje się (także gdy rozkład jeszcze się ładuje), `null` =
 * rozkład nie zna tej linii, obiekt = dane. `routeId: null` = tryb linii wyłączony.
 */
type LineDetailState = { detail: LineDetail | null | undefined; alerts: AlertRecord[]; error: boolean }

const isLineLoading = (json: LineResponse) => json.line === null && json.schedule.state !== 'ready'

export function useLineDetail(city: string, routeId: string | null): LineDetailState {
  const { data, error } = usePolling<LineResponse>(
    routeId === null ? null : JSON.stringify([city, routeId]),
    () => fetchJson(`/api/gtfs/line?city=${encodeURIComponent(city)}&route=${encodeURIComponent(routeId as string)}`),
    { refreshMs: null, isLoading: isLineLoading }
  )
  const ready = data !== null && !isLineLoading(data)
  return { detail: ready ? data.line : undefined, alerts: ready ? (data.alerts ?? []) : [], error: error !== null }
}
