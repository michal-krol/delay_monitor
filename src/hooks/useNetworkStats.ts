'use client'

import { fetchJson, usePolling } from './usePolling'
import type { NetworkStats } from '@/lib/board/networkStats'

// Agregat ogólnopolski odświeżany po stronie serwera co ~15 min (patrz
// `networkStats.ts`) -- nie ma sensu odpytywać częściej niż to, i tak
// dostaniemy tę samą, cache'owaną odpowiedź. Bez logiki fast-retry/cold-start
// z `useBoard.ts` -- niepotrzebna dla agregatu, nie danych live per stację.
const REFRESH_INTERVAL_MS = 15 * 60 * 1000

/**
 * Minimalna, płytka walidacja kształtu -- to wprawdzie odpowiedź własnego
 * route handlera (`/api/network-stats`), nie zewnętrznego API, ale widżet
 * jest wyłącznie ozdobny: nietypowa odpowiedź (np. globalny mock `fetch` w
 * innym teście, albo przyszła zmiana kontraktu) ma degradować do "brak
 * danych", nie wywalać cały render `toLocaleString()` na `undefined`.
 */
function isNetworkStats(value: unknown): value is NetworkStats {
  if (typeof value !== 'object' || value === null) return false
  const v = value as NetworkStats
  return (
    (v.statistics === null || typeof v.statistics === 'object') &&
    Array.isArray(v.topCarriers) &&
    Array.isArray(v.history)
  )
}

/**
 * Ostatnia udana odpowiedź, poza stanem komponentu -- nawigacja z pulpitu i
 * powrót odmontowuje kartę, więc samo `useState(null)` gubiło ją, mimo że
 * serwer wciąż ma ją scache'owaną (`networkStats.ts`, TTL 15 min) i odpowiada
 * natychmiast. Bez tego widżet migał "Wczytywanie…" przy każdym powrocie.
 */
let lastKnownStats: NetworkStats | null = null

/** Wyłącznie do testów — resetuje moduł między przypadkami (ten sam wzorzec co `networkStats.ts`). */
export function resetNetworkStatsHookForTests(): void {
  lastKnownStats = null
}

export function useNetworkStats() {
  const { data, error } = usePolling<NetworkStats>(
    'network-stats',
    async () => {
      const json = await fetchJson<unknown>('/api/network-stats')
      if (!isNetworkStats(json)) throw new Error('Nieoczekiwany kształt odpowiedzi')
      lastKnownStats = json
      return json
    },
    { refreshMs: REFRESH_INTERVAL_MS, initialData: lastKnownStats ?? undefined }
  )
  return { data, error }
}
