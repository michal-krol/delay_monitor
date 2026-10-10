'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { pinnedKey, type PinnedItem } from '@/hooks/usePinned'
import { ArrowDownIcon, ArrowUpIcon, ICON_SIZE, StarIcon, StopIcon, TrainIcon } from './icons'
import { ICON_BUTTON_CLASS, ICON_BUTTON_MD_SIZE } from './IconButton'

type Props = {
  pinnedItems: PinnedItem[]
  onMove: (key: string, delta: -1 | 1) => void
  onRemove: (key: string) => void
}

/**
 * Tryb „Edytuj ulubione": kolejność i odpinanie w jednym miejscu (karty nie mają już gwiazdki).
 * Przyciski „W górę”/„W dół” zamiast samego przeciągania — muszą działać z klawiatury.
 */
export function PinnedEditor({ pinnedItems, onMove, onRemove }: Props) {
  const listRef = useRef<HTMLOListElement>(null)
  // React przenosi węzeł `<li>` w DOM przy zamianie kolejności, a przeniesiony element gubi fokus —
  // po każdym przesunięciu oddajemy go temu samemu przyciskowi.
  const pendingFocus = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (pendingFocus.current === null) return
    listRef.current?.querySelector<HTMLElement>(`[data-move="${CSS.escape(pendingFocus.current)}"]`)?.focus()
    pendingFocus.current = null
  })

  function move(key: string, delta: -1 | 1): void {
    pendingFocus.current = `${key}|${delta}`
    onMove(key, delta)
  }

  return (
    <ol ref={listRef} aria-label="Kolejność przypiętych" className="glass divide-y divide-surface-border rounded-2xl border border-surface-border">
      {pinnedItems.map((pinnedItem, index) => {
        const key = pinnedKey(pinnedItem)
        return (
          <li key={key} className="flex items-center gap-2 py-2 pr-2 pl-4">
            {pinnedItem.kind === 'pkp' ? (
              <TrainIcon size={ICON_SIZE.button} label="stacja kolejowa" className="shrink-0 text-text-muted" />
            ) : (
              <StopIcon size={ICON_SIZE.button} label="przystanek komunikacji miejskiej" className="shrink-0 text-text-muted" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{pinnedItem.name}</span>
            <MoveButton label={`W górę: ${pinnedItem.name}`} id={`${key}|-1`} atEnd={index === 0} onClick={() => move(key, -1)}>
              <ArrowUpIcon size={ICON_SIZE.button} />
            </MoveButton>
            <MoveButton
              label={`W dół: ${pinnedItem.name}`}
              id={`${key}|1`}
              atEnd={index === pinnedItems.length - 1}
              onClick={() => move(key, 1)}
            >
              <ArrowDownIcon size={ICON_SIZE.button} />
            </MoveButton>
            <button
              type="button"
              aria-label={`Odepnij ze Startu:${pinnedItem.name}`}
              onClick={() => onRemove(key)}
              className={`${ICON_BUTTON_CLASS} ${ICON_BUTTON_MD_SIZE}`}
            >
              <StarIcon size={ICON_SIZE.button} filled />
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** `aria-disabled`, nie `disabled`: przycisk, który właśnie dojechał na kraniec, nie wypada z fokusu. */
function MoveButton({ label, id, atEnd, onClick, children }: { label: string; id: string; atEnd: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={atEnd || undefined}
      data-move={id}
      onClick={atEnd ? undefined : onClick}
      className={`${ICON_BUTTON_CLASS} ${ICON_BUTTON_MD_SIZE} aria-disabled:cursor-default aria-disabled:opacity-40`}
    >
      {children}
    </button>
  )
}
