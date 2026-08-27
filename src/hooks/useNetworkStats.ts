'use client'

import { useEffect, useState } from 'react'
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
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NetworkStats).totalTrains === 'number' &&
    typeof (value as NetworkStats).generatedAt === 'string' &&
    Array.isArray((value as NetworkStats).topCarriers) &&
    Array.isArray((value as NetworkStats).history)
  )
}

/**
 * Ostatnia udana odpowiedź, poza stanem komponentu -- nawigacja z pulpitu i
 * powrót odmontowuje kartę, więc samo `useState(null)` gubiło ją, mimo że
 * serwer wciąż ma ją scache'owaną (`networkStats.ts`, TTL 15 min) i odpowiada
 * natychmiast. Bez tego widżet migał "Wczytywanie…" przy każdym powrocie.
 */
let lastKnownStats: NetworkStats | null = null

export function useNetworkStats() {
  const [data, setData] = useState<NetworkStats | null>(lastKnownStats)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function tick(respectHidden: boolean): Promise<void> {
      if (cancelled) return
      if (respectHidden && document.hidden) {
        timer = setTimeout(() => void tick(true), REFRESH_INTERVAL_MS)
        return
      }
      try {
        const response = await fetch('/api/network-stats')
        if (!response.ok) throw new Error(`Błąd odpowiedzi: ${response.status}`)
        const json: unknown = await response.json()
        if (!isNetworkStats(json)) throw new Error('Nieoczekiwany kształt odpowiedzi')
        if (!cancelled) {
          setData(json)
          setError(null)
        }
        lastKnownStats = json
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Nieznany błąd')
      }
      if (cancelled) return
      timer = setTimeout(() => void tick(true), REFRESH_INTERVAL_MS)
    }

    void tick(false)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return { data, error }
}
