'use client'

import { useEffect, useState } from 'react'
import type { AlertRecord } from '@/lib/gtfs/alerts'
import type { LineDetail } from '@/lib/gtfs/query'

const LOADING_RETRY_MS = 2_000
const ERROR_RETRY_MS = 30_000

/**
 * Przebieg linii (kształt + przystanki obu kierunków) dla trybu linii na mapie —
 * istniejące `/api/gtfs/line`, jedno pobranie na linię. `detail`: `undefined` =
 * wczytuje się (także gdy rozkład jeszcze się ładuje — ponawiamy), `null` =
 * rozkład nie zna tej linii, obiekt = dane. `routeId: null` = tryb linii wyłączony.
 */
type LineDetailState = { detail: LineDetail | null | undefined; alerts: AlertRecord[]; error: boolean }

export function useLineDetail(city: string, routeId: string | null): LineDetailState {
  const [state, setState] = useState<LineDetailState & { key: string | null }>({
    key: null,
    detail: undefined,
    alerts: [],
    error: false,
  })
  const key = routeId === null ? null : `${city}:${routeId}`

  useEffect(() => {
    if (routeId === null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function load(): Promise<void> {
      try {
        const response = await fetch(`/api/gtfs/line?city=${encodeURIComponent(city)}&route=${encodeURIComponent(routeId!)}`)
        if (!response.ok) throw new Error(String(response.status))
        const json = (await response.json()) as { line: LineDetail | null; schedule: { state: string }; alerts?: AlertRecord[] }
        if (cancelled) return
        if (json.line === null && json.schedule.state !== 'ready') {
          timer = setTimeout(() => void load(), LOADING_RETRY_MS)
          return
        }
        setState({ key: `${city}:${routeId}`, detail: json.line, alerts: json.alerts ?? [], error: false })
      } catch {
        if (cancelled) return
        setState({ key: `${city}:${routeId}`, detail: undefined, alerts: [], error: true })
        timer = setTimeout(() => void load(), ERROR_RETRY_MS)
      }
    }

    void load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [city, routeId])

  return state.key === key ? { detail: state.detail, alerts: state.alerts, error: state.error } : { detail: undefined, alerts: [], error: false }
}
