'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type SheetSnap = 'peek' | 'half' | 'full'

/** Ułamek wysokości obszaru, który arkusz zajmuje w danym punkcie zaczepienia. */
const SHEET_SNAPS: Record<SheetSnap, number> = { peek: 0.25, half: 0.55, full: 0.9 }
const DEFAULT_PEEK = SHEET_SNAPS.peek

/** Punkty zaczepienia z własnym `peek` (karta, której główne akcje muszą się zmieścić w niskim punkcie). */
function snapFractions(peek: number): Record<SheetSnap, number> {
  return { ...SHEET_SNAPS, peek }
}

const ORDER: SheetSnap[] = ['peek', 'half', 'full']
const SNAP_LABEL: Record<SheetSnap, string> = { peek: 'niski', half: 'do połowy', full: 'pełny' }
/** Po tylu ms bez zdarzenia `scroll` przewijanie uznajemy za zakończone (`scrollend` w Safari dopiero od 26). */
const SETTLE_MS = 120
/** Tyle razy (× `SETTLE_MS` ≈ 1 s) czekamy na dojazd animacji uchwytu do celu; potem to użytkownik przejął przeciąganie. */
const TARGET_PATIENCE_WAITS = 8

const InSheetContext = createContext(false)

/** Treść wie, że leży w arkuszu (telefon): `PanelFrame` bez własnego szkła, `AlertBanner` zwinięty. */
export function useInSheet(): boolean {
  return useContext(InSheetContext)
}

export function nextSnap(snap: SheetSnap): SheetSnap {
  return ORDER[(ORDER.indexOf(snap) + 1) % ORDER.length]
}

/** Punkt najbliższy pozycji przewinięcia; niezmierzony arkusz (`height` 0) = `peek`. */
export function nearestSnap(scrollTop: number, height: number, peek = DEFAULT_PEEK): SheetSnap {
  if (height <= 0) return 'peek'
  const at = scrollTop / height
  const snaps = snapFractions(peek)
  return ORDER.reduce((best, snap) => (Math.abs(snaps[snap] - at) < Math.abs(snaps[best] - at) ? snap : best))
}

/**
 * Arkusz od dołu z trzema punktami zaczepienia na natywnym CSS scroll-snap (zero zależności).
 * Kontener przewijania leży nad mapą z `pointer-events: none`, więc przezroczysta część
 * przepuszcza gesty do mapy, a przeciąganie samego panelu przewija kontener (przeglądarka
 * daje bezwładność i dociąga do punktu). CSS: `.bottom-sheet*` w `globals.css`.
 *
 * Semantyka okna (role="dialog", „×”, Escape, powrót fokusu) należy do treści — `PanelFrame`;
 * arkusz jej nie dubluje. Startuje w `initialSnap` (mapa: `peek`, „Info” tablicy: `half`);
 * nowy obiekt = nowy `key` u wywołującego.
 */
export function BottomSheet({
  children,
  initialSnap = 'peek',
  peek = DEFAULT_PEEK,
  above,
  onVisibleHeight,
}: {
  children: ReactNode
  initialSnap?: SheetSnap
  /**
   * Ułamek wysokości obszaru w punkcie `peek` (domyślnie 0,25; wyraźnie niżej niż `half`, 0,55). Wyższy tylko dla karty, której
   * główne akcje inaczej nie zmieściłyby się nad dolnym paskiem (karta pojazdu). Stały przez życie arkusza — inny = nowy `key`.
   */
  peek?: number
  /**
   * Treść przyklejona nad górną krawędzią panelu i jadąca razem z nim (statusy, chipy filtrów
   * mapy) — inaczej arkusz przy half/full by ją zakrył. Przy `full` mieści się ok. jeden rząd.
   */
  above?: ReactNode
  /**
   * Ile pikseli od dołu mapy zasłania arkusz: widoczny panel w danym punkcie + slot `above` (statusy, kontrolka lokalizacji).
   * Zgłaszane przy `peek` i `half` — po zmianie punktu (przy przeciąganiu dopiero po ustaniu przewijania) oraz zmianie
   * rozmiaru. Przy `full` NIE (świadome odstępstwo:kamera zostaje przy ostatniej wartości z `peek`/`half`).
   */
  onVisibleHeight?: (px: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const aboveRef = useRef<HTMLDivElement>(null)
  const [snap, setSnap] = useState<SheetSnap>(initialSnap)
  const snaps = snapFractions(peek)
  const onVisibleHeightRef = useRef(onVisibleHeight)
  useEffect(() => {
    onVisibleHeightRef.current = onVisibleHeight
  })
  // Cel trwającej animacji uchwytu: szybkie drugie dotknięcie idzie od niego dalej (peek → half → full).
  const targetRef = useRef<SheetSnap | null>(null)
  const waitsRef = useRef(0)
  const settleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(settleRef.current), [])

  useLayoutEffect(() => {
    const el = ref.current
    el?.scrollTo({ top: snaps[initialSnap] * el.clientHeight, behavior: 'instant' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- punkt startowy tylko przy montowaniu; inny = nowy `key`
  }, [])

  useEffect(() => {
    const el = ref.current
    if (el === null || snap === 'full') return
    const report = (): void => onVisibleHeightRef.current?.(Math.round(snapFractions(peek)[snap] * el.clientHeight + (aboveRef.current?.offsetHeight ?? 0)))
    report()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(report)
    observer.observe(el)
    if (aboveRef.current !== null) observer.observe(aboveRef.current)
    return () => observer.disconnect()
  }, [snap, peek])

  function cycle(): void {
    const el = ref.current
    if (el === null) return
    // Od rzeczywistej pozycji, nie od stanu — po przeciągnięciu stan mógł się jeszcze nie ustalić.
    const next = nextSnap(targetRef.current ?? nearestSnap(el.scrollTop, el.clientHeight, peek))
    targetRef.current = next
    waitsRef.current = 0
    setSnap(next)
    // Bez `behavior`: płynność decyduje CSS (`scroll-behavior` tylko bez prefers-reduced-motion).
    el.scrollTo({ top: snaps[next] * el.clientHeight })
  }

  /** Stan z pozycji dopiero po zatrzymaniu: w trakcie płynnego przewijania pozycja mija inne punkty. */
  function onScroll(): void {
    clearTimeout(settleRef.current)
    settleRef.current = setTimeout(settle, SETTLE_MS)
  }

  /**
   * Pod obciążeniem klatki animacji potrafią dzielić > `SETTLE_MS`: zegar „bez zdarzeń scroll” odpala się w pół drogi
   * i ustalał stan na mijanym punkcie (migotliwe e2e arkusza). Dopóki animacja uchwytu jedzie do celu,
   * czekamy dalej; po `TARGET_PATIENCE_WAITS` uznajemy, że przejął ją użytkownik.
   */
  function settle(): void {
    const el = ref.current
    if (el === null) return
    const target = targetRef.current
    if (target !== null && waitsRef.current < TARGET_PATIENCE_WAITS && Math.abs(el.scrollTop - snaps[target] * el.clientHeight) > 2) {
      waitsRef.current += 1
      settleRef.current = setTimeout(settle, SETTLE_MS)
      return
    }
    targetRef.current = null
    setSnap(nearestSnap(el.scrollTop, el.clientHeight, peek))
  }

  return (
    <div ref={ref} className="bottom-sheet" data-snap={snap} onScroll={onScroll}>
      <div className="bottom-sheet__spacer" aria-hidden="true">
        {ORDER.map((point) => (
          <span key={point} className="bottom-sheet__snap" style={{ top: `${snaps[point] * 100}%` }} />
        ))}
      </div>
      <div className="bottom-sheet__panel">
        {above !== undefined && (
          <div ref={aboveRef} className="bottom-sheet__above">
            {above}
          </div>
        )}
        <button type="button" className="bottom-sheet__handle" aria-label={`Zmień wysokość panelu (teraz: ${SNAP_LABEL[snap]})`} onClick={cycle}>
          <span className="bottom-sheet__grip" />
        </button>
        <div className="flex min-h-0 flex-1 flex-col">
          <InSheetContext.Provider value={true}>{children}</InSheetContext.Provider>
        </div>
      </div>
    </div>
  )
}
