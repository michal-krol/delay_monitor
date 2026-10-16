'use client'

import Link from 'next/link'
import { useEffect, useRef, type ReactNode } from 'react'
import { CloseIcon, ListIcon, ShareIcon, ICON_SIZE } from '../icons'
import { MapFilters } from './MapFilters'
import { MapMoreMenu } from './MapMoreMenu'
import { LAYER_LABEL, LAYER_MODE, activeFilterCount, toggleLayer, type LayerKey } from './mapData'
import { ModeChip } from './ModeChip'
import { PinnedMenu, type PinnedPoint } from './MapPanels'

/** Aktywny przycisk = wypełnienie `--primary` (ADR 0011); w trybie wysokiego kontrastu tło znika, więc aktywny dostaje własny obrys. */
const TOOL_BUTTON =
  'glass-chrome border border-surface-border shadow-md control-44 inline-flex items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold text-foreground transition hover:bg-black/5 dark:hover:bg-white/10 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-fg aria-pressed:hover:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text forced-colors:aria-pressed:outline-2 forced-colors:aria-pressed:outline-[color:Highlight]'

/**
 * Kontrolki mapy nad nią: pole wyszukiwania (`search`) i przyciski. Stan i callbacki ma strona — tu tylko układ.
 * Telefon: pole na całą szerokość, pod nim „Lista" i „Filtry" (zawsze widoczne, 44 px), „Przypięte" i „Więcej"
 * (tylko „Udostępnij"), niżej czipy rodzajów pojazdów (te same przełączniki `hidden` co „Filtry").
 * Od `sm`: pole (w-80) i rząd przycisków obok siebie, bez czipów (te same warstwy są w „Filtry").
 */
export function MapToolbar({
  isWide,
  search,
  hidden,
  vehicleLayers,
  onHiddenChange,
  alertsOnly,
  onAlertsOnly,
  lineActive,
  listOpen,
  onToggleList,
  pinnedPoints,
  onOpenPinned,
  onShare,
}: {
  isWide: boolean
  search: ReactNode
  hidden: ReadonlySet<LayerKey>
  /** Rodzaje pojazdów obecne w danych miasta — czipy i panel „Filtry" nie pokazują pustych warstw. */
  vehicleLayers: LayerKey[]
  onHiddenChange: (next: Set<LayerKey>) => void
  alertsOnly: boolean
  onAlertsOnly: (next: boolean) => void
  /** Wybrana linia — liczy się do licznika „Filtry". */
  lineActive: boolean
  listOpen: boolean
  onToggleList: () => void
  pinnedPoints: PinnedPoint[]
  onOpenPinned: (point: PinnedPoint) => void
  onShare: () => void
}) {
  const listButton = (className = '') => (
    <button type="button" aria-pressed={listOpen} onClick={onToggleList} className={`${TOOL_BUTTON} ${className}`}>
      <ListIcon size={ICON_SIZE.button} />
      Lista
    </button>
  )
  const filters = (className = '') => (
    <MapFilters
      hidden={hidden}
      vehicleLayers={vehicleLayers}
      onChange={onHiddenChange}
      alertsOnly={alertsOnly}
      onAlertsOnly={onAlertsOnly}
      lineActive={lineActive}
      className={className}
    />
  )

  if (isWide) {
    return (
      <div className="pointer-events-auto flex flex-wrap items-stretch gap-2">
        <div className="w-80">{search}</div>
        <div className="flex gap-2">
          {listButton()}
          <PinnedMenu pinnedItems={pinnedPoints} onOpen={onOpenPinned} />
          {filters()}
          <button
            type="button"
            onClick={onShare}
            aria-label="Udostępnij ten widok mapy"
            className="glass-chrome border border-surface-border shadow-md control-44 grid place-items-center rounded-xl text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ShareIcon size={ICON_SIZE.button} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-auto flex w-full flex-col gap-1.5">
      {search}
      {/* `relative`: panel „Filtry" rozciąga się na ten rząd (ich przycisk leży w środku, nie przy prawej krawędzi). */}
      <div className="relative flex items-stretch gap-2">
        {listButton('flex-1')}
        {filters('flex-1')}
        <PinnedMenu pinnedItems={pinnedPoints} onOpen={onOpenPinned} />
        <MapMoreMenu onShare={onShare} />
      </div>
      {vehicleLayers.length > 0 && (
        // Czipy = szybkie przełączniki TEGO SAMEGO zbioru `hidden` co panel „Filtry" (pressed = warstwa widoczna).
        // Przewijane w poziomie, gdy cztery rodzaje się nie mieszczą (375 px); `p-1` (offset 2 + obrys 2 px) żeby obrys fokusu nie był ucięty przez przewijany kontener.
        <div role="group" aria-label="Rodzaje pojazdów" className="flex gap-2 overflow-x-auto p-1 [scrollbar-width:none]">
          {vehicleLayers.map((key) => (
            <button key={key} type="button" aria-pressed={!hidden.has(key)} onClick={() => onHiddenChange(toggleLayer(hidden, key))} className="chip-filter shrink-0 gap-2 px-3">
              <ModeChip mode={LAYER_MODE[key]} />
              {LAYER_LABEL[key]}
            </button>
          ))}
        </div>
      )}
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
  hidden,
  line,
  alertsOnly,
  onClearLine,
  onAlertsOnly,
  onHiddenChange,
  onClear,
}: {
  hidden: ReadonlySet<LayerKey>
  line: { line: string } | null
  alertsOnly: boolean
  onClearLine: () => void
  onAlertsOnly: (next: boolean) => void
  onHiddenChange: (next: Set<LayerKey>) => void
  onClear: () => void
}) {
  if (activeFilterCount({ hidden, line: line !== null, alertsOnly }) === 0) return null
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
      <ul className="flex flex-wrap gap-1.5" aria-label="Aktywne filtry">
        {line !== null && <Chip label={`Linia ${line.line}`} removeLabel={`Pokaż wszystkie linie zamiast linii ${line.line}`} onRemove={onClearLine} />}
        {alertsOnly && <Chip label="Tylko linie z utrudnieniami" removeLabel="Pokaż wszystkie linie, nie tylko z utrudnieniami" onRemove={() => onAlertsOnly(false)} />}
        {[...hidden].map((key) => (
          <Chip
            key={key}
            label={`Ukryte: ${LAYER_LABEL[key].toLowerCase()}`}
            removeLabel={`Pokaż: ${LAYER_LABEL[key].toLowerCase()}`}
            onRemove={() => onHiddenChange(toggleLayer(hidden, key))}
          />
        ))}
      </ul>
      <button type="button" onClick={onClear} className="chip-filter px-3 text-xs font-semibold">
        Wyczyść filtry
      </button>
    </div>
  )
}

/**
 * Wynik wyszukiwania bez pozycji na mapie: komunikat z linkiem do szczegółów (kamera się nie rusza). Klikany wiersz
 * wyników znika razem z panelem, a tu nie otwiera się karta — fokus idzie do komunikatu (nie do pola: na telefonie
 * wyskoczyłaby klawiatura). Nowy obiekt `notice` = nowy komunikat = nowy fokus. Bez `aria-label`: nazwą jest jego tekst,
 * a drugi odczyt etykiety przy fokusie byłby powtórką.
 */
export function NoPositionNotice({ notice, onClose }: { notice: { name: string; href: string | null; linkLabel: string }; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
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
