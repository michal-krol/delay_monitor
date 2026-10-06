'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { GtfsMode } from '@/lib/gtfs/types'
import type { GtfsLine } from '@/lib/gtfs/query'
import { LineBadge } from './LineBadge'
import { MODE_ICON } from './transitMode'
import { ICON_SIZE } from './icons'

export type StationOption = {
  id: string
  name: string
  /** Bogatsze kafelki (ekran miasta): rodzaj + linie. Wszystko opcjonalne — Pulpit poda samo `{id,name}`. */
  kind?: 'rail' | 'transit'
  mode?: GtfsMode
  modes?: GtfsMode[]
  lines?: GtfsLine[]
  /** Pozycja wyniku (`/api/search`) — mapa przelatuje do niej po wyborze. */
  lat?: number
  lon?: number
}

type Props = {
  onSelect: (station: StationOption) => void
  placeholder?: string
  /**
   * Źródło podpowiedzi. Domyślnie stacje PKP; ekran miasta podaje tu
   * `/api/search?city=<id>&mode=<mode>`, który zwraca ten sam kształt `{ stations }`.
   * Może już nieść parametr zapytania — `q` dokładamy właściwym łącznikiem.
   */
  endpoint?: string
  /** Szeroka lista podpowiedzi (ekran miasta) — bez `max-w-md`. */
  wide?: boolean
  /**
   * `'dropdown'` (domyślnie): status i lista nakładają się na treść (`absolute`).
   * `'sheet'`: w normalnym przepływie, przewija je rodzic (arkusz wyszukiwania) — bez `max-w-md`.
   */
  variant?: 'dropdown' | 'sheet'
  /** Treść pod polem, dopóki zapytanie jest puste (arkusz: „Ostatnio oglądane"). */
  idle?: ReactNode
  autoFocus?: boolean
}

/** Wygląd pola wyszukiwania — wspólny dla stacji/przystanków, linii na mapie i listy linii. */
export const SEARCH_INPUT_CLASS =
  'glass w-full rounded-xl px-3.5 py-2.5 text-foreground placeholder:text-text-muted outline-none transition focus:ring-2 focus:ring-indigo-500'

const DEFAULT_ENDPOINT = '/api/stations'
const MAX_TILE_LINES = 6

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 3
/** Ponowienie, gdy endpoint zgłasza `loading` (rozkład miejski się wczytuje). */
const LOADING_RETRY_MS = 1500

type SearchStatus = 'idle' | 'searching' | 'ready' | 'error'

export function StationSearch({
  onSelect,
  placeholder,
  endpoint = DEFAULT_ENDPOINT,
  wide = false,
  variant = 'dropdown',
  idle,
  autoFocus = false,
}: Props) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<StationOption[]>([])
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [activeIndex, setActiveIndex] = useState(-1)
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const isOpen = status === 'ready' && options.length > 0

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale results when the query is too short
      setOptions([])
      setStatus('idle')
      return
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout>
    const separator = endpoint.includes('?') ? '&' : '?'
    const url = `${endpoint}${separator}q=${encodeURIComponent(trimmed)}`

    function run(): void {
      setStatus('searching')
      fetch(url)
        .then(async (response) => {
          if (!response.ok) throw new Error(`Błąd odpowiedzi: ${response.status}`)
          return (await response.json()) as { stations: StationOption[]; loading?: boolean }
        })
        .then((json) => {
          if (cancelled) return
          setOptions(json.stations)
          setActiveIndex(-1)
          // Rozkład miejski wciąż się wczytuje — wynik niepełny, ponawiamy.
          if (json.loading === true) {
            retryTimer = setTimeout(run, LOADING_RETRY_MS)
          } else {
            setStatus('ready')
          }
        })
        .catch(() => {
          if (cancelled) return
          setOptions([])
          setStatus('error')
        })
    }

    const timer = setTimeout(run, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      clearTimeout(timer)
    }
  }, [query, endpoint])

  function selectOption(option: StationOption): void {
    onSelect(option)
    setQuery('')
    setOptions([])
    setStatus('idle')
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Komunikat („Szukam…”, „Brak…”, błąd) też jest czymś do zamknięcia: zjadamy Escape, żeby panel
    // mapy (nasłuch na window) nie zamknął się tym samym klawiszem. Czyszczenie zapytania anuluje
    // też zapytanie w locie — samo `status = 'idle'` nadpisałaby spóźniona odpowiedź.
    if (event.key === 'Escape' && !isOpen && message !== null) {
      event.preventDefault()
      setQuery('')
      return
    }
    if (!isOpen) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < options.length) {
        event.preventDefault()
        selectOption(options[activeIndex])
      }
    } else if (event.key === 'Escape') {
      // Zjadamy Escape: panel mapy (nasłuch na window) nie ma się zamknąć tym samym klawiszem.
      event.preventDefault()
      setOptions([])
      setStatus('idle')
      setActiveIndex(-1)
    }
  }

  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined

  // Komunikat zamiast listy: rozróżnia "szukam", "nie ma takiej stacji"
  // i "nie udało się sprawdzić". Trzyma się poza <ul role="listbox">, żeby nie
  // udawać opcji, której nie da się wybrać.
  // Endpoint domyślny zwraca same stacje PKP; `/api/search?…` także przystanki miejskie.
  const stationsOnly = endpoint === DEFAULT_ENDPOINT
  const message =
    status === 'searching'
      ? 'Szukam…'
      : status === 'error'
        ? stationsOnly
          ? 'Nie udało się pobrać listy stacji'
          : 'Nie udało się wyszukać'
        : status === 'ready' && options.length === 0
          ? stationsOnly
            ? 'Brak stacji o tej nazwie'
            : 'Brak stacji ani przystanków o tej nazwie'
          : null

  const sheet = variant === 'sheet'
  // Arkusz: lista w przepływie (przewija ją rodzic); dropdown: nakłada się na treść poniżej.
  const layerClass = sheet ? 'mt-2' : 'absolute z-10 mt-2'

  return (
    <div className={`relative w-full ${wide || sheet ? '' : 'max-w-md'}`}>
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        autoFocus={autoFocus}
        role="combobox"
        // Nazwa dostępna: sam `placeholder` znika, gdy pole ma wartość, i część
        // czytników ekranu go nie czyta jako etykiety. `aria-autocomplete="list"`
        // mówi wprost, że podpowiedzi pojawiają się jako lista poniżej (wzorzec
        // WAI-ARIA APG combobox).
        aria-label={placeholder ?? 'Szukaj stacji'}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        // Arkusz ma własne „Zamknij ×" tuż obok — natywny „×" Chromium'a (type=search) dublowałby ikonę.
        className={sheet ? `${SEARCH_INPUT_CLASS} [&::-webkit-search-cancel-button]:appearance-none` : SEARCH_INPUT_CLASS}
        placeholder={placeholder ?? 'Szukaj stacji…'}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {message !== null && (
        <p
          role="status"
          className={`glass-chrome-strong border border-surface-border ${layerClass} w-full rounded-xl px-3.5 py-2 text-sm ${
            status === 'error' ? 'text-error-text' : 'text-text-secondary'
          }`}
        >
          {message}
        </p>
      )}
      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          className={`glass-chrome-strong border border-surface-border ${layerClass} w-full overflow-hidden rounded-xl py-1`}
        >
          {options.map((option, index) => {
            const Icon = option.mode ? MODE_ICON[option.mode] : null
            const lines = option.lines ?? []
            return (
              <li
                key={option.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                // Dostępna nazwa stabilna mimo bogatszej treści wizualnej.
                aria-label={option.name}
                aria-selected={index === activeIndex}
                className={`flex cursor-pointer min-h-11 items-center gap-2.5 px-3.5 py-2 text-sm transition ${
                  index === activeIndex ? 'text-white' : 'text-foreground hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                style={index === activeIndex ? { background: 'var(--accent-gradient)' } : undefined}
                // mousedown nie wybiera (przewijanie palcem), tylko trzyma fokus w polu, żeby lista
                // nie zniknęła przed `click`.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                {Icon !== null && <Icon size={ICON_SIZE.button} className="shrink-0 opacity-70" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.name}</span>
                  {option.kind === 'transit' && lines.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {lines.slice(0, MAX_TILE_LINES).map((entry) => (
                        <LineBadge key={entry.routeId} line={entry.line} mode={entry.mode} kind={entry.kind} size="sm" />
                      ))}
                      {lines.length > MAX_TILE_LINES && (
                        <span className="text-xs text-text-muted">+{lines.length - MAX_TILE_LINES}</span>
                      )}
                    </span>
                  )}
                  {option.kind === 'rail' && (
                    <span className={`block text-xs ${index === activeIndex ? 'text-white/70' : 'text-text-muted'}`}>
                      stacja kolejowa
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {query.trim() === '' && idle}
    </div>
  )
}
