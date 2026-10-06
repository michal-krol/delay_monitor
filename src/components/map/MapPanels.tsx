'use client'

import { ArrowRightIcon, StarIcon, ICON_SIZE } from '../icons'
import { stopDisplayName } from '../stopName'
import { useTransitBoard } from '@/hooks/useTransitBoard'
import { type NearbyPoint, type VisibleItem } from './mapData'
import { ModeChip } from './ModeChip'
import { PanelFrame } from './PanelFrame'
import { useDropdown } from '@/hooks/useDropdown'

export const rowClass = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/10'

/** Metry po ludzku. */
function distanceLabel(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`
}

export function NearbyPanel({
  points,
  city,
  onOpen,
  onClose,
}: {
  points: NearbyPoint[]
  city: string
  onOpen: (point: NearbyPoint) => void
  onClose: () => void
}) {
  // Najbliższy odjazd z 3 najbliższych przystanków — jedno żądanie (rozkład, nie „na czas").
  const stopIds = points.flatMap((p) => (p.kind === 'stop' ? [p.stop.id] : [])).slice(0, 3)
  const { data } = useTransitBoard(stopIds.length > 0 ? city : null, stopIds, 1)
  const nextDeparture = new Map((data?.stops ?? []).flatMap((s) => (s === null ? [] : [[s.stopId, s.departures[0]] as const])))

  return (
    <PanelFrame title="W pobliżu" subtitle="Promień 500 m" closeLabel="Zamknij „W pobliżu”" onClose={onClose}>
      {points.length === 0 ? (
        <p className="p-1 text-sm text-text-secondary">Brak stacji i przystanków w promieniu 500 m.</p>
      ) : (
        <ul>
          {points.map((point) => {
            const [key, name, mode] =
              point.kind === 'rail' ? [`rail:${point.id}`, point.name, 'rail' as const] : [`stop:${point.stop.id}`, stopDisplayName(point.stop.name, point.stop.code), point.stop.mode]
            const departure = point.kind === 'stop' ? nextDeparture.get(point.stop.id) : undefined
            return (
              <li key={key}>
                <button type="button" onClick={() => onOpen(point)} className={rowClass}>
                  <ModeChip mode={mode} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{name}</span>
                    {departure !== undefined && (
                      <span className="block truncate text-xs text-text-muted">
                        rozkład: {departure.line} <ArrowRightIcon size={ICON_SIZE.inline} label="do" className="inline align-[-2px]" /> {departure.headsign ?? '—'} o {departure.plannedAt.slice(11, 16)}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-text-muted">{distanceLabel(point.distanceM)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </PanelFrame>
  )
}

const LIST_GROUPS: { kind: VisibleItem['kind']; title: string }[] = [
  { kind: 'rail', title: 'Stacje kolejowe' },
  { kind: 'stop', title: 'Przystanki' },
  { kind: 'vehicle', title: 'Pojazdy' },
]

/**
 * Tekstowa lista tego, co widać w kadrze — pełnoprawna ścieżka dla czytnika
 * ekranu do obiektów z canvasu i szybki przegląd „co tu jeździ". `items: null` =
 * mapa jeszcze nie policzyła kadru.
 */
export function VisibleListPanel({
  items,
  overflow,
  onOpen,
  onClose,
}: {
  items: VisibleItem[] | null
  overflow: boolean
  onOpen: (item: VisibleItem) => void
  onClose: () => void
}) {
  return (
    <PanelFrame title="W widoku" subtitle={items === null ? 'Liczę obiekty w kadrze…' : `${items.length}${overflow ? '+' : ''} obiektów`} closeLabel="Zamknij listę" onClose={onClose}>
      {items !== null && items.length === 0 && <p className="p-1 text-sm text-text-secondary">W tym kadrze nic nie widać — oddal albo przesuń mapę.</p>}
      {items !== null &&
        LIST_GROUPS.map(({ kind, title }) => {
          const group = items.filter((item) => item.kind === kind)
          if (group.length === 0) return null
          if (kind === 'vehicle') group.sort((a, b) => a.label.localeCompare(b.label, 'pl', { numeric: true }))
          return (
            <section key={kind} className="mb-2">
              <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
              <ul>
                {group.map((item) => (
                  <li key={`${item.kind}:${item.id}`}>
                    <button type="button" onClick={() => onOpen(item)} className={rowClass}>
                      <span className="min-w-0 flex-1 truncate">{kind === 'vehicle' ? `Linia ${item.label || '—'}` : item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      {overflow && <p className="p-2 text-xs text-text-muted">Pokazujemy pierwsze 100 — przybliż, żeby zobaczyć resztę.</p>}
    </PanelFrame>
  )
}

export type PinnedPoint = { key: string; name: string; lat: number; lon: number }

/** Szybki przeskok do przypiętych stacji/przystanków (te same co na Pulpicie). */
export function PinnedMenu({ pinnedItems, onOpen }: { pinnedItems: PinnedPoint[]; onOpen: (pinnedItem: PinnedPoint) => void }) {
  const { open, toggle, close, rootRef, panelId } = useDropdown({ focusTriggerOnEscape: false })
  if (pinnedItems.length === 0) return null
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Przypięte"
        onClick={toggle}
        className={`glass-chrome border border-surface-border shadow-md grid h-full min-h-11 w-11 place-items-center rounded-xl transition hover:bg-black/5 dark:hover:bg-white/10`}
      >
        <StarIcon size={ICON_SIZE.button} filled />
      </button>
      {open && (
        <ul id={panelId} aria-label="Przypięte" className="glass-chrome-strong border border-surface-border enter-pop absolute right-0 z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl p-2 shadow-xl">
          {pinnedItems.map((pinnedItem) => (
            <li key={pinnedItem.key}>
              <button
                type="button"
                onClick={() => {
                  close()
                  onOpen(pinnedItem)
                }}
                className={rowClass}
              >
                <span className="truncate">{pinnedItem.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
