'use client'

import { useEffect, useRef, useState } from 'react'

export type PollingContext = { background: boolean }

export type UsePollingOptions<T> = {
  /** `null` = brak cyklicznego odświeżania po gotowych danych (samo ponawianie przy `isLoading`/błędzie). */
  refreshMs: number | null
  /** `true`, dopóki dane są niepełne -- napędza drabinkę ponowień zamiast czekać `refreshMs`. */
  isLoading?: (data: T) => boolean
  /** Drabinka opóźnień (ms) podczas `isLoading`; domyślnie `[1,2,3,5,8,15]` s. */
  ladderMs?: number[]
  /** Opóźnienie ponowienia po błędzie. Domyślnie `refreshMs ?? 30 000`. */
  errorRetryMs?: number
  /** `true` = obserwacja skończona (np. pociąg dojechał) -- koniec odpytywania do zmiany klucza. */
  isDone?: (data: T) => boolean
  initialData?: T
}

export type UsePollingResult<T> = {
  data: T | null
  error: string | null
  lastSuccessAt: number | null
}

const DEFAULT_LADDER_MS = [1000, 2000, 3000, 5000, 8000, 15000]
const DEFAULT_ERROR_RETRY_MS = 30_000

/** Mały helper: `fetch` + rzut na JSON, rzuca na nie-2xx (ten sam kształt błędu co w istniejących hookach). */
export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Błąd odpowiedzi: ${response.status}`)
  return (await response.json()) as T
}

type InternalState<T> = { key: string | null; data: T | null; error: string | null; lastSuccessAt: number | null }

/**
 * Jeden wspólny silnik odpytywania: klucz + fetcher + drabinka ponowień +
 * pauza na ukrytej karcie -- docelowo zastępuje ręcznie powielony wzorzec
 * `setTimeout` + `document.hidden` w `useBoard`, `useTransitBoard`,
 * `useCityStats` i innych (plan PR 5, zadanie 3).
 *
 * `key === null` = obserwacja wyłączona: dane resetują się do `initialData`,
 * hook nic nie odpytuje. Drabinka NIGDY się nie poddaje -- po jej wyczerpaniu
 * ponawia w rytmie `refreshMs` (albo ostatniego stopnia drabinki, gdy
 * `refreshMs` to `null`); wcześniej część widoków po prostu przestawała
 * ponawiać po ~34 s, co jest błędem usuwanym przez ten hook.
 */
export function usePolling<T>(key: string | null, fetcher: (ctx: PollingContext) => Promise<T>, options: UsePollingOptions<T>): UsePollingResult<T> {
  const [state, setState] = useState<InternalState<T>>({
    key,
    data: options.initialData ?? null,
    error: null,
    lastSuccessAt: null,
  })

  // Najświeższe callbacki/opcje przez ref -- efekt niżej zależy TYLKO od
  // `key`, więc nowa referencja fetchera/opcji przy każdym renderze rodzica
  // nie przepina timerów ani nie zeruje postępu drabinki (patrz brief zadania 3).
  // Aktualizacja refów NIE może dziać się podczas renderu (`react-hooks/refs`)
  // -- stąd osobny efekt bez tablicy zależności, uruchamiany po każdym renderze.
  const fetcherRef = useRef(fetcher)
  const optionsRef = useRef(options)
  useEffect(() => {
    fetcherRef.current = fetcher
    optionsRef.current = options
  })

  useEffect(() => {
    if (key === null) {
      setState({ key: null, data: optionsRef.current.initialData ?? null, error: null, lastSuccessAt: null })
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let paused = false
    let ladderIndex = 0

    function schedule(delayMs: number): void {
      timer = setTimeout(() => void tick(true), delayMs)
    }

    async function tick(scheduled: boolean): Promise<void> {
      if (cancelled) return
      if (scheduled && document.hidden) {
        // Ukryta karta: żadnego fetcha i żadnego nowego timera -- czekamy na
        // `visibilitychange`, nie kręcimy zegarem w tle (właścicielska decyzja).
        paused = true
        return
      }
      paused = false

      const opts = optionsRef.current
      try {
        const result = await fetcherRef.current({ background: scheduled })
        if (cancelled) return
        const successAt = Date.now()
        setState({ key, data: result, error: null, lastSuccessAt: successAt })

        if (opts.isDone?.(result) === true) return

        const ladder = opts.ladderMs ?? DEFAULT_LADDER_MS
        if (opts.isLoading?.(result) === true) {
          const delay = ladderIndex < ladder.length ? ladder[ladderIndex++] : (opts.refreshMs ?? ladder[ladder.length - 1])
          schedule(delay)
          return
        }
        ladderIndex = 0
        if (opts.refreshMs !== null) schedule(opts.refreshMs)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Nieznany błąd'
        setState((s) =>
          s.key === key
            ? { ...s, error: message } // ten sam klucz -- zachowaj ostatnie dobre dane (AGENTS.md #7)
            : { key, data: opts.initialData ?? null, error: message, lastSuccessAt: null } // nowy klucz, jeszcze bez sukcesu -- nie przeciekają dane starego
        )
        schedule(opts.errorRetryMs ?? opts.refreshMs ?? DEFAULT_ERROR_RETRY_MS)
      }
    }

    function onVisibilityChange(): void {
      if (!document.hidden && paused) {
        paused = false
        clearTimeout(timer)
        void tick(true)
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    void tick(false)

    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [key])

  if (state.key !== key) return { data: options.initialData ?? null, error: null, lastSuccessAt: null }
  return { data: state.data, error: state.error, lastSuccessAt: state.lastSuccessAt }
}
