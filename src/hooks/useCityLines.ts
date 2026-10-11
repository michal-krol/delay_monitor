'use client'

import { useMemo } from 'react'
import { MODE_ORDER } from '@/components/transitMode'
import type { LineListEntry } from '@/lib/gtfs/query'
import type { GtfsMode } from '@/lib/gtfs/types'
import type { TransitBoardResponse } from './useTransitBoard'
import { fetchJson, usePolling } from './usePolling'

type LinesResponse = {
  city: string
  schedule: TransitBoardResponse['schedule']
  lines: Record<GtfsMode, LineListEntry[]> | null
  attribution: string[]
}

export type CityLinesState = {
  /** `null` = nieznane (wczytuje się albo błąd) -- nigdy `[]`, chyba że udana odpowiedź miała pustą listę (AGENTS.md #7). */
  lines: LineListEntry[] | null
  state: 'loading' | 'ready' | 'failed'
  /** Ostatnie pobranie nieudane albo rozkład `failed`; przy `state: 'ready'` stara lista nadal jest w `lines`. */
  error: boolean
  refresh: () => void
  schedule: TransitBoardResponse['schedule'] | null
  attribution: string[]
}

const NO_ATTRIBUTION: string[] = []
const noop = () => {}
// Brak miasta = nic do wczytania: stan stały i stabilny między renderami.
const NO_CITY: CityLinesState = { lines: null, state: 'ready', error: false, refresh: noop, schedule: null, attribution: NO_ATTRIBUTION }

/**
 * Płaska lista linii miasta (`/api/gtfs/lines`, kolejność `MODE_ORDER`) dla wyszukiwarki; jedno pobranie
 * z drabinką ponowień, dopóki rozkład się wczytuje. Dane innego miasta niż żądane nigdy nie wychodzą na zewnątrz.
 * `city === null` = hook wyłączony (bez żądań).
 */
export function useCityLines(city: string | null): CityLinesState {
  const { data, error, refresh } = usePolling<LinesResponse>(city, () => fetchJson(`/api/gtfs/lines?city=${encodeURIComponent(city ?? '')}`), {
    refreshMs: null,
    // Brak listy = dalej ponawiamy (także `schedule.state: 'failed'`, tak jak strona „Linie").
    isLoading: (json) => json.lines === null,
    cacheNamespace: 'cityLines',
  })
  const own = data !== null && data.city === city ? data : null
  const lines = useMemo(() => (own?.lines == null ? null : MODE_ORDER.flatMap((mode) => own.lines![mode] ?? [])), [own])

  if (city === null) return NO_CITY
  const scheduleFailed = own?.schedule.state === 'failed'
  return {
    lines,
    state: lines !== null ? 'ready' : error !== null || scheduleFailed ? 'failed' : 'loading',
    error: error !== null || scheduleFailed,
    refresh,
    schedule: own?.schedule ?? null,
    attribution: own?.attribution ?? NO_ATTRIBUTION,
  }
}
