'use client'

import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { LineBadge } from '../LineBadge'
import { SEARCH_INPUT_CLASS } from '../StationSearch'
import type { LineListEntry } from '@/lib/gtfs/query'
import { normalizeForSearch } from '@/lib/search'

const MAX_OPTIONS = 8

/**
 * Wyszukiwarka LINII (osobna od wyszukiwarki miejsc, spec §6) — combobox
 * WAI-ARIA na liście linii miasta pobranej raz (`/api/gtfs/lines`, ~300 pozycji),
 * filtrowanej lokalnie. Numer dopasowany od początku przed dopasowaniem w nazwie,
 * więc „20" daje linię 20 przed 120 (stary filtr podciągiem tego nie robił).
 */
export function LineSearch({
  lines,
  onSelect,
  className = '',
}: {
  /** `null` = lista jeszcze się wczytuje (pole działa, pokazuje „Wczytywanie…"). */
  lines: LineListEntry[] | null
  onSelect: (line: LineListEntry) => void
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const listboxId = useId()

  const needle = normalizeForSearch(query.trim())
  const options = useMemo(() => {
    if (needle === '' || lines === null) return []
    const exact: LineListEntry[] = []
    const prefix: LineListEntry[] = []
    const other: LineListEntry[] = []
    for (const line of lines) {
      const number = normalizeForSearch(line.line)
      if (number === needle) exact.push(line)
      else if (number.startsWith(needle)) prefix.push(line)
      else if (normalizeForSearch(line.longName).includes(needle)) other.push(line)
    }
    return [...exact, ...prefix, ...other].slice(0, MAX_OPTIONS)
  }, [needle, lines])

  const isOpen = options.length > 0
  const message = needle === '' ? null : lines === null ? 'Wczytywanie linii…' : options.length === 0 ? 'Nie znaleziono linii' : null

  function choose(line: LineListEntry): void {
    onSelect(line)
    setQuery('')
    setActiveIndex(-1)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      if (query !== '') event.preventDefault() // jest co wyczyścić — Escape nie zamyka panelu
      setQuery('')
      setActiveIndex(-1)
      return
    }
    if (!isOpen) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(options[Math.max(activeIndex, 0)])
    }
  }

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        role="combobox"
        aria-label="Szukaj linii"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder="Szukaj linii…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActiveIndex(-1)
        }}
        onKeyDown={onKeyDown}
        className={SEARCH_INPUT_CLASS}
      />
      {message !== null && (
        <p role="status" className="glass-chrome-strong border border-surface-border enter-pop absolute z-20 mt-2 w-full rounded-xl px-3.5 py-2 text-sm text-text-secondary">
          {message}
        </p>
      )}
      {isOpen && (
        <ul id={listboxId} role="listbox" aria-label="Linie" className="glass-chrome-strong border border-surface-border enter-pop absolute z-20 mt-2 w-full overflow-hidden rounded-xl py-1">
          {options.map((line, index) => (
            <li
              key={line.routeId}
              id={`${listboxId}-${index}`}
              role="option"
              aria-label={`Linia ${line.line}${line.longName !== '' ? `, ${line.longName}` : ''}`}
              aria-selected={index === activeIndex}
              className={`flex min-h-11 cursor-pointer items-center gap-2.5 px-3.5 py-2 text-sm ${
                index === activeIndex ? 'bg-black/5 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`}
              onMouseDown={(event) => {
                event.preventDefault()
                choose(line)
              }}
            >
              <LineBadge line={line.line} mode={line.mode} kind={line.kind} size="sm" />
              <span className="truncate text-text-secondary">{line.longName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
