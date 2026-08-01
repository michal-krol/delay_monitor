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

export function StationSearch({ onSelect, placeholder }: Props) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<StationOption[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === '') {
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
        className="w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
        placeholder={placeholder ?? 'Szukaj stacji…'}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 w-full rounded border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
        >
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`cursor-pointer px-3 py-2 ${
                index === activeIndex ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
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
