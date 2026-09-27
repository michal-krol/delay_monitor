'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CloseIcon, StarIcon } from '../icons'
import { MODE_ICON } from '../transitMode'
import { useTransitBoard } from '@/hooks/useTransitBoard'
import type { GtfsMode } from '@/lib/gtfs/types'
import { MODE_COLOR, type NearbyPoint, type VisibleItem } from './mapData'

/**
 * Panele dodatkowe mapy w dokowanym miejscu karty (spec §15 + dodatki
 * 2026-09-26): „co jest w pobliżu" i lista obiektów w kadrze. Wspólna rama
 * z kartą obiektu — niemodalny dialog z fokusem na nagłówku i „×".
 */
function PanelFrame({ title, subtitle, closeLabel, onClose, children }: { title: string; subtitle?: string; closeLabel: string; onClose: () => void; children: ReactNode }) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])
  return (
    <section role="dialog" aria-modal="false" aria-labelledby={headingId} className="glass-strong flex max-h-full flex-col overflow-hidden rounded-2xl shadow-xl">
      <header className="flex items-start gap-3 border-b p-4" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="min-w-0 flex-1">
          <h2 ref={headingRef} id={headingId} tabIndex={-1} className="font-heading text-lg font-bold leading-tight outline-none">
            {title}
          </h2>
          {subtitle !== undefined && <p className="mt-0.5 text-sm text-text-secondary">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-secondary transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          <CloseIcon size={16} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3" tabIndex={0} aria-label={title}>
        {children}
      </div>
    </section>
  )
}

function ModeChip({ mode }: { mode: GtfsMode }) {
  const Icon = MODE_ICON[mode]
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white" style={{ background: MODE_COLOR[mode] }} aria-hidden="true">
      <Icon size={14} />
    </span>
  )
}

const rowClass = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/10'

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
              point.kind === 'rail' ? [`rail:${point.id}`, point.name, 'rail' as const] : [`stop:${point.stop.id}`, point.stop.code !== null && !point.stop.name.endsWith(point.stop.code) ? `${point.stop.name} ${point.stop.code}` : point.stop.name, point.stop.mode]
            const departure = point.kind === 'stop' ? nextDeparture.get(point.stop.id) : undefined
            return (
              <li key={key}>
                <button type="button" onClick={() => onOpen(point)} className={rowClass}>
                  <ModeChip mode={mode} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{name}</span>
                    {departure !== undefined && (
                      <span className="block truncate text-xs text-text-muted">
                        rozkład: {departure.line} → {departure.headsign ?? '—'} o {departure.plannedAt.slice(11, 16)}
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

export type FavouritePoint = { key: string; name: string; lat: number; lon: number }

/** Szybki przeskok do ulubionych stacji/przystanków (te same co na Pulpicie). */
export function FavouritesMenu({ favourites, onOpen }: { favourites: FavouritePoint[]; onOpen: (favourite: FavouritePoint) => void }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointer = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])
  if (favourites.length === 0) return null
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Ulubione"
        onClick={() => setOpen((o) => !o)}
        className="glass grid h-full min-h-11 w-11 place-items-center rounded-xl text-amber-500 transition hover:bg-black/5 dark:hover:bg-white/10"
      >
        <StarIcon size={16} />
      </button>
      {open && (
        <ul id={panelId} aria-label="Ulubione" className="glass-strong absolute right-0 z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl p-2 shadow-xl">
          {favourites.map((favourite) => (
            <li key={favourite.key}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onOpen(favourite)
                }}
                className={rowClass}
              >
                <span className="truncate">{favourite.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
