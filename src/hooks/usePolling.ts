'use client'

import { useEffect, useRef, useState } from 'react'
import { readCached, writeCached } from './pollingCache'

export type PollingContext = { background: boolean }

export type UsePollingOptions<T> = {
  /**
   * `null` = brak cyklicznego odświeżania po gotowych danych (samo ponawianie przy `isLoading`/błędzie).
   * Funkcja = rytm zależny od wyniku, liczony z każdego udanego, pełnego (nie `isLoading`) pobrania
   * (np. wolne ponawianie tylko przy padniętym feedzie); nie steruje drabinką ani ponowieniem po
   * błędzie (`errorRetryMs` albo 30 s).
   */
  refreshMs: number | null | ((data: T) => number | null)
  /** `true`, dopóki dane są niepełne -- napędza drabinkę ponowień zamiast czekać `refreshMs`. */
  isLoading?: (data: T) => boolean
  /** Drabinka opóźnień (ms) podczas `isLoading`; domyślnie `[1,2,3,5,8,15]` s. */
  ladderMs?: number[]
  /** Opóźnienie ponowienia po błędzie. Domyślnie liczbowe `refreshMs`, inaczej 30 000. */
  errorRetryMs?: number
  /** `true` = obserwacja skończona (np. pociąg dojechał) -- koniec odpytywania do zmiany klucza. */
  isDone?: (data: T) => boolean
  initialData?: T
  /**
   * `true` = przy zmianie klucza (nie-`null` -> nie-`null`) hook zwraca dane
   * (i `lastSuccessAt`) poprzedniego klucza do pierwszego wyniku nowego;
   * pierwszy błąd nowego klucza też ich nie kasuje. `key -> null` zawsze resetuje.
   * Domyślnie `false` -- nowy klucz zaczyna od `initialData`.
   */
  keepPreviousData?: boolean
  /**
   * Niepusta nazwa = ostatni udany wynik każdego klucza żyje w pamięci modułu (do końca
   * sesji karty, z limitem `MAX_CACHED_ENTRIES`) i jest pokazywany od razu po ponownym
   * zamontowaniu widoku (np. powrót z `/connection/...` na tablicę stacji), zamiast pustego
   * ekranu. Pierwszy tik i tak leci od razu, więc dane odświeżają się w tle, a wiek liczy się
   * od pierwotnego sukcesu (`lastSuccessAt`, AGENTS.md #7). Wpis z `isDone` nie jest już
   * odpytywany.
   */
  cacheNamespace?: string
}

export type UsePollingResult<T> = {
  data: T | null
  error: string | null
  lastSuccessAt: number | null
}

const DEFAULT_LADDER_MS = [1000, 2000, 3000, 5000, 8000, 15000]
const DEFAULT_ERROR_RETRY_MS = 30_000

// Moment ostatniego udanego pobrania przez jakikolwiek `usePolling` (do banera offline).
let lastSuccessAtMs: number | null = null

/** Czas (ms epoch) ostatniego udanego pobrania w tej karcie; `null` = jeszcze żadnego. */
export function lastPollingSuccessAt(): number | null {
  return lastSuccessAtMs
}

/** Do testów: kasuje stan modułu współdzielony między przypadkami. */
export function __resetPollingSuccess(): void {
  lastSuccessAtMs = null
}

/** Mały helper: `fetch` + rzut na JSON, rzuca na nie-2xx (ten sam kształt błędu co w istniejących hookach). */
export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Błąd odpowiedzi: ${response.status}`)
  return (await response.json()) as T
}

type InternalState<T> = { key: string | null; data: T | null; error: string | null; lastSuccessAt: number | null }

/**
 * Wspólny silnik odpytywania: klucz + fetcher + drabinka ponowień + pauza na
 * ukrytej karcie.
 *
 * `key === null` = obserwacja wyłączona: dane resetują się do `initialData`,
 * hook nic nie odpytuje. Drabinka NIGDY się nie poddaje -- po jej wyczerpaniu
 * ponawia w rytmie liczbowego `refreshMs` (albo ostatniego stopnia drabinki, gdy
 * `refreshMs` to `null` lub funkcja).
 */
export function usePolling<T>(key: string | null, fetcher: (ctx: PollingContext) => Promise<T>, options: UsePollingOptions<T>): UsePollingResult<T> {
  const [state, setState] = useState<InternalState<T>>(() => {
    const cached = readCached<T>(options.cacheNamespace, key)
    return { key, data: cached?.data ?? options.initialData ?? null, error: null, lastSuccessAt: cached?.lastSuccessAt ?? null }
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

    // Zakończona obserwacja z cache (np. pociąg, który już dojechał): nic do odświeżania.
    const cached = readCached<T>(optionsRef.current.cacheNamespace, key)
    if (cached !== undefined && optionsRef.current.isDone?.(cached.data) === true) return

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
        lastSuccessAtMs = successAt
        writeCached(opts.cacheNamespace, key, { data: result, lastSuccessAt: successAt })
        setState({ key, data: result, error: null, lastSuccessAt: successAt })

        if (opts.isDone?.(result) === true) return

        const ladder = opts.ladderMs ?? DEFAULT_LADDER_MS
        if (opts.isLoading?.(result) === true) {
          // Ogon drabinki: tylko liczbowe `refreshMs` -- rytm z wyniku (np. 5 min) nie spowalnia ładowania.
          const tail = typeof opts.refreshMs === 'number' ? opts.refreshMs : ladder[ladder.length - 1]
          schedule(ladderIndex < ladder.length ? ladder[ladderIndex++] : tail)
          return
        }
        ladderIndex = 0
        const refreshMs = typeof opts.refreshMs === 'function' ? opts.refreshMs(result) : opts.refreshMs
        if (refreshMs !== null) schedule(refreshMs)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Nieznany błąd'
        const seeded = readCached<T>(opts.cacheNamespace, key)
        setState((s) =>
          s.key === key || (opts.keepPreviousData === true && s.key !== null)
            ? { ...s, key, error: message } // ten sam klucz (albo keepPreviousData) -- zachowaj ostatnie dobre dane (AGENTS.md #7)
            : { key, data: seeded?.data ?? opts.initialData ?? null, error: message, lastSuccessAt: seeded?.lastSuccessAt ?? null } // nowy klucz, jeszcze bez sukcesu -- nie przeciekają dane starego (własny cache tego klucza tak)
        )
        schedule(opts.errorRetryMs ?? (typeof opts.refreshMs === 'number' ? opts.refreshMs : DEFAULT_ERROR_RETRY_MS))
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

  if (state.key !== key) {
    // Cache własnego klucza wygrywa z danymi poprzedniego (`keepPreviousData`) i z `initialData`.
    const cached = readCached<T>(options.cacheNamespace, key)
    if (cached !== undefined) return { data: cached.data, error: null, lastSuccessAt: cached.lastSuccessAt }
    // Nowy klucz, efekt jeszcze nie zapisał wyniku: z keepPreviousData pokazujemy dane starego (o ile był).
    if (options.keepPreviousData === true && key !== null && state.key !== null) {
      return { data: state.data, error: null, lastSuccessAt: state.lastSuccessAt }
    }
    return { data: options.initialData ?? null, error: null, lastSuccessAt: null }
  }
  return { data: state.data, error: state.error, lastSuccessAt: state.lastSuccessAt }
}
