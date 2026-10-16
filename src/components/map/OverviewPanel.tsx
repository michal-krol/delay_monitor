'use client'

import { useId } from 'react'
import { useScrollableFocus } from '@/hooks/useScrollableFocus'
import { formatSince } from '@/lib/format'
import { pluralPl } from '@/lib/plural'
import { CompactLegend } from './MapLegend'
import { OVERFLOW_HINT, VisibleListBody } from './MapPanels'
import { VISIBLE_LIMIT, type VisibleItem } from './mapData'

/** Stan odczytu pozycji pojazdów miasta; wiek bierzemy z widocznych pojazdów (GPS), nie z czasu pobrania odczytu. */
export type OverviewFeed = { state: 'loading' | 'ready' | 'failed' }

/** Mediana wieku GPS widocznych pojazdów; `null` = żaden widoczny pojazd nie ma wieku (nie zmyślamy, #7). */
export function medianPositionAgeSec(items: VisibleItem[] | null): number | null {
  const ages = (items ?? []).flatMap((item) => (item.kind === 'vehicle' && item.ageSec !== undefined ? [item.ageSec] : [])).sort((a, b) => a - b)
  if (ages.length === 0) return null
  const mid = ages.length >> 1
  return ages.length % 2 === 1 ? ages[mid] : Math.round((ages[mid - 1] + ages[mid]) / 2)
}

/** Jedno zdanie o pozycjach w kadrze; `null` = nic do powiedzenia (np. kadr jeszcze nieliczony). */
export function feedAgeNote({ state }: OverviewFeed, items: VisibleItem[] | null): string | null {
  const ageSec = medianPositionAgeSec(items)
  if (ageSec !== null) {
    const age = `Pozycje sprzed ${formatSince(ageSec)}`
    return state === 'failed' ? `Nie udało się odświeżyć · ${age}` : age
  }
  if (state === 'loading') return 'Wczytywanie pozycji pojazdów…'
  if (state === 'failed') return 'Nie udało się pobrać pozycji pojazdów'
  // Pusty kadr mówi już „Brak obiektów w kadrze" (podsumowanie) — drugi raz nie powtarzamy.
  return items !== null && items.length > 0 ? 'Brak pojazdów w widoku' : null
}

/** „1 pojazd · 2 przystanki · 1 stacja kolejowa"; zerowe części pomijamy. Przy przepełnieniu sumy nie znamy (limit, nie liczba). */
function counts(items: VisibleItem[]): string {
  const of = (kind: VisibleItem['kind']) => items.filter((item) => item.kind === kind).length
  const [vehicles, stops, rail] = [of('vehicle'), of('stop'), of('rail')]
  return [
    vehicles > 0 && `${vehicles} ${pluralPl(vehicles, 'pojazd', 'pojazdy', 'pojazdów')}`,
    stops > 0 && `${stops} ${pluralPl(stops, 'przystanek', 'przystanki', 'przystanków')}`,
    rail > 0 && `${rail} ${pluralPl(rail, 'stacja kolejowa', 'stacje kolejowe', 'stacji kolejowych')}`,
  ]
    .filter((part): part is string => part !== false)
    .join(' · ')
}

/**
 * Przegląd mapy na telefonie (arkusz w `peek`): co jest w kadrze, jak świeże są pozycje i skąd te kolory. To NIE jest
 * okno (`PanelFrame`): nie przejmuje fokusu, nie ma „×" ani Escape — mapa pod spodem zostaje w pełni używalna, a arkusz
 * po prostu pokazuje stan domyślny. Rozwinięty (half/full) pokazuje listę widocznych obiektów (`VisibleListBody`);
 * jedynym właścicielem przewijania jest `[data-sheet-scroll]` poniżej (blokowany poniżej `full`, `maps.md`).
 */
export function OverviewPanel({
  items,
  overflow,
  feed,
  onOpen,
  onClearFilters,
}: {
  /** `null` = mapa jeszcze nie policzyła kadru. */
  items: VisibleItem[] | null
  overflow: boolean
  feed: OverviewFeed
  onOpen: (item: VisibleItem) => void
  /** Podane tylko przy aktywnych filtrach: pusty kadr po filtrze oferuje ich wyczyszczenie. */
  onClearFilters?: () => void
}) {
  const headingId = useId()
  const [bodyRef, bodyTabIndex] = useScrollableFocus<HTMLDivElement>()
  const summary = items === null ? 'Liczę obiekty w kadrze…' : overflow ? `Pierwsze ${VISIBLE_LIMIT} obiektów` : items.length === 0 ? 'Brak obiektów w kadrze' : counts(items)
  const age = feedAgeNote(feed, items)

  return (
    <section aria-labelledby={headingId} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="px-4 pb-2">
        <h2 id={headingId} className="font-heading text-base font-bold leading-tight">
          Pojazdy i przystanki w widoku
        </h2>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-sm text-text-secondary">
          <span>{summary}</span>
          {age !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-text-muted">{age}</span>
            </>
          )}
        </p>
        {overflow && <p className="mt-0.5 text-xs text-text-muted">{OVERFLOW_HINT}</p>}
      </header>
      <div ref={bodyRef} data-sheet-scroll="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4" tabIndex={bodyTabIndex} aria-label="Obiekty w widoku">
        <CompactLegend />
        <div className="mt-3">
          <VisibleListBody items={items} overflow={overflow} onOpen={onOpen} onClearFilters={onClearFilters} overflowHint={false} />
        </div>
      </div>
    </section>
  )
}
