'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

export type StationOption = {
  id: string
  name: string
}

type Props = {
  onSelect: (station: StationOption) => void
  placeholder?: string
}

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 3

export function StationSearch({ onSelect, placeholder }: Props) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<StationOption[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale results when the query is too short
      setOptions([])
      setIsOpen(false)
      return
    }

    const timer = setTimeout(() => {
      fetch(`/api/stations?q=${encodeURIComponent(trimmed)}`)
        .then((response) => response.json())
        .then((json: { stations: StationOption[] }) => {
          setOptions(json.stations)
          setIsOpen(json.stations.length > 0)
          setActiveIndex(-1)
        })
        .catch(() => {
          setOptions([])
          setIsOpen(false)
        })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  function selectOption(option: StationOption): void {
    onSelect(option)
    setQuery('')
    setOptions([])
    setIsOpen(false)
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
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
      setIsOpen(false)
      setActiveIndex(-1)
    }
  }

  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined

  return (
    <div className="relative w-full max-w-md">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        className="glass w-full rounded-xl px-3.5 py-2.5 text-gray-900 placeholder:text-gray-500 outline-none transition focus:ring-2 focus:ring-indigo-500 dark:text-gray-100 dark:placeholder:text-gray-400"
        placeholder={placeholder ?? 'Szukaj stacji…'}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          className="glass-strong absolute z-10 mt-2 w-full overflow-hidden rounded-xl py-1"
        >
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`cursor-pointer px-3.5 py-2 text-sm transition ${
                index === activeIndex
                  ? 'bg-indigo-500 text-white'
                  : 'text-gray-800 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10'
              }`}
              onMouseDown={(event) => {
                event.preventDefault()
                selectOption(option)
              }}
            >
              {option.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
