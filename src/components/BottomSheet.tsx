'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type SheetSnap = 'peek' | 'half' | 'full'

/** Ułamek wysokości obszaru, który arkusz zajmuje w danym punkcie zaczepienia. */
const SHEET_SNAPS: Record<SheetSnap, number> = { peek: 0.25, half: 0.55, full: 0.9 }

const ORDER: SheetSnap[] = ['peek', 'half', 'full']
const SNAP_LABEL: Record<SheetSnap, string> = { peek: 'niski', half: 'do połowy', full: 'pełny' }
/** Po tylu ms bez zdarzenia `scroll` przewijanie uznajemy za zakończone (`scrollend` w Safari dopiero od 26). */
const SETTLE_MS = 120

export function nextSnap(snap: SheetSnap): SheetSnap {
  return ORDER[(ORDER.indexOf(snap) + 1) % ORDER.length]
}

/** Punkt najbliższy pozycji przewinięcia; niezmierzony arkusz (`height` 0) = `peek`. */
export function nearestSnap(scrollTop: number, height: number): SheetSnap {
  if (height <= 0) return 'peek'
  const at = scrollTop / height
  return ORDER.reduce((best, snap) => (Math.abs(SHEET_SNAPS[snap] - at) < Math.abs(SHEET_SNAPS[best] - at) ? snap : best))
}

/**
 * Arkusz od dołu z trzema punktami zaczepienia na natywnym CSS scroll-snap (zero zależności).
 * Kontener przewijania leży nad mapą z `pointer-events: none`, więc przezroczysta część
 * przepuszcza gesty do mapy, a przeciąganie samego panelu przewija kontener (przeglądarka
 * daje bezwładność i dociąga do punktu). CSS: `.bottom-sheet*` w `globals.css`.
 *
 * Semantyka okna (role="dialog", „×”, Escape, powrót fokusu) należy do treści — `PanelFrame`;
 * arkusz jej nie dubluje. Zawsze startuje w `peek`; nowy obiekt = nowy `key` u wywołującego.
 */
export function BottomSheet({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [snap, setSnap] = useState<SheetSnap>('peek')
  // Cel trwającej animacji uchwytu: szybkie drugie dotknięcie idzie od niego dalej (peek → half → full).
  const targetRef = useRef<SheetSnap | null>(null)
  const settleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(settleRef.current), [])

  useLayoutEffect(() => {
    const el = ref.current
    el?.scrollTo({ top: SHEET_SNAPS.peek * el.clientHeight, behavior: 'instant' })
  }, [])

  function cycle(): void {
    const el = ref.current
    if (el === null) return
    // Od rzeczywistej pozycji, nie od stanu — po przeciągnięciu stan mógł się jeszcze nie ustalić.
    const next = nextSnap(targetRef.current ?? nearestSnap(el.scrollTop, el.clientHeight))
    targetRef.current = next
    setSnap(next)
    // Bez `behavior`: płynność decyduje CSS (`scroll-behavior` tylko bez prefers-reduced-motion).
    el.scrollTo({ top: SHEET_SNAPS[next] * el.clientHeight })
  }

  /** Stan z pozycji dopiero po zatrzymaniu: w trakcie płynnego przewijania pozycja mija inne punkty. */
  function onScroll(): void {
    clearTimeout(settleRef.current)
    settleRef.current = setTimeout(() => {
      const el = ref.current
      if (el === null) return
      targetRef.current = null
      setSnap(nearestSnap(el.scrollTop, el.clientHeight))
    }, SETTLE_MS)
  }

  return (
    <div ref={ref} className="bottom-sheet" data-snap={snap} onScroll={onScroll}>
      <div className="bottom-sheet__spacer" aria-hidden="true">
        {ORDER.map((point) => (
          <span key={point} className="bottom-sheet__snap" style={{ top: `${SHEET_SNAPS[point] * 100}%` }} />
        ))}
      </div>
      <div className="bottom-sheet__panel">
        <button type="button" className="bottom-sheet__handle" aria-label={`Zmień wysokość panelu (teraz: ${SNAP_LABEL[snap]})`} onClick={cycle}>
          <span className="bottom-sheet__grip" />
        </button>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}
