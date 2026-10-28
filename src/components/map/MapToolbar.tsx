'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CloseIcon, AlertCircleIcon, SearchIcon, ShareIcon, ICON_SIZE } from '../icons'
import { MapMoreMenu } from './MapMoreMenu'
import { PinnedMenu, type PinnedPoint } from './MapPanels'

/** Aktywny przycisk = wypełnienie `--primary` (ADR 0011); w trybie wysokiego kontrastu tło znika, więc aktywny dostaje własny obrys. */
const TOOL_BUTTON =
  'glass-chrome border border-surface-border shadow-md control-44 inline-flex items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold text-foreground transition hover:bg-black/5 dark:hover:bg-white/10 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-fg aria-pressed:hover:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text forced-colors:aria-pressed:outline-2 forced-colors:aria-pressed:outline-[color:Highlight]'

/**
 * Kontrolki mapy nad nią: pole wyszukiwania (`search`) i przyciski. Stan i callbacki ma strona — tu tylko układ.
 * „Szukaj” rozwija istniejące pole pod kontrolkami; zwinięcie i zmiana szerokości zachowują jego stan.
 * Rodzaje transportu pozostają widoczne; ograniczenia dotyczą tylko wybranej linii i utrudnień.
 * Od `sm` pole ma w-80.
 */
export function MapToolbar({
  isWide,
  search,
  alertsOnly,
  onAlertsOnly,
  pinnedPoints,
  onOpenPinned,
  onShare,
}: {
  isWide: boolean
  search: ReactNode
  alertsOnly: boolean
  onAlertsOnly: (next: boolean) => void
  pinnedPoints: PinnedPoint[]
  onOpenPinned: (point: PinnedPoint) => void
  onShare: () => void
}) {
  const toolClass = isWide ? TOOL_BUTTON : `${TOOL_BUTTON} h-[44px] w-[44px] min-h-[44px]! min-w-[44px]! px-0!`
  const [searchOpen, setSearchOpen] = useState(false)
  const searchId = useId()
  const searchRef = useRef<HTMLDivElement>(null)
  const searchButtonRef = useRef<HTMLButtonElement>(null)
  const toggleSearch = () => {
    setSearchOpen((open) => !open)
    if (!searchOpen) requestAnimationFrame(() => searchRef.current?.querySelector('input')?.focus())
  }
  return (
    <div className="pointer-events-auto flex w-full flex-col gap-1.5">
      <div className="relative flex flex-wrap items-stretch gap-2">
        <button ref={searchButtonRef} type="button" data-map-search-trigger="" aria-expanded={searchOpen} aria-controls={searchId} onClick={toggleSearch} className={toolClass}>
          <SearchIcon size={ICON_SIZE.button} /><span className={isWide ? undefined : 'sr-only'}>Szukaj</span>
        </button>
        <button type="button" aria-pressed={alertsOnly} onClick={() => onAlertsOnly(!alertsOnly)} className={toolClass}>
          <AlertCircleIcon size={ICON_SIZE.button} /><span className={isWide ? undefined : 'sr-only'}>Z utrudnieniami</span>
        </button>
        <PinnedMenu pinnedItems={pinnedPoints} onOpen={onOpenPinned} />
        {isWide ? (
          <button type="button" onClick={onShare} aria-label="Udostępnij ten widok mapy" className={`${TOOL_BUTTON} control-44`}>
            <ShareIcon size={ICON_SIZE.button} />
          </button>
        ) : <MapMoreMenu onShare={onShare} />}
      </div>
      <div id={searchId} ref={searchRef} hidden={!searchOpen} className={isWide ? 'w-80 max-w-full' : 'w-full'} onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.preventDefault()
        event.stopPropagation()
        setSearchOpen(false)
        searchButtonRef.current?.focus()
      }}>{search}</div>

    </div>
  )
}

/** Czip jednego aktywnego ograniczenia z przyciskiem usunięcia. */
function Chip({ label, removeLabel, onRemove }: { label: string; removeLabel: string; onRemove: () => void }) {
  return (
    <li className="glass-chrome-strong border border-surface-border inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1 text-xs font-medium">
      {label}
      <button type="button" onClick={onRemove} aria-label={removeLabel} className="touch-44 relative -my-1 grid h-9 w-9 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10">
        <CloseIcon size={ICON_SIZE.chip} />
      </button>
    </li>
  )
}

/**
 * Aktywne ograniczenia jako usuwalne czipy + „Wyczyść filtry" (widoczne, gdy `activeFilterCount` > 0).
 * Osobny element, bo na telefonie z arkuszem leży w slocie `above` (przy krawędzi arkusza), a nie pod paskiem.
 */
export function ActiveFilterChips({
  line,
  alertsOnly,
  onClearLine,
  onAlertsOnly,
  onClear,
}: {
  line: { line: string } | null
  alertsOnly: boolean
  onClearLine: () => void
  onAlertsOnly: (next: boolean) => void
  onClear: () => void
}) {
  if (line === null && !alertsOnly) return null
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
      <ul className="flex flex-wrap gap-1.5" aria-label="Aktywne filtry">
        {line !== null && <Chip label={`Linia ${line.line}`} removeLabel={`Pokaż wszystkie linie zamiast linii ${line.line}`} onRemove={onClearLine} />}
        {alertsOnly && <Chip label="Tylko linie z utrudnieniami" removeLabel="Pokaż wszystkie linie, nie tylko z utrudnieniami" onRemove={() => onAlertsOnly(false)} />}
      </ul>
      <button type="button" onClick={onClear} className="chip-filter chip-filter-map px-3 text-xs font-semibold">
        Wyczyść filtry
      </button>
    </div>
  )
}

const FOCUSED_NOTICES = new WeakSet<object>()

/**
 * Wynik wyszukiwania bez pozycji na mapie: komunikat z linkiem do szczegółów (kamera się nie rusza). Klikany wiersz
 * wyników znika razem z panelem, a tu nie otwiera się karta — fokus idzie do komunikatu (nie do pola: na telefonie
 * wyskoczyłaby klawiatura). Nowy obiekt `notice` = nowy komunikat = nowy fokus. Bez `aria-label`: nazwą jest jego tekst,
 * a drugi odczyt etykiety przy fokusie byłby powtórką. Fokus tylko raz na obiekt `notice`: na telefonie komunikat jedzie w
 * slocie `above` arkusza z `key`, który przemontowuje go przy każdej zmianie panelu (np. „Lista") — przemontowanie tego samego
 * komunikatu nie kradnie fokusu.
 */
export function NoPositionNotice({ notice, onClose }: { notice: { name: string; href: string | null; linkLabel: string }; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (FOCUSED_NOTICES.has(notice)) return
    FOCUSED_NOTICES.add(notice)
    ref.current?.focus()
  }, [notice])
  return (
    <div
      ref={ref}
      role="status"
      tabIndex={-1}
      // `outline` (nie `ring`) przeżywa tryb wysokiego kontrastu — jak `ROW_FOCUS` w UnifiedSearch.
      className="glass-chrome-strong border border-surface-border pointer-events-auto flex w-max max-w-full items-center gap-x-3 rounded-xl py-1.5 pr-1 pl-3 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-text"
    >
      <span>
        Brak pozycji na mapie: {notice.name}.
        {notice.href !== null && (
          <>
            {' '}
            <Link href={notice.href} className="touch-44 relative font-medium text-primary-text underline underline-offset-2">
              {notice.linkLabel}
            </Link>
          </>
        )}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Zamknij komunikat"
        className="touch-44 relative grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
      >
        <CloseIcon size={ICON_SIZE.chip} />
      </button>
    </div>
  )
}
