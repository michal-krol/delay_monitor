'use client'

import { useEffect, useState } from 'react'
import type { RealizationStatus } from '@/lib/board/realization'
import type { StationInsights, StationStats } from '@/lib/board/stationStats'

export type BoardApiRow = {
  scheduleId: string
  orderId: string
  operatingDate: string
  trainNumber: string
  trainLabel: string
  carrier: string
  carrierName: string | null
  category: string
  categoryName: string | null
  headsign: string | null
  /**
   * Wybrane przystanki pośrednie („przez Pruszków, Opoczno, Kielce").
   * Opcjonalne z tego samego powodu co `hasDisruption` niżej -- literały tego
   * typu w testach sprzed tego pola nie muszą się o nim uczyć.
   */
  via?: string[]
  /** Ile przystanków pośrednich nie zmieściło się w `via` -- „· +12 przystanków". */
  viaRemaining?: number
  plannedAt: string
  /** FAKT -- `null`, dopóki przystanek nie jest potwierdzony. */
  actualAt: string | null
  /** PROGNOZA -- przewidywana godzina dla niepotwierdzonego przystanku. Nigdy nie jest faktem; patrz `board/realization.ts`. */
  predictedAt?: string | null
  /** Minuty opóźnienia z `predictedAt`. Opcjonalne -- literały w testach sprzed tego pola nie muszą się o nim uczyć. */
  predictedDelayMinutes?: number | null
  /** `null`, gdy przystanek nie jest jeszcze potwierdzony (`status` będzie wtedy `notStarted`). */
  delayMinutes: number | null
  status: RealizationStatus
  /** Peron PLANOWY -- API nie reprezentuje zmiany peronu w ostatniej chwili. `null` = nie podano. */
  platform: string | null
  /** Tor PLANOWY, niezależny od `platform`. Formatowanie („2 / —") należy do komponentu. */
  track?: string | null
  /** Szacunek (nie fakt) ze stacji poprzedniej -- tylko przy `status === 'enRoute'`. Patrz `board/transform.ts`. */
  estimatedDelayMinutes: number | null
  /**
   * Czy cały przejazd (dowolna stacja trasy) jest objęty utrudnieniem -- patrz
   * `board/disruptions.ts`. Opcjonalne (nie `boolean`), świadomie: liczne
   * literały tego typu w testach powstałych przed tym polem nie muszą się
   * teraz o nim uczyć, żeby dalej się kompilować.
   */
  hasDisruption?: boolean
}

export type BoardApiSnapshot = {
  stationId: string
  stationName: string
  departures: BoardApiRow[]
  arrivals: BoardApiRow[]
  fetchedAt: string
  ageMs: number
  /**
   * Kafelki KPI i kontekst prawej kolumny widoku stacji -- liczone w cyklu
   * pollera, bez ani jednego dodatkowego zapytania do PKP (patrz
   * `lib/board/stationStats.ts`). Opcjonalne, bo starsze snapshoty w testach
   * ich nie mają; komponenty i tak muszą obsłużyć `null` w środku („nie
   * wiadomo" ≠ „zero").
   */
  stats?: StationStats
  insights?: StationInsights
  /** Treści utrudnień dotykających tej stacji -- patrz `board/disruptions.ts`. */
  disruptionMessages?: string[]
}

export type BoardApiResponse = {
  snapshots: (BoardApiSnapshot | null)[]
  budget: { hourly: number | null; daily: number | null } | undefined
  status: 'ok' | 'configError' | 'degraded'
  /** Tablica stoi na rozkładzie, bo realizacja nie zna dzisiejszego ruchu -- patrz `/api/board`. */
  realizationStale?: boolean
  /**
   * Realizacja niepełna: `/operations` miało kolejne strony, których poller nie
   * dociągnął (budżet / limit stron). Część pociągów bez realizacji pokaże się
   * jako „jeszcze nie wyjechał" mimo że jadą -- patrz `/api/board`, `BoardStatus`.
   */
  realizationIncomplete?: boolean
  throttled: boolean
}

const REFRESH_INTERVAL_MS = 30000
/**
 * Zamiast czekać pełne 30s na pierwsze dane po zimnym starcie (poller
 * budzi się async, `/api/board` nigdy na niego nie czeka -- patrz
 * `route.ts`), dopytujemy szybciej, dopóki snapshot jest jeszcze `null`.
 * Realny fetch z PKP zwykle kończy się w 1-3s, więc te kilka prób zwykle
 * wystarczy; potem wracamy do normalnego tempa.
 */
const FAST_RETRY_DELAYS_MS = [1000, 2000, 4000]

function stillLoading(json: BoardApiResponse): boolean {
  return json.status === 'ok' && json.snapshots.some((snapshot) => snapshot === null)
}

export function useBoard(stationIds: string[]) {
  const [data, setData] = useState<BoardApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = stationIds.join(',')

  useEffect(() => {
    if (stationIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets stale data when the caller stops watching any station
      setData(null)
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let fastRetryIndex = 0

    // `respectHidden`: pierwsze wywołanie zawsze pobiera dane, nawet gdy
    // karta jest akurat ukryta (tak zachowywał się poprzedni kod: `fetchBoard()`
    // na starcie było bezwarunkowe) -- tylko KOLEJNE, zaplanowane odpytania
    // pomijają fetch, gdy karta jest schowana.
    async function tick(respectHidden: boolean): Promise<void> {
      if (cancelled) return

      if (respectHidden && document.hidden) {
        timer = setTimeout(() => void tick(true), REFRESH_INTERVAL_MS)
        return
      }

      let loading = false
      try {
        const response = await fetch(`/api/board?stations=${key}`)
        if (!response.ok) throw new Error(`Błąd odpowiedzi: ${response.status}`)
        const json = (await response.json()) as BoardApiResponse
        if (!cancelled) {
          setData(json)
          setError(null)
        }
        loading = stillLoading(json)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Nieznany błąd')
      }
      if (cancelled) return

      const delay = loading && fastRetryIndex < FAST_RETRY_DELAYS_MS.length ? FAST_RETRY_DELAYS_MS[fastRetryIndex++] : REFRESH_INTERVAL_MS
      timer = setTimeout(() => void tick(true), delay)
    }

    void tick(false)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { data, error }
}
